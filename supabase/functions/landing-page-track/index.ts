import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type JsonObject = Record<string, unknown>;

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

const safeObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as JsonObject) }
    : {};

const truncate = (value: unknown, limit: number) => String(value ?? "").trim().slice(0, limit);

const normalizeSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const normalizeEventType = (value: unknown) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "cta_click" || normalized === "form_submit") return normalized;
  return "page_view";
};

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = safeObject(await request.json().catch(() => ({})));
    const pageId = truncate(payload.pageId, 120);
    const pageSlug = normalizeSlug(truncate(payload.pageSlug, 160));
    const eventType = normalizeEventType(payload.eventType);
    const context = safeObject(payload.context);
    const sessionId = truncate(payload.sessionId, 160);
    const blockId = truncate(payload.blockId, 160);
    const label = truncate(payload.label, 255);

    if (!pageId && !pageSlug) {
      return jsonResponse({ error: "Landing page identifier is required" }, 400);
    }

    let pageQuery = admin
      .from("landing_pages")
      .select("id, user_id, slug, published")
      .eq("published", true)
      .limit(1);

    if (pageId) {
      pageQuery = pageQuery.eq("id", pageId);
    } else {
      pageQuery = pageQuery.eq("slug", pageSlug);
    }

    const { data: pageRow, error: pageError } = await pageQuery.maybeSingle();
    if (pageError) {
      return jsonResponse({ error: pageError.message }, 400);
    }
    if (!pageRow) {
      return jsonResponse({ error: "Published landing page not found" }, 404);
    }

    const metadata = {
      user_agent: truncate(context.userAgent, 1000) || truncate(request.headers.get("user-agent"), 1000),
      host: truncate(context.host, 255),
      path: truncate(context.path, 1000),
      locale: truncate(context.locale, 255),
    };

    const { error: insertError } = await admin
      .from("landing_page_events")
      .insert({
        user_id: String(pageRow.user_id || ""),
        landing_page_id: String(pageRow.id || ""),
        event_type: eventType,
        session_id: sessionId || null,
        block_id: blockId || null,
        label: label || null,
        source_url: truncate(context.sourceUrl ?? context.url, 2000) || null,
        referrer: truncate(context.referrer, 2000) || null,
        utm_source: truncate(context.utmSource, 255) || null,
        utm_medium: truncate(context.utmMedium, 255) || null,
        utm_campaign: truncate(context.utmCampaign, 255) || null,
        utm_term: truncate(context.utmTerm, 255) || null,
        utm_content: truncate(context.utmContent, 255) || null,
        metadata,
        payload: {
          page_slug: String(pageRow.slug || ""),
        },
      });

    if (insertError) {
      return jsonResponse({ error: insertError.message }, 400);
    }

    return jsonResponse({
      success: true,
      pageId: String(pageRow.id || ""),
      eventType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
