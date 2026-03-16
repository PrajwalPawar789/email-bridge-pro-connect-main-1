import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse } from "npm:tldts@7.0.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const VERCEL_TOKEN = Deno.env.get("VERCEL_TOKEN") ?? "";
const VERCEL_PROJECT_ID_OR_NAME = Deno.env.get("VERCEL_PROJECT_ID_OR_NAME") ?? "";
const VERCEL_TEAM_ID = Deno.env.get("VERCEL_TEAM_ID") ?? "";
const VERCEL_TEAM_SLUG = Deno.env.get("VERCEL_TEAM_SLUG") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const hasVercelProvider = Boolean(VERCEL_TOKEN && VERCEL_PROJECT_ID_OR_NAME);

type DomainDnsStatus = "pending" | "verified" | "failed";
type DomainSslStatus = "pending" | "active" | "expired" | "failed";

interface SiteDnsRecord {
  type: string;
  name: string;
  value: string;
  verified: boolean;
}

interface VercelVerificationRecord {
  type?: string;
  domain?: string;
  value?: string;
  reason?: string;
}

interface VercelProjectDomain {
  name?: string;
  apexName?: string;
  verified?: boolean;
  verification?: VercelVerificationRecord[];
}

interface RankedIpv4Record {
  rank?: number;
  value?: string[];
}

interface RankedCnameRecord {
  rank?: number;
  value?: string;
}

interface VercelDomainConfig {
  configuredBy?: "CNAME" | "A" | "http" | "dns-01" | null;
  recommendedIPv4?: RankedIpv4Record[];
  recommendedCNAME?: RankedCnameRecord[];
  misconfigured?: boolean;
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

const getDomainParts = (domain: string) => {
  const normalizedDomain = normalizeHostname(domain);
  const parsed = parse(normalizedDomain, {
    allowPrivateDomains: true,
    extractHostname: true,
  });

  return {
    normalizedDomain,
    zoneRoot: normalizeHostname(parsed.domain || normalizedDomain),
    hostLabel: normalizeHostname(parsed.subdomain || ""),
  };
};

const resolveDnsRecordHost = (domain: string, recordName: string) => {
  const { normalizedDomain, zoneRoot } = getDomainParts(domain);
  const normalizedName = normalizeHostname(recordName);
  if (!normalizedName || normalizedName === "@") return normalizedDomain;

  if (normalizedName === zoneRoot || normalizedName.endsWith(`.${zoneRoot}`)) {
    return normalizedName;
  }

  return `${normalizedName}.${zoneRoot}`.replace(/\.\.+/g, ".");
};

const normalizeRecordExpectation = (type: "A" | "CNAME" | "TXT", value: string) => {
  if (type === "TXT") return normalizeTxtValue(value);
  if (type === "CNAME") return normalizeHostname(value);
  return value.trim();
};

const getPreferredIpv4 = (config: VercelDomainConfig | null) => {
  const records = Array.isArray(config?.recommendedIPv4) ? [...config.recommendedIPv4] : [];
  const preferred = records
    .sort((left, right) => Number(left?.rank ?? Number.MAX_SAFE_INTEGER) - Number(right?.rank ?? Number.MAX_SAFE_INTEGER))
    .find((entry) => Array.isArray(entry?.value) && entry.value.length > 0);
  return preferred?.value?.[0]?.trim() || "";
};

const getPreferredCname = (config: VercelDomainConfig | null) => {
  const records = Array.isArray(config?.recommendedCNAME) ? [...config.recommendedCNAME] : [];
  const preferred = records
    .sort((left, right) => Number(left?.rank ?? Number.MAX_SAFE_INTEGER) - Number(right?.rank ?? Number.MAX_SAFE_INTEGER))
    .find((entry) => String(entry?.value || "").trim());
  return normalizeHostname(preferred?.value || "");
};

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

const createVercelUrl = (path: string, searchParams?: Record<string, string>) => {
  const url = new URL(`https://api.vercel.com${path}`);
  if (VERCEL_TEAM_ID) {
    url.searchParams.set("teamId", VERCEL_TEAM_ID);
  }
  if (VERCEL_TEAM_SLUG) {
    url.searchParams.set("slug", VERCEL_TEAM_SLUG);
  }
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url;
};

const vercelRequest = async <T>(
  path: string,
  init?: RequestInit,
  searchParams?: Record<string, string>
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> => {
  const response = await fetch(createVercelUrl(path, searchParams), {
    ...init,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (response.ok) {
    return { ok: true, status: response.status, data: data as T, error: null };
  }

  const message =
    String((data as Record<string, unknown> | null)?.error?.message || "") ||
    String((data as Record<string, unknown> | null)?.message || "") ||
    `Vercel request failed with status ${response.status}`;

  return { ok: false, status: response.status, data: data as T | null, error: message };
};

const getVercelProjectDomain = async (domain: string) =>
  vercelRequest<VercelProjectDomain>(
    `/v9/projects/${encodeURIComponent(VERCEL_PROJECT_ID_OR_NAME)}/domains/${encodeURIComponent(domain)}`
  );

const addVercelProjectDomain = async (domain: string) =>
  vercelRequest<VercelProjectDomain>(
    `/v10/projects/${encodeURIComponent(VERCEL_PROJECT_ID_OR_NAME)}/domains`,
    {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    }
  );

const verifyVercelProjectDomain = async (domain: string) =>
  vercelRequest<VercelProjectDomain>(
    `/v9/projects/${encodeURIComponent(VERCEL_PROJECT_ID_OR_NAME)}/domains/${encodeURIComponent(domain)}/verify`,
    {
      method: "POST",
    }
  );

const getVercelDomainConfig = async (domain: string) =>
  vercelRequest<VercelDomainConfig>(
    `/v6/domains/${encodeURIComponent(domain)}/config`,
    undefined,
    {
      projectIdOrName: VERCEL_PROJECT_ID_OR_NAME,
    }
  );

const isRecoverableVercelDomainAddError = (status: number, message: string | null) => {
  if (status === 409) return true;
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("already") || normalized.includes("exists") || normalized.includes("in use");
};

const buildVercelDnsRecords = (
  domain: string,
  domainType: "root" | "subdomain",
  projectDomain: VercelProjectDomain | null,
  domainConfig: VercelDomainConfig | null
): SiteDnsRecord[] => {
  const records: SiteDnsRecord[] = [];
  const { hostLabel } = getDomainParts(domain);
  const preferredIpv4 = getPreferredIpv4(domainConfig);
  const preferredCname = getPreferredCname(domainConfig);

  if (domainType === "subdomain" && hostLabel && preferredCname) {
    records.push({
      type: "CNAME",
      name: hostLabel,
      value: preferredCname,
      verified: false,
    });
  } else if (preferredIpv4) {
    records.push({
      type: "A",
      name: "@",
      value: preferredIpv4,
      verified: false,
    });
  } else if (preferredCname) {
    records.push({
      type: "CNAME",
      name: domainType === "subdomain" && hostLabel ? hostLabel : "@",
      value: preferredCname,
      verified: false,
    });
  } else if (domainType === "subdomain" && hostLabel) {
    records.push({
      type: "CNAME",
      name: hostLabel,
      value: "cname.vercel-dns.com",
      verified: false,
    });
  } else {
    records.push({
      type: "A",
      name: "@",
      value: "76.76.21.21",
      verified: false,
    });
  }

  const verificationRecords = Array.isArray(projectDomain?.verification) ? projectDomain.verification : [];
  verificationRecords.forEach((record) => {
    const type = normalizeRecordType(record?.type || "");
    const value = normalizeRecordValue(record?.value || "");
    const name = String(record?.domain || "").trim();
    if (!value || !name || (type !== "TXT" && type !== "CNAME" && type !== "A")) {
      return;
    }
    if (records.some((existing) => normalizeRecordType(existing.type) === type && existing.name === name && existing.value === value)) {
      return;
    }
    records.push({
      type,
      name,
      value,
      verified: false,
    });
  });

  return records;
};

const syncDomainWithVercel = async (domain: string, domainType: "root" | "subdomain") => {
  if (!hasVercelProvider) {
    return { projectDomain: null, domainConfig: null, dnsRecords: null as SiteDnsRecord[] | null };
  }

  let projectDomainResponse = await getVercelProjectDomain(domain);
  if (!projectDomainResponse.ok && projectDomainResponse.status === 404) {
    const addResponse = await addVercelProjectDomain(domain);
    if (!addResponse.ok && !isRecoverableVercelDomainAddError(addResponse.status, addResponse.error)) {
      throw new Error(addResponse.error || "Unable to add domain to Vercel");
    }
    projectDomainResponse = await getVercelProjectDomain(domain);
  }

  if (!projectDomainResponse.ok && isRecoverableVercelDomainAddError(projectDomainResponse.status, projectDomainResponse.error)) {
    projectDomainResponse = await getVercelProjectDomain(domain);
  }

  if (!projectDomainResponse.ok) {
    throw new Error(projectDomainResponse.error || "Unable to load Vercel project domain");
  }

  let projectDomain = projectDomainResponse.data;
  const shouldTryVerify =
    projectDomain &&
    projectDomain.verified === false &&
    Array.isArray(projectDomain.verification) &&
    projectDomain.verification.length > 0;

  if (shouldTryVerify) {
    const verifyResponse = await verifyVercelProjectDomain(domain);
    if (verifyResponse.ok && verifyResponse.data) {
      projectDomain = verifyResponse.data;
    }
  }

  const configResponse = await getVercelDomainConfig(domain);
  const domainConfig = configResponse.ok ? configResponse.data : null;
  const dnsRecords = buildVercelDnsRecords(domain, domainType, projectDomain, domainConfig);

  return {
    projectDomain,
    domainConfig,
    dnsRecords: dnsRecords.length > 0 ? dnsRecords : null,
  };
};

interface DnsRecordGroup {
  key: string;
  type: "A" | "CNAME" | "TXT";
  host: string;
  name: string;
  expectedValues: string[];
}

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

    const providerSync = await syncDomainWithVercel(domain, row.type === "subdomain" ? "subdomain" : "root");
    const existingRecords = providerSync.dnsRecords || normalizeDnsRecords(row.dns_records);
    const groupsByKey = new Map<string, DnsRecordGroup>();

    existingRecords.forEach((record) => {
      const type = normalizeRecordType(record.type);
      if (type !== "A" && type !== "CNAME" && type !== "TXT") return;

      const host = resolveDnsRecordHost(domain, record.name);
      const key = `${type}:${host}`;
      const expectedValue = normalizeRecordExpectation(type, record.value);
      const existingGroup = groupsByKey.get(key);

      if (existingGroup) {
        if (expectedValue && !existingGroup.expectedValues.includes(expectedValue)) {
          existingGroup.expectedValues.push(expectedValue);
        }
        return;
      }

      groupsByKey.set(key, {
        key,
        type,
        host,
        name: record.name,
        expectedValues: expectedValue ? [expectedValue] : [],
      });
    });

    const recordGroups = await Promise.all(
      [...groupsByKey.values()].map(async (group) => {
        const observedValues = (await queryDns(group.host, group.type)).map((value) =>
          normalizeRecordExpectation(group.type, value)
        );

        const verified =
          group.type === "TXT"
            ? group.expectedValues.every((value) => observedValues.includes(value))
            : group.expectedValues.some((value) => observedValues.includes(value));

        return {
          ...group,
          observedValues,
          verified,
        };
      })
    );

    const recordGroupsByKey = new Map(recordGroups.map((group) => [group.key, group]));
    const routingGroups = recordGroups.filter((group) => group.type === "A" || group.type === "CNAME");
    const txtGroups = recordGroups.filter((group) => group.type === "TXT");
    const routingVerified = routingGroups.length > 0 && routingGroups.every((group) => group.verified);
    const txtVerified = txtGroups.every((group) => group.verified);
    const dnsVerified = routingVerified && txtVerified;
    const hasAnyObservation = recordGroups.some((group) => group.observedValues.length > 0);
    const dnsStatus = inferDnsStatus(dnsVerified, hasAnyObservation);

    const httpsReachable = dnsStatus === "verified" ? await checkHttpsReachable(domain) : false;
    const sslStatus = inferSslStatus(dnsStatus, httpsReachable);

    const updatedRecords = existingRecords.map((record) => {
      const type = normalizeRecordType(record.type);
      if (type !== "A" && type !== "CNAME" && type !== "TXT") {
        return { ...record, verified: false };
      }

      const host = resolveDnsRecordHost(domain, record.name);
      const key = `${type}:${host}`;
      const recordGroup = recordGroupsByKey.get(key);
      const expectedValue = normalizeRecordExpectation(type, record.value);
      return { ...record, verified: Boolean(expectedValue && recordGroup?.observedValues.includes(expectedValue)) };
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
        records: recordGroups.map((group) => ({
          type: group.type,
          host: group.host,
          name: group.name,
          expected: group.expectedValues,
          observed: group.observedValues,
          verified: group.verified,
        })),
        routingVerified,
        txtVerified,
        dnsVerified,
        httpsReachable,
        provider: providerSync.projectDomain || providerSync.domainConfig ? {
          name: providerSync.projectDomain?.name || domain,
          verified: providerSync.projectDomain?.verified ?? null,
          configuredBy: providerSync.domainConfig?.configuredBy ?? null,
          misconfigured: providerSync.domainConfig?.misconfigured ?? null,
        } : null,
      },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = message.toLowerCase().startsWith("unauthorized") ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
