import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

const normalizeHost = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");

const extractHost = async (request: Request) => {
  const url = new URL(request.url);
  const queryHost = url.searchParams.get("host") || "";
  const headerHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";

  if (request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const bodyHost = String(payload?.host || "");
    return normalizeHost(bodyHost || queryHost || headerHost);
  }

  return normalizeHost(queryHost || headerHost);
};

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const host = await extractHost(request);
    if (!host) {
      return jsonResponse({ error: "Host is required" }, 400);
    }

    const { data: domainRow, error: domainError } = await admin
      .from("site_domains")
      .select("id, domain, linked_page_id, dns_status, ssl_status")
      .eq("domain", host)
      .not("linked_page_id", "is", null)
      .maybeSingle();

    if (domainError) {
      return jsonResponse({ error: domainError.message }, 400);
    }
    if (!domainRow?.linked_page_id) {
      return jsonResponse({ error: "Domain is not linked to a published page" }, 404);
    }

    const { data: pageRow, error: pageError } = await admin
      .from("landing_pages")
      .select("id, name, slug, content_html, blocks, published")
      .eq("id", domainRow.linked_page_id)
      .eq("published", true)
      .maybeSingle();

    if (pageError) {
      return jsonResponse({ error: pageError.message }, 400);
    }
    if (!pageRow) {
      return jsonResponse({ error: "Linked landing page is not published" }, 404);
    }

    return jsonResponse({
      success: true,
      domain: {
        id: String(domainRow.id),
        host: String(domainRow.domain),
        dnsStatus: String(domainRow.dns_status),
        sslStatus: String(domainRow.ssl_status),
      },
      page: {
        id: String(pageRow.id),
        name: String(pageRow.name || ""),
        slug: String(pageRow.slug || ""),
        blocks: Array.isArray(pageRow.blocks) ? pageRow.blocks : [],
        contentHtml: String(pageRow.content_html || ""),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
