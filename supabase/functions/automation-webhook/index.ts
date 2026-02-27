// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-vintro-webhook-secret, x-webhook-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

const safeJsonObject = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) return candidate;
  }
  return "";
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const parseBearerToken = (req: Request) => {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
};

const parseRequestBody = async (req: Request): Promise<Record<string, unknown>> => {
  if (req.method === "GET") return {};

  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const parsed = await req.json().catch(() => ({}));
    return safeJsonObject(parsed);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text().catch(() => "");
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }

  const text = await req.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return safeJsonObject(parsed);
  } catch {
    return { raw: text };
  }
};

const mergeEventName = (state: Record<string, unknown>, eventName: string) => {
  if (!eventName) return state;
  const existingRaw = Array.isArray(state.custom_events)
    ? state.custom_events
    : Array.isArray(state.customEvents)
      ? state.customEvents
      : [];
  const existing = existingRaw.map((item) => String(item || "").trim()).filter(Boolean);
  const seen = new Set(existing.map((item) => item.toLowerCase()));
  if (!seen.has(eventName.toLowerCase())) {
    existing.push(eventName);
  }
  return {
    ...state,
    custom_events: existing,
  };
};

const triggerRunner = async (workflowId: string) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/automation-runner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: "run_now",
        workflowId,
        batchSize: 40,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      payload: safeJsonObject(payload),
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      payload: {
        error: getErrorMessage(error),
      },
    };
  }
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!["GET", "POST", "PUT", "PATCH"].includes(req.method)) {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const requestUrl = new URL(req.url);
    const payload = await parseRequestBody(req);

    const workflowId = pickString(
      requestUrl.searchParams.get("workflowId"),
      requestUrl.searchParams.get("workflow_id"),
      payload.workflowId,
      payload.workflow_id
    );
    if (!workflowId) {
      return jsonResponse({ error: "workflowId is required" }, 400);
    }

    const { data: workflow, error: workflowError } = await admin
      .from("automation_workflows")
      .select("id, user_id, name, status, trigger_type, trigger_filters, settings")
      .eq("id", workflowId)
      .maybeSingle();

    if (workflowError) {
      throw new Error(workflowError.message);
    }
    if (!workflow) {
      return jsonResponse({ error: "Workflow not found" }, 404);
    }
    if (String(workflow.status || "").toLowerCase() === "archived") {
      return jsonResponse({ error: "Workflow is archived" }, 409);
    }
    if (String(workflow.trigger_type || "").toLowerCase() === "list_joined") {
      return jsonResponse(
        { error: "Workflow trigger type is list_joined. Switch to webhook/custom event trigger first." },
        409
      );
    }

    const triggerFilters = safeJsonObject(workflow.trigger_filters);
    const workflowSettings = safeJsonObject(workflow.settings);
    const workflowWebhookSettings = safeJsonObject(workflowSettings.webhook);

    const expectedSecret = pickString(
      triggerFilters.webhook_secret,
      workflowWebhookSettings.secret
    );
    const providedSecret = pickString(
      req.headers.get("x-vintro-webhook-secret"),
      req.headers.get("x-webhook-secret"),
      requestUrl.searchParams.get("secret"),
      payload.secret,
      parseBearerToken(req)
    );

    if (expectedSecret && providedSecret !== expectedSecret) {
      return jsonResponse({ error: "Invalid webhook secret" }, 401);
    }

    const expectedEventName = pickString(triggerFilters.event_name).toLowerCase();
    const eventName = pickString(
      requestUrl.searchParams.get("event"),
      payload.event,
      payload.event_name,
      payload.eventName,
      safeJsonObject(payload.data).event,
      safeJsonObject(payload.contact).event
    );
    if (expectedEventName && expectedEventName !== String(eventName || "").toLowerCase()) {
      await admin.from("automation_logs").insert({
        workflow_id: workflow.id,
        contact_id: null,
        user_id: workflow.user_id,
        event_type: "webhook_event_ignored",
        step_index: null,
        message: `Ignored webhook event "${eventName || "unknown"}" (expected "${expectedEventName}").`,
        metadata: {
          expected_event: expectedEventName,
          received_event: eventName || null,
        },
      });
      return jsonResponse({
        success: true,
        ignored: true,
        reason: "event_mismatch",
        expectedEvent: expectedEventName,
      }, 202);
    }

    const payloadContact = safeJsonObject(payload.contact);
    const email = normalizeEmail(
      pickString(
        requestUrl.searchParams.get("email"),
        payload.email,
        payload.email_address,
        payloadContact.email,
        payloadContact.email_address
      )
    );
    if (!email || !isValidEmail(email)) {
      return jsonResponse({ error: "Valid contact email is required" }, 400);
    }

    const fullName = pickString(
      payload.full_name,
      payload.name,
      payloadContact.full_name,
      payloadContact.name
    );

    const contactData = safeJsonObject(payload.data);
    const stateFromPayload = safeJsonObject(payload.state);
    let incomingState: Record<string, unknown> = {
      ...stateFromPayload,
      ...contactData,
      ...payloadContact,
      email,
      full_name: fullName || null,
      webhook_last_payload_at: new Date().toISOString(),
      webhook_last_event: eventName || null,
    };
    incomingState = mergeEventName(incomingState, eventName);

    const { data: existingContact, error: existingContactError } = await admin
      .from("automation_contacts")
      .select("id, status, current_step, state")
      .eq("workflow_id", workflow.id)
      .eq("email", email)
      .maybeSingle();
    if (existingContactError) {
      throw new Error(existingContactError.message);
    }

    if (String(existingContact?.status || "").toLowerCase() === "unsubscribed") {
      return jsonResponse(
        {
          success: true,
          ignored: true,
          reason: "contact_unsubscribed",
          email,
          workflowId: workflow.id,
        },
        202
      );
    }

    let contactId = "";
    const nowIso = new Date().toISOString();
    if (existingContact?.id) {
      const existingState = safeJsonObject(existingContact.state);
      let mergedState = {
        ...existingState,
        ...incomingState,
      };
      mergedState = mergeEventName(mergedState, eventName);

      const shouldRestart = ["completed", "failed", "paused"].includes(
        String(existingContact.status || "").toLowerCase()
      );
      const nextStep = shouldRestart ? 0 : Number(existingContact.current_step || 0);

      const { data: updated, error: updateError } = await admin
        .from("automation_contacts")
        .update({
          full_name: fullName || existingState.full_name || null,
          status: "active",
          current_step: nextStep,
          next_run_at: nowIso,
          processing_started_at: null,
          last_error: null,
          completed_at: null,
          state: mergedState,
        })
        .eq("id", existingContact.id)
        .select("id")
        .single();
      if (updateError) throw new Error(updateError.message);
      contactId = String(updated.id || existingContact.id);
    } else {
      const { data: inserted, error: insertError } = await admin
        .from("automation_contacts")
        .insert({
          workflow_id: workflow.id,
          user_id: workflow.user_id,
          email,
          full_name: fullName || null,
          status: "active",
          current_step: 0,
          next_run_at: nowIso,
          processing_started_at: null,
          state: incomingState,
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      contactId = String(inserted.id || "");
    }

    await admin.from("automation_logs").insert({
      workflow_id: workflow.id,
      contact_id: contactId || null,
      user_id: workflow.user_id,
      event_type: "webhook_received",
      step_index: null,
      message: `Webhook received for ${email}.`,
      metadata: {
        event: eventName || null,
        source: "automation-webhook",
      },
    });

    const runner = await triggerRunner(String(workflow.id));

    return jsonResponse({
      success: true,
      workflowId: workflow.id,
      contactId: contactId || null,
      email,
      event: eventName || null,
      runnerTriggered: runner.ok,
      runnerStatus: runner.status,
      runnerSummary: runner.payload.summary || null,
    }, 202);
  } catch (error) {
    console.error("automation-webhook error:", getErrorMessage(error));
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});
