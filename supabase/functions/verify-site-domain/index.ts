import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EXPECTED_A_RECORDS = (Deno.env.get("SITE_CONNECTOR_EXPECTED_A") ?? "185.158.133.1")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const EXPECTED_CNAME_RECORDS = (Deno.env.get("SITE_CONNECTOR_EXPECTED_CNAME") ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase().replace(/\.$/, ""))
  .filter(Boolean);

const VERIFY_TXT_PREFIX = (Deno.env.get("SITE_CONNECTOR_VERIFY_TXT_PREFIX") ?? "_verify")
  .trim()
  .replace(/\.$/, "");

type DomainDnsStatus = "pending" | "verified" | "failed";
type DomainSslStatus = "pending" | "active" | "expired" | "failed";

interface SiteDnsRecord {
  type: string;
  name: string;
  value: string;
  verified: boolean;
}

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

const getBearerToken = (request: Request) => {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
};

const resolveUserId = async (request: Request) => {
  const token = getBearerToken(request);
  if (!token) {
    throw new Error("Unauthorized: missing bearer token");
  }

  let userId = "";

  if (SUPABASE_ANON_KEY) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data, error } = await userClient.auth.getUser();
    if (!error && data?.user?.id) {
      userId = data.user.id;
    }
  }

  if (!userId) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user?.id) {
      throw new Error("Unauthorized: invalid token");
    }
    userId = data.user.id;
  }

  return userId;
};

const normalizeRecordType = (value: unknown) => String(value || "").trim().toUpperCase();
const normalizeRecordValue = (value: unknown) => String(value || "").trim();
const normalizeHostname = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");

const normalizeTxtValue = (value: string) =>
  value
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/"\s*"/g, "")
    .toLowerCase();

const normalizeDnsRecords = (value: unknown): SiteDnsRecord[] => {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      type: normalizeRecordType(record.type || "A"),
      name: String(record.name || "@").trim(),
      value: normalizeRecordValue(record.value),
      verified: Boolean(record.verified),
    };
  });
};

const DNS_PROVIDERS = [
  "https://dns.google/resolve",
  "https://cloudflare-dns.com/dns-query",
];

const queryDns = async (name: string, type: "A" | "CNAME" | "TXT"): Promise<string[]> => {
  for (const provider of DNS_PROVIDERS) {
    const url = `${provider}?name=${encodeURIComponent(name)}&type=${type}`;
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/dns-json",
        },
      });
      if (!response.ok) continue;

      const payload = await response.json();
      const answers = Array.isArray(payload?.Answer) ? payload.Answer : [];
      const result = answers
        .map((answer: any) => String(answer?.data || "").trim())
        .filter(Boolean);

      if (result.length > 0) return result;

      if (Number(payload?.Status) === 0) return [];
    } catch {
      // Try next provider.
    }
  }
  return [];
};

const checkHttpsReachable = async (domain: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(`https://${domain}`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });

    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const inferDnsStatus = (dnsVerified: boolean, hasAnyObservation: boolean): DomainDnsStatus => {
  if (dnsVerified) return "verified";
  return hasAnyObservation ? "failed" : "pending";
};

const inferSslStatus = (dnsStatus: DomainDnsStatus, httpsReachable: boolean): DomainSslStatus => {
  if (dnsStatus === "verified" && httpsReachable) return "active";
  if (dnsStatus === "verified") return "pending";
  if (dnsStatus === "pending") return "pending";
  return "failed";
};

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const userId = await resolveUserId(request);
    const payload = await request.json().catch(() => ({}));
    const domainId = String(payload?.domainId || "").trim();
    if (!domainId) {
      return jsonResponse({ error: "domainId is required" }, 400);
    }

    const { data: row, error: loadError } = await admin
      .from("site_domains")
      .select("id, user_id, domain, dns_records, linked_page_id, ssl_status, dns_status, created_at, updated_at, type")
      .eq("id", domainId)
      .eq("user_id", userId)
      .maybeSingle();

    if (loadError) {
      return jsonResponse({ error: loadError.message }, 400);
    }
    if (!row) {
      return jsonResponse({ error: "Domain not found" }, 404);
    }

    const domain = normalizeHostname(row.domain);
    if (!domain) {
      return jsonResponse({ error: "Invalid domain" }, 400);
    }

    const existingRecords = normalizeDnsRecords(row.dns_records);
    const txtRecord = existingRecords.find((record) => normalizeRecordType(record.type) === "TXT");
    const expectedTxtToken = txtRecord?.value ? normalizeTxtValue(txtRecord.value) : "";
    const txtHost = `${VERIFY_TXT_PREFIX}.${domain}`.replace(/\.\.+/g, ".");

    const observedA = (await queryDns(domain, "A")).map((value) => value.trim());
    const observedCname = (await queryDns(domain, "CNAME")).map((value) =>
      normalizeHostname(value)
    );
    const observedTxt = (await queryDns(txtHost, "TXT")).map((value) => normalizeTxtValue(value));

    const hasExpectedA =
      EXPECTED_A_RECORDS.length > 0 &&
      observedA.some((value) => EXPECTED_A_RECORDS.includes(value));

    const hasExpectedCname =
      EXPECTED_CNAME_RECORDS.length > 0 &&
      observedCname.some((value) => EXPECTED_CNAME_RECORDS.includes(value));

    const routingVerified = hasExpectedA || hasExpectedCname;
    const txtVerified = expectedTxtToken ? observedTxt.includes(expectedTxtToken) : true;
    const dnsVerified = routingVerified && txtVerified;
    const hasAnyObservation = observedA.length > 0 || observedCname.length > 0 || observedTxt.length > 0;
    const dnsStatus = inferDnsStatus(dnsVerified, hasAnyObservation);

    const httpsReachable = dnsStatus === "verified" ? await checkHttpsReachable(domain) : false;
    const sslStatus = inferSslStatus(dnsStatus, httpsReachable);

    const updatedRecords = existingRecords.map((record) => {
      const type = normalizeRecordType(record.type);
      const value = normalizeRecordValue(record.value);

      if (type === "A") {
        const valueSeen = observedA.includes(value);
        const valueExpected = EXPECTED_A_RECORDS.length === 0 || EXPECTED_A_RECORDS.includes(value);
        return { ...record, verified: valueSeen && valueExpected };
      }

      if (type === "CNAME") {
        const normalizedValue = normalizeHostname(value);
        const valueSeen = observedCname.includes(normalizedValue);
        const valueExpected =
          EXPECTED_CNAME_RECORDS.length === 0 || EXPECTED_CNAME_RECORDS.includes(normalizedValue);
        return { ...record, verified: valueSeen && valueExpected };
      }

      if (type === "TXT") {
        return { ...record, verified: observedTxt.includes(normalizeTxtValue(value)) };
      }

      return { ...record, verified: false };
    });

    const { data: updated, error: updateError } = await admin
      .from("site_domains")
      .update({
        dns_status: dnsStatus,
        ssl_status: sslStatus,
        dns_records: updatedRecords,
        updated_at: new Date().toISOString(),
      })
      .eq("id", domainId)
      .eq("user_id", userId)
      .select("id, domain, type, ssl_status, dns_status, dns_records, linked_page_id, created_at, updated_at")
      .single();

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 400);
    }

    return jsonResponse({
      success: true,
      domain: updated,
      checks: {
        expected: {
          a: EXPECTED_A_RECORDS,
          cname: EXPECTED_CNAME_RECORDS,
          txt: expectedTxtToken || null,
          txtHost,
        },
        observed: {
          a: observedA,
          cname: observedCname,
          txt: observedTxt,
        },
        routingVerified,
        txtVerified,
        dnsVerified,
        httpsReachable,
      },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = message.toLowerCase().startsWith("unauthorized") ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
