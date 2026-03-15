import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

const normalizePath = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0]
    ?.split("#")[0]
    ?.replace(/^\/+/, "")
    .replace(/\/+$/, "") || "";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const url = new URL(request.url);
    const host = normalizeHost(
      url.searchParams.get("host") ||
        request.headers.get("x-forwarded-host") ||
        request.headers.get("host") ||
        ""
    );
    const requestedSlug = slugify(normalizePath(url.searchParams.get("path") || "/"));

    if (!host) {
      return jsonResponse({ error: "Host is required" }, 400);
    }

    const { data: domainRow, error: domainError } = await admin
      .from("site_domains")
      .select("id, user_id, domain, linked_page_id, dns_status, ssl_status")
      .eq("domain", host)
      .maybeSingle();

    if (domainError) {
      return jsonResponse({ error: domainError.message }, 400);
    }

    if (!domainRow?.id || !domainRow.user_id) {
      return jsonResponse({ error: "Domain is not configured" }, 404);
    }

    let pageQuery = admin
      .from("landing_pages")
      .select("id, name, slug, content_html, blocks, settings, published")
      .eq("user_id", domainRow.user_id)
      .eq("published", true);

    if (requestedSlug) {
      pageQuery = pageQuery.eq("slug", requestedSlug);
    } else {
      if (!domainRow.linked_page_id) {
        return jsonResponse({ error: "Domain root is not linked to a published page" }, 404);
      }
      pageQuery = pageQuery.eq("id", domainRow.linked_page_id);
    }

    const { data: pageRow, error: pageError } = await pageQuery.maybeSingle();

    if (pageError) {
      return jsonResponse({ error: pageError.message }, 400);
    }

    if (!pageRow) {
      return jsonResponse({ error: "Published page not found for this domain" }, 404);
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
        settings: pageRow.settings && typeof pageRow.settings === "object" ? pageRow.settings : {},
        contentHtml: String(pageRow.content_html || ""),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
