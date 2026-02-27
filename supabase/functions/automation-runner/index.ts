// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTransport } from "npm:nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CREDIT_COST_PER_EMAIL = 1;
const DUE_CONTACTS_BATCH = 80;
const WAIT_DEFAULT_MINUTES = 60;
const SEND_RETRY_MINUTES = 15;
const CREDIT_RETRY_MINUTES = 60;
const WEBHOOK_RETRY_MINUTES = 10;
const WEBHOOK_DEFAULT_TIMEOUT_MS = 12000;
const WEBHOOK_MAX_BODY_CHARS = 2000;

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

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const looksLikeHtml = (value: string) => /<\s*[a-z][\w-]*(\s[^>]*)?>/i.test(value);

const formatPlainTextToHtml = (value: string) => {
  if (!value) return "";
  const escaped = escapeHtml(value);
  return escaped
    .split(/\r?\n\r?\n/)
    .map((block) => `<p>${block.replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
};

const addMinutes = (base: Date, minutes: number) =>
  new Date(base.getTime() + Math.max(0, minutes) * 60 * 1000);

const safeJsonObject = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

const toStepType = (value: unknown) => {
  const v = String(value || "").toLowerCase();
  if (v === "send_email" || v === "wait" || v === "condition" || v === "stop") return v;
  return "wait";
};

const toWorkflowStatus = (value: unknown) => {
  const v = String(value || "").toLowerCase();
  if (v === "live" || v === "paused" || v === "draft" || v === "archived") return v;
  return "draft";
};

const normalizeFlow = (rawFlow: unknown) => {
  const list = Array.isArray(rawFlow) ? rawFlow : [];
  const normalized = list.map((item, index) => {
    const row = safeJsonObject(item);
    return {
      id: String(row.id || `step_${index + 1}`),
      name: String(row.name || `Step ${index + 1}`),
      type: toStepType(row.type),
      config: safeJsonObject(row.config),
    };
  });

  if (normalized.length === 0 || normalized[normalized.length - 1].type !== "stop") {
    normalized.push({
      id: "auto_stop",
      name: "Stop",
      type: "stop",
      config: {},
    });
  }

  return normalized;
};

const getWaitMinutes = (config: Record<string, unknown>) => {
  const durationRaw = Number(config.duration ?? config.value ?? WAIT_DEFAULT_MINUTES);
  const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : WAIT_DEFAULT_MINUTES;
  const unit = String(config.unit || "minutes").toLowerCase();

  if (unit === "days") return duration * 24 * 60;
  if (unit === "hours") return duration * 60;
  return duration;
};

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
};

const isServiceToken = (token: string) =>
  token.length > 0 && token === SUPABASE_SERVICE_ROLE_KEY;

const getRequestUser = async (authHeader: string) => {
  if (!authHeader || !SUPABASE_ANON_KEY) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
};

const consumeUserCredits = async (
  userId: string,
  amount: number,
  eventType: string,
  referenceId: string,
  metadata: Record<string, unknown> = {}
) => {
  const { data, error } = await admin.rpc("consume_user_credits", {
    p_amount: amount,
    p_event_type: eventType,
    p_reference_id: referenceId,
    p_metadata: metadata,
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Credit consumption failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    creditsRemaining: Number(row?.credits_remaining ?? 0),
    message: String(row?.message || ""),
  };
};

const refundUserCredits = async (
  userId: string,
  amount: number,
  eventType: string,
  referenceId: string,
  metadata: Record<string, unknown> = {}
) => {
  const { data, error } = await admin.rpc("refund_user_credits", {
    p_amount: amount,
    p_event_type: eventType,
    p_reference_id: referenceId,
    p_metadata: metadata,
    p_user_id: userId,
  });

  if (error) {
    console.error("Credit refund failed:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return Number(row?.credits_remaining ?? NaN);
};

const loadEmailConfig = async (userId: string, senderConfigId?: string) => {
  if (senderConfigId) {
    const { data, error } = await admin
      .from("email_configs")
      .select("id, smtp_host, smtp_port, smtp_username, smtp_password, security, sender_name")
      .eq("id", senderConfigId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }

  const { data, error } = await admin
    .from("email_configs")
    .select("id, smtp_host, smtp_port, smtp_username, smtp_password, security, sender_name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("No sender account is configured.");
  return data;
};

const loadTemplateIfNeeded = async (userId: string, templateId?: string | null) => {
  if (!templateId) return null;
  const { data, error } = await admin
    .from("email_templates")
    .select("id, subject, content, is_html")
    .eq("id", templateId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
};

const personalize = (
  input: string,
  contact: Record<string, unknown>,
  state: Record<string, unknown>,
  sender: Record<string, unknown>
) => {
  const fullName =
    String(contact.full_name || state.full_name || "").trim() ||
    String(state.name || "").trim() ||
    String(contact.email || "");
  const firstName = fullName.split(" ").filter(Boolean)[0] || "";
  const lastName = fullName.split(" ").slice(1).join(" ").trim();
  const email = String(contact.email || "").trim();
  const company = String(state.company || "").trim();
  const jobTitle = String(state.job_title || "").trim();
  const senderName = String(sender.sender_name || "").trim();
  const senderEmail = String(sender.smtp_username || "").trim();

  const replacements: Record<string, string> = {
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email,
    company,
    job_title: jobTitle,
    sender_name: senderName,
    sender_email: senderEmail,
  };

  let value = input;
  Object.entries(replacements).forEach(([token, replacement]) => {
    const regex = new RegExp(`\\{\\s*${token}\\s*\\}`, "gi");
    value = value.replace(regex, replacement || "");
  });
  return value;
};

const truncateText = (value: string, max = WEBHOOK_MAX_BODY_CHARS) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...(truncated)`;
};

const toWebhookMethod = (value: unknown) => {
  const method = String(value || "POST").toUpperCase();
  if (
    method === "GET" ||
    method === "POST" ||
    method === "PUT" ||
    method === "PATCH" ||
    method === "DELETE" ||
    method === "HEAD"
  ) {
    return method;
  }
  return "POST";
};

const runWebhookNode = async (
  workflow: Record<string, unknown>,
  contact: Record<string, unknown>,
  node: Record<string, unknown>,
  currentStep: number,
  state: Record<string, unknown>
) => {
  const config = safeJsonObject(node.config);
  const senderContext = {
    sender_name: String(workflow.name || "Automation"),
    smtp_username: "",
  };

  const rawUrl = personalize(String(config.url || "").trim(), contact, state, senderContext);
  if (!rawUrl) {
    throw new Error("Webhook URL is required.");
  }

  let targetUrl = "";
  try {
    targetUrl = new URL(rawUrl).toString();
  } catch {
    throw new Error(`Webhook URL is invalid: ${rawUrl}`);
  }

  const method = toWebhookMethod(config.method);
  const nowIso = new Date().toISOString();
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    "X-Automation-Workflow-Id": String(workflow.id || ""),
    "X-Automation-Contact-Id": String(contact.id || ""),
    "X-Automation-Node-Id": String(node.id || ""),
  };

  const configuredHeaders = safeJsonObject(config.headers);
  Object.entries(configuredHeaders).forEach(([key, value]) => {
    const headerName = String(key || "").trim();
    if (!headerName) return;
    headers[headerName] = personalize(String(value || ""), contact, state, senderContext);
  });

  const authType = String(config.authType || "none").toLowerCase();
  const authToken = String(config.authToken || "").trim();
  if (authToken) {
    const tokenValue = personalize(authToken, contact, state, senderContext);
    if (authType === "bearer") {
      headers.Authorization = `Bearer ${tokenValue}`;
    } else if (authType === "api_key") {
      const headerName = String(config.authHeader || "x-api-key").trim() || "x-api-key";
      headers[headerName] = tokenValue;
    }
  }

  let body: string | undefined = undefined;
  const payloadTemplate = String(config.payloadTemplate || "").trim();
  if (method !== "GET" && method !== "HEAD") {
    if (payloadTemplate) {
      const personalizedPayload = personalize(payloadTemplate, contact, state, senderContext);
      const trimmedPayload = personalizedPayload.trim();
      if ((trimmedPayload.startsWith("{") && trimmedPayload.endsWith("}")) || (trimmedPayload.startsWith("[") && trimmedPayload.endsWith("]"))) {
        try {
          body = JSON.stringify(JSON.parse(trimmedPayload));
          if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
            headers["Content-Type"] = "application/json";
          }
        } catch {
          body = personalizedPayload;
          if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
            headers["Content-Type"] = "text/plain; charset=utf-8";
          }
        }
      } else {
        body = personalizedPayload;
        if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
          headers["Content-Type"] = "text/plain; charset=utf-8";
        }
      }
    } else {
      body = JSON.stringify({
        event: "automation_webhook",
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        contact_id: contact.id,
        contact_email: contact.email,
        node_id: node.id,
        step_index: currentStep,
        occurred_at: nowIso,
      });
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  const timeoutRaw = Number(config.timeoutMs || WEBHOOK_DEFAULT_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 1000
      ? Math.min(timeoutRaw, 30000)
      : WEBHOOK_DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort("timeout"), timeoutMs);

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  const responseText = await response.text().catch(() => "");
  const responsePreview = truncateText(String(responseText || ""));
  const requestPreview = body ? truncateText(String(body)) : "";

  const webhookResults = safeJsonObject(state.webhook_results);
  const nextState = {
    ...state,
    webhook_results: {
      ...webhookResults,
      [String(node.id || "webhook")]: {
        status: response.status,
        ok: response.ok,
        url: targetUrl,
        method,
        request_preview: requestPreview || null,
        response_preview: responsePreview || null,
        at: nowIso,
      },
    },
    last_webhook_status: response.status,
    last_webhook_at: nowIso,
  };

  if (!response.ok) {
    throw new Error(
      `Webhook request failed (${response.status}) ${response.statusText || ""} ${responsePreview || ""}`.trim()
    );
  }

  return {
    statePatch: nextState,
    status: response.status,
    method,
    url: targetUrl,
    responsePreview,
  };
};

const logAutomationEvent = async (
  workflow: Record<string, unknown>,
  contactId: string | null,
  eventType: string,
  stepIndex: number | null,
  message: string,
  metadata: Record<string, unknown> = {}
) => {
  try {
    await admin.from("automation_logs").insert({
      workflow_id: workflow.id,
      contact_id: contactId,
      user_id: workflow.user_id,
      event_type: eventType,
      step_index: stepIndex,
      message,
      metadata,
    });
  } catch (error) {
    console.error("Failed to insert automation log:", getErrorMessage(error));
  }
};

const releaseContactForRetry = async (
  contactId: string,
  nextRunAt: Date,
  lastError: string,
  state?: Record<string, unknown>
) => {
  await admin
    .from("automation_contacts")
    .update({
      status: "active",
      next_run_at: nextRunAt.toISOString(),
      processing_started_at: null,
      last_error: lastError,
      state: state || undefined,
    })
    .eq("id", contactId);
};

const completeContact = async (
  contactId: string,
  currentStep: number,
  state: Record<string, unknown> = {}
) => {
  await admin
    .from("automation_contacts")
    .update({
      status: "completed",
      current_step: currentStep,
      next_run_at: null,
      processing_started_at: null,
      last_error: null,
      completed_at: new Date().toISOString(),
      state,
    })
    .eq("id", contactId);
};

const evaluateCondition = async (
  workflow: Record<string, unknown>,
  contact: Record<string, unknown>,
  config: Record<string, unknown>,
  state: Record<string, unknown>
) => {
  const rule = String(config.rule || "has_replied").toLowerCase();
  const rawValue = String(config.value || "").toLowerCase().trim();
  const email = normalizeEmail(contact.email);
  const comparator = String(config.comparator || "exists").toLowerCase();

  if (rule === "has_replied" || rule === "email_opened") {
    let query = admin
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", workflow.user_id)
      .eq("direction", "inbound")
      .ilike("from_email", email);

    if (state.last_sent_at) {
      query = query.gte("date", String(state.last_sent_at));
    }
    if (state.last_sender_email) {
      query = query.ilike("to_email", String(state.last_sender_email));
    }

    const { count, error } = await query;
    if (error) {
      throw new Error(`Condition check failed: ${error.message}`);
    }

    return Number(count || 0) > 0;
  }

  if (rule === "email_clicked") {
    if (state.last_clicked_at || state.email_clicked === true || state.clicked === true) {
      return true;
    }
    return false;
  }

  if (rule === "user_property") {
    const key = String(config.propertyKey || "").trim();
    if (!key) return false;

    const resolved =
      key === "email_domain"
        ? (email.includes("@") ? email.split("@")[1] : "")
        : key in state
          ? String(state[key] || "")
          : key in contact
            ? String(contact[key] || "")
            : "";
    const normalized = resolved.toLowerCase();

    if (comparator === "equals") return normalized === rawValue;
    if (comparator === "contains") return rawValue.length > 0 && normalized.includes(rawValue);
    return normalized.length > 0;
  }

  if (rule === "tag_exists") {
    const tags =
      Array.isArray(state.tags)
        ? state.tags
        : typeof state.tags === "string"
          ? String(state.tags)
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          : [];
    return rawValue.length > 0 && tags.some((tag) => String(tag || "").toLowerCase() === rawValue);
  }

  if (rule === "custom_event") {
    const customEvents =
      Array.isArray(state.custom_events)
        ? state.custom_events
        : Array.isArray(state.customEvents)
          ? state.customEvents
          : [];
    return rawValue.length > 0 && customEvents.some((eventName) => String(eventName || "").toLowerCase() === rawValue);
  }

  if (rule === "email_domain_contains") {
    const domain = email.includes("@") ? email.split("@")[1] : "";
    return rawValue.length > 0 && domain.toLowerCase().includes(rawValue);
  }

  if (rule === "company_contains") {
    const company = String(state.company || "").toLowerCase();
    return rawValue.length > 0 && company.includes(rawValue);
  }

  if (rule === "job_title_contains") {
    const title = String(state.job_title || "").toLowerCase();
    return rawValue.length > 0 && title.includes(rawValue);
  }

  return false;
};

const conditionHandleForClause = (index: number) => (index <= 0 ? "if" : `else_if_${index}`);

const nextRunnerElseIfHandle = (usedHandles: Set<string>) => {
  let index = 1;
  while (usedHandles.has(`else_if_${index}`)) {
    index += 1;
  }
  return `else_if_${index}`;
};

const normalizeGraphConditionConfig = (rawConfig: unknown) => {
  const config = safeJsonObject(rawConfig);
  const rawClauses = Array.isArray(config.clauses) ? config.clauses : [];

  const clausesRaw =
    rawClauses.length > 0
      ? rawClauses.map((item, index) => {
          const row = safeJsonObject(item);
          return {
            handle: index === 0 ? "if" : String(row.id || "").trim(),
            rule: String(row.rule || "email_opened").toLowerCase(),
            propertyKey: String(row.propertyKey || "").trim(),
            comparator: String(row.comparator || "exists").toLowerCase(),
            value: String(row.value || ""),
          };
        })
      : [
          {
            handle: "if",
            rule: String(config.rule || "email_opened").toLowerCase(),
            propertyKey: String(config.propertyKey || "").trim(),
            comparator: String(config.comparator || "exists").toLowerCase(),
            value: String(config.value || ""),
          },
        ];

  const usedHandles = new Set<string>();
  const clauses = clausesRaw.map((clause, index) => {
    if (index === 0) {
      usedHandles.add("if");
      return {
        ...clause,
        handle: "if",
      };
    }

    const preferred = String(clause.handle || "").trim();
    const isElseIf = /^else_if_\d+$/.test(preferred);
    const handle = isElseIf && !usedHandles.has(preferred) ? preferred : nextRunnerElseIfHandle(usedHandles);
    usedHandles.add(handle);
    return {
      ...clause,
      handle,
    };
  });

  return {
    clauses: clauses.length > 0 ? clauses : [{ handle: "if", rule: "email_opened", propertyKey: "", comparator: "exists", value: "" }],
  };
};

const pickGraphConditionBranch = async (
  workflow: Record<string, unknown>,
  contact: Record<string, unknown>,
  config: Record<string, unknown>,
  state: Record<string, unknown>
) => {
  const normalized = normalizeGraphConditionConfig(config);
  for (let index = 0; index < normalized.clauses.length; index += 1) {
    const clause = normalized.clauses[index];
    const matched = await evaluateCondition(workflow, contact, clause, state);
    if (matched) {
      const elseIfMatch = /^else_if_(\d+)$/.exec(clause.handle || "");
      return {
        handle: clause.handle,
        label: clause.handle === "if" ? "If" : elseIfMatch ? `Else If ${elseIfMatch[1]}` : "Else If",
        clause,
      };
    }
  }

  return {
    handle: "else",
    label: "Else",
    clause: null,
  };
};

const sendEmailForStep = async (
  workflow: Record<string, unknown>,
  contact: Record<string, unknown>,
  step: Record<string, unknown>,
  stepIndex: number,
  options: {
    statePatch?: Record<string, unknown>;
    retryStatePatch?: Record<string, unknown>;
    nodeId?: string;
    completeAfterSend?: boolean;
  } = {}
) => {
  const config = safeJsonObject(step.config);
  const state = safeJsonObject(contact.state);
  const nodeId = options.nodeId || String(step.id || "");
  const stepLabel = String(step.name || "Email");
  const sender = await loadEmailConfig(workflow.user_id, String(config.sender_config_id || ""));
  const template = await loadTemplateIfNeeded(workflow.user_id, config.template_id ? String(config.template_id) : null);

  const subjectRaw = String(config.subject || template?.subject || "").trim();
  const bodyRaw = String(config.body || template?.content || "").trim();
  const isHtml = Boolean(config.is_html ?? template?.is_html ?? looksLikeHtml(bodyRaw));

  if (!subjectRaw) {
    throw new Error("Email step subject is required.");
  }
  if (!bodyRaw) {
    throw new Error("Email step body is required.");
  }

  const personalizedSubject = personalize(subjectRaw, contact, state, sender);
  const personalizedBody = personalize(bodyRaw, contact, state, sender);
  const htmlBody = isHtml ? personalizedBody : formatPlainTextToHtml(personalizedBody);

  const creditReferenceId = `automation:${workflow.id}:${contact.id}:step:${nodeId || stepIndex}:${Date.now()}`;
  const creditResult = await consumeUserCredits(
    workflow.user_id,
    CREDIT_COST_PER_EMAIL,
    "automation_email_send",
    creditReferenceId,
    {
      source: "automation",
      workflow_id: workflow.id,
      workflow_name: workflow.name,
      contact_id: contact.id,
      step_index: stepIndex,
      node_id: nodeId || null,
      sender_config_id: sender.id,
      recipient: contact.email,
    }
  );

  if (!creditResult.allowed) {
    await releaseContactForRetry(
      contact.id,
      addMinutes(new Date(), CREDIT_RETRY_MINUTES),
      creditResult.message || "Insufficient credits",
      state
    );
    await logAutomationEvent(
      workflow,
      contact.id,
      "credit_blocked",
      stepIndex,
      "Paused send because credits are exhausted.",
      {
        credits_remaining: creditResult.creditsRemaining,
        node_id: nodeId || null,
      }
    );
    return { sent: 0, creditBlocked: 1 };
  }

  let creditDebited = true;
  try {
    const smtpPort = Number(sender.smtp_port || 587);
    const transporter = createTransport({
      host: sender.smtp_host,
      port: smtpPort,
      secure: String(sender.security || "TLS").toUpperCase() === "SSL" && smtpPort === 465,
      auth: {
        user: sender.smtp_username,
        pass: sender.smtp_password,
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
    });

    const senderEmail = String(sender.smtp_username || "").trim();
    const senderName = String(sender.sender_name || "").trim() || String(workflow.name || "Automation");
    const senderDomain = senderEmail.includes("@") ? senderEmail.split("@")[1] : "example.com";
    const localMessageId = crypto.randomUUID();
    const generatedMessageId = `<${localMessageId}@${senderDomain}>`;

    const headers: Record<string, string> = {
      Date: new Date().toUTCString(),
      "X-Mailer": "Vintro Automation Runner",
    };

    const shouldThread = Boolean(config.thread_with_previous ?? true);
    if (shouldThread && state.last_message_id) {
      headers["In-Reply-To"] = String(state.last_message_id);
      headers["References"] = state.thread_id
        ? `${String(state.thread_id)} ${String(state.last_message_id)}`
        : String(state.last_message_id);
    }

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: String(contact.email || ""),
      subject: personalizedSubject,
      html: htmlBody,
      text: personalizedBody,
      messageId: generatedMessageId,
      headers,
    });

    const sentAt = new Date().toISOString();
    const infoMessageId = String(info?.messageId || generatedMessageId);
    const threadId = String(state.thread_id || infoMessageId);

    const nextState = {
      ...state,
      full_name: String(contact.full_name || state.full_name || ""),
      email: String(contact.email || ""),
      last_sent_at: sentAt,
      last_message_id: infoMessageId,
      thread_id: threadId,
      last_sender_email: senderEmail,
      last_sender_config_id: sender.id,
      last_subject: personalizedSubject,
      ...(options.statePatch || {}),
    };

    await admin
      .from("automation_contacts")
      .update({
        status: options.completeAfterSend ? "completed" : "active",
        current_step: stepIndex + 1,
        next_run_at: options.completeAfterSend ? null : new Date().toISOString(),
        processing_started_at: null,
        last_error: null,
        completed_at: options.completeAfterSend ? new Date().toISOString() : null,
        state: nextState,
      })
      .eq("id", contact.id);

    await admin.from("email_messages").insert({
      user_id: workflow.user_id,
      config_id: sender.id,
      uid: null,
      from_email: senderEmail,
      to_email: String(contact.email || ""),
      to_emails: [String(contact.email || "")],
      cc_emails: [],
      subject: personalizedSubject,
      body: isHtml ? htmlBody : personalizedBody,
      date: sentAt,
      folder: "Sent",
      read: true,
      message_id: infoMessageId,
      in_reply_to: headers["In-Reply-To"] || null,
      references: headers["References"] ? headers["References"].split(/\s+/).filter(Boolean) : [],
      attachments: [],
      thread_id: threadId,
      direction: "outbound",
    });

    await logAutomationEvent(
      workflow,
      contact.id,
      "email_sent",
      stepIndex,
      `Sent step "${stepLabel}" to ${contact.email}.`,
      {
        sender_config_id: sender.id,
        message_id: infoMessageId,
        smtp_response: info?.response || null,
        node_id: nodeId || null,
      }
    );

    if (options.completeAfterSend) {
      await logAutomationEvent(
        workflow,
        contact.id,
        "workflow_completed",
        stepIndex + 1,
        "Workflow completed after final email step.",
        {
          node_id: nodeId || null,
        }
      );
      return { sent: 1, completed: 1 };
    }

    return { sent: 1 };
  } catch (error) {
    if (creditDebited) {
      await refundUserCredits(
        workflow.user_id,
        CREDIT_COST_PER_EMAIL,
        "automation_email_refund",
        creditReferenceId,
        {
          source: "automation",
          workflow_id: workflow.id,
          contact_id: contact.id,
          step_index: stepIndex,
          node_id: nodeId || null,
          reason: "send_failure",
          error: getErrorMessage(error),
        }
      );
    }

    const currentState = {
      ...safeJsonObject(contact.state),
      ...(options.retryStatePatch || {}),
    };
    await releaseContactForRetry(
      contact.id,
      addMinutes(new Date(), SEND_RETRY_MINUTES),
      getErrorMessage(error),
      currentState
    );

    await logAutomationEvent(
      workflow,
      contact.id,
      "email_send_failed",
      stepIndex,
      `Send failed: ${getErrorMessage(error)}`,
      {
        node_id: nodeId || null,
      }
    );

    return { sent: 0, failed: 1 };
  }
};

const processContactLegacy = async (workflow: Record<string, unknown>, contact: Record<string, unknown>) => {
  const flow = normalizeFlow(workflow.flow);
  let currentStep = Number(contact.current_step || 0);
  let state = safeJsonObject(contact.state);
  let safetyCounter = 0;

  while (safetyCounter < 8) {
    safetyCounter += 1;
    if (currentStep >= flow.length) {
      await completeContact(contact.id, currentStep, state);
      await logAutomationEvent(
        workflow,
        contact.id,
        "workflow_completed",
        currentStep,
        "Workflow completed automatically.",
        {}
      );
      return { completed: 1 };
    }

    const step = flow[currentStep];

    if (step.type === "stop") {
      await completeContact(contact.id, currentStep, state);
      await logAutomationEvent(
        workflow,
        contact.id,
        "workflow_stopped",
        currentStep,
        "Reached stop step.",
        {}
      );
      return { completed: 1 };
    }

    if (step.type === "wait") {
      const waitMinutes = getWaitMinutes(safeJsonObject(step.config));
      const waitKey = `wait_until_${currentStep}`;
      const waitUntilRaw = state[waitKey];
      const now = new Date();

      if (!waitUntilRaw) {
        const waitUntil = addMinutes(now, waitMinutes);
        state[waitKey] = waitUntil.toISOString();
        await admin
          .from("automation_contacts")
          .update({
            status: "active",
            next_run_at: waitUntil.toISOString(),
            processing_started_at: null,
            state,
            last_error: null,
          })
          .eq("id", contact.id);

        await logAutomationEvent(
          workflow,
          contact.id,
          "wait_scheduled",
          currentStep,
          `Waiting for ${waitMinutes} minute(s).`,
          { wait_until: waitUntil.toISOString() }
        );
        return { waiting: 1 };
      }

      const waitUntilDate = new Date(String(waitUntilRaw));
      if (Number.isNaN(waitUntilDate.getTime()) || now < waitUntilDate) {
        await admin
          .from("automation_contacts")
          .update({
            status: "active",
            next_run_at: waitUntilDate.toISOString(),
            processing_started_at: null,
            state,
          })
          .eq("id", contact.id);
        return { waiting: 1 };
      }

      delete state[waitKey];
      currentStep += 1;
      await admin
        .from("automation_contacts")
        .update({
          status: "active",
          current_step: currentStep,
          next_run_at: now.toISOString(),
          processing_started_at: null,
          state,
          last_error: null,
        })
        .eq("id", contact.id);
      continue;
    }

    if (step.type === "condition") {
      const config = safeJsonObject(step.config);
      let result = false;

      try {
        result = await evaluateCondition(workflow, contact, config, state);
      } catch (error) {
        await releaseContactForRetry(
          contact.id,
          addMinutes(new Date(), SEND_RETRY_MINUTES),
          getErrorMessage(error),
          state
        );
        await logAutomationEvent(
          workflow,
          contact.id,
          "condition_failed",
          currentStep,
          getErrorMessage(error),
          {}
        );
        return { failed: 1 };
      }

      const trueAction = String(config.if_true || "continue").toLowerCase();
      const falseAction = String(config.if_false || "continue").toLowerCase();
      const action = result ? trueAction : falseAction;

      await logAutomationEvent(
        workflow,
        contact.id,
        "condition_evaluated",
        currentStep,
        `Condition result: ${result ? "true" : "false"} (${action}).`,
        {
          rule: config.rule || "has_replied",
          value: config.value || null,
        }
      );

      if (action === "stop") {
        await completeContact(contact.id, currentStep, state);
        await logAutomationEvent(
          workflow,
          contact.id,
          "workflow_stopped_by_condition",
          currentStep,
          "Condition ended the workflow.",
          {}
        );
        return { completed: 1 };
      }

      currentStep += 1;
      await admin
        .from("automation_contacts")
        .update({
          status: "active",
          current_step: currentStep,
          next_run_at: new Date().toISOString(),
          processing_started_at: null,
          state,
          last_error: null,
        })
        .eq("id", contact.id);
      continue;
    }

    if (step.type === "send_email") {
      return await sendEmailForStep(workflow, contact, step, currentStep);
    }

    currentStep += 1;
    await admin
      .from("automation_contacts")
      .update({
        status: "active",
        current_step: currentStep,
        next_run_at: new Date().toISOString(),
        processing_started_at: null,
        state,
        last_error: null,
      })
      .eq("id", contact.id);
  }

  await releaseContactForRetry(
    contact.id,
    addMinutes(new Date(), 1),
    "Step recursion guard reached.",
    state
  );
  return { failed: 1 };
};

const toGraphNodeKind = (value: unknown) => {
  const kind = String(value || "").toLowerCase();
  if (
    kind === "trigger" ||
    kind === "send_email" ||
    kind === "wait" ||
    kind === "condition" ||
    kind === "split" ||
    kind === "webhook" ||
    kind === "exit"
  ) {
    return kind;
  }
  return "wait";
};

const graphBranchRank = (handle: unknown) => {
  const branch = String(handle || "");
  if (branch === "if" || branch === "yes" || branch === "a") return 1;
  if (branch.startsWith("else_if_")) {
    const index = Number(branch.split("_")[2] || 0);
    return 10 + index;
  }
  if (branch === "else" || branch === "no" || branch === "b") return 90;
  return 100;
};

const normalizeWorkflowGraph = (workflow: Record<string, unknown>) => {
  const settings = safeJsonObject(workflow.settings);
  const graph = safeJsonObject(settings.workflow_graph);
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];

  if (rawNodes.length === 0) return null;

  const nodes = rawNodes
    .map((item, index) => {
      const row = safeJsonObject(item);
      const kind = toGraphNodeKind(row.kind);
      const config = safeJsonObject(row.config);
      return {
        id: String(row.id || `node_${index + 1}`),
        kind,
        title: String(row.title || kind),
        config: kind === "condition" ? normalizeGraphConditionConfig(config) : config,
      };
    })
    .filter((node) => node.id.length > 0);

  if (nodes.length === 0) return null;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = rawEdges
    .map((item, index) => {
      const row = safeJsonObject(item);
      const source = String(row.source || "");
      const target = String(row.target || "");
      const sourceNode = nodeById.get(source);
      let sourceHandle = String(row.sourceHandle || "");

      if (sourceNode?.kind === "condition") {
        if (sourceHandle === "yes") sourceHandle = "if";
        if (sourceHandle === "no") sourceHandle = "else";
      }

      return {
        id: String(row.id || `edge_${index + 1}`),
        source,
        target,
        sourceHandle,
      };
    })
    .filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target));

  const triggerNode = nodes.find((node) => node.kind === "trigger") || null;
  if (!triggerNode) return null;

  const outgoingByNode = new Map<string, Array<{ id: string; source: string; target: string; sourceHandle: string }>>();
  edges.forEach((edge) => {
    const existing = outgoingByNode.get(edge.source) || [];
    existing.push(edge);
    outgoingByNode.set(edge.source, existing);
  });

  for (const [nodeId, outgoing] of outgoingByNode.entries()) {
    outgoing.sort((a, b) => graphBranchRank(a.sourceHandle) - graphBranchRank(b.sourceHandle));
    outgoingByNode.set(nodeId, outgoing);
  }

  return {
    nodes,
    nodeById,
    outgoingByNode,
    triggerNode,
  };
};

const processContactGraph = async (
  workflow: Record<string, unknown>,
  contact: Record<string, unknown>,
  graphRuntime: ReturnType<typeof normalizeWorkflowGraph>
) => {
  if (!graphRuntime) return { failed: 1 };

  let currentStep = Number(contact.current_step || 0);
  let state = safeJsonObject(contact.state);
  let currentNodeId = String(state.current_node_id || "").trim();
  let safetyCounter = 0;

  const triggerOutgoing = graphRuntime.outgoingByNode.get(graphRuntime.triggerNode.id) || [];
  const triggerTarget = triggerOutgoing[0]?.target || null;

  if (!currentNodeId) {
    if (!triggerTarget) {
      await completeContact(contact.id, currentStep, { ...state, current_node_id: null });
      await logAutomationEvent(
        workflow,
        contact.id,
        "workflow_completed",
        currentStep,
        "Workflow completed: trigger has no outbound path.",
        { node_id: graphRuntime.triggerNode.id }
      );
      return { completed: 1 };
    }
    currentNodeId = triggerTarget;
    state = {
      ...state,
      current_node_id: currentNodeId,
    };
  }

  if (!graphRuntime.nodeById.has(currentNodeId)) {
    if (!triggerTarget) {
      await completeContact(contact.id, currentStep, { ...state, current_node_id: null });
      await logAutomationEvent(
        workflow,
        contact.id,
        "workflow_completed",
        currentStep,
        "Workflow completed: graph pointer is invalid and no trigger path exists.",
        {}
      );
      return { completed: 1 };
    }
    currentNodeId = triggerTarget;
    state = {
      ...state,
      current_node_id: currentNodeId,
    };
  }

  while (safetyCounter < 12) {
    safetyCounter += 1;

    const node = graphRuntime.nodeById.get(currentNodeId);
    if (!node) {
      await releaseContactForRetry(
        contact.id,
        addMinutes(new Date(), 1),
        "Graph node no longer exists.",
        { ...state, current_node_id: null }
      );
      return { failed: 1 };
    }

    const outgoing = graphRuntime.outgoingByNode.get(node.id) || [];

    if (node.kind === "trigger") {
      const next = outgoing[0] || null;
      if (!next) {
        await completeContact(contact.id, currentStep, { ...state, current_node_id: null });
        await logAutomationEvent(
          workflow,
          contact.id,
          "workflow_completed",
          currentStep,
          "Workflow completed: trigger reached with no outbound path.",
          { node_id: node.id }
        );
        return { completed: 1 };
      }
      currentNodeId = next.target;
      state = {
        ...state,
        current_node_id: currentNodeId,
      };
      continue;
    }

    if (node.kind === "exit") {
      await completeContact(contact.id, currentStep, { ...state, current_node_id: null });
      await logAutomationEvent(
        workflow,
        contact.id,
        "workflow_completed",
        currentStep,
        "Workflow completed.",
        { node_id: node.id }
      );
      return { completed: 1 };
    }

    if (node.kind === "wait") {
      const waitMinutes = getWaitMinutes(safeJsonObject(node.config));
      const waitKey = `wait_until_node_${node.id}`;
      const waitUntilRaw = state[waitKey];
      const now = new Date();

      if (!waitUntilRaw) {
        const waitUntil = addMinutes(now, waitMinutes);
        state = {
          ...state,
          [waitKey]: waitUntil.toISOString(),
          current_node_id: node.id,
        };

        await admin
          .from("automation_contacts")
          .update({
            status: "active",
            next_run_at: waitUntil.toISOString(),
            processing_started_at: null,
            state,
            last_error: null,
          })
          .eq("id", contact.id);

        await logAutomationEvent(
          workflow,
          contact.id,
          "wait_scheduled",
          currentStep,
          `Waiting for ${waitMinutes} minute(s).`,
          {
            wait_until: waitUntil.toISOString(),
            node_id: node.id,
          }
        );
        return { waiting: 1 };
      }

      const waitUntilDate = new Date(String(waitUntilRaw));
      const validWaitDate = Number.isNaN(waitUntilDate.getTime()) ? addMinutes(now, waitMinutes) : waitUntilDate;
      if (now < validWaitDate) {
        state = {
          ...state,
          [waitKey]: validWaitDate.toISOString(),
          current_node_id: node.id,
        };
        await admin
          .from("automation_contacts")
          .update({
            status: "active",
            next_run_at: validWaitDate.toISOString(),
            processing_started_at: null,
            state,
          })
          .eq("id", contact.id);
        return { waiting: 1 };
      }

      const nextState = { ...state };
      delete nextState[waitKey];

      currentStep += 1;
      const next = outgoing[0] || null;

      if (!next) {
        await completeContact(contact.id, currentStep, { ...nextState, current_node_id: null });
        await logAutomationEvent(
          workflow,
          contact.id,
          "workflow_completed",
          currentStep,
          "Workflow completed after wait.",
          { node_id: node.id }
        );
        return { completed: 1 };
      }

      state = {
        ...nextState,
        current_node_id: next.target,
      };
      currentNodeId = next.target;

      await admin
        .from("automation_contacts")
        .update({
          status: "active",
          current_step: currentStep,
          next_run_at: now.toISOString(),
          processing_started_at: null,
          state,
          last_error: null,
        })
        .eq("id", contact.id);
      continue;
    }

    if (node.kind === "condition") {
      let branchSelection;
      try {
        branchSelection = await pickGraphConditionBranch(workflow, contact, safeJsonObject(node.config), state);
      } catch (error) {
        await releaseContactForRetry(
          contact.id,
          addMinutes(new Date(), SEND_RETRY_MINUTES),
          getErrorMessage(error),
          { ...state, current_node_id: node.id }
        );
        await logAutomationEvent(
          workflow,
          contact.id,
          "condition_failed",
          currentStep,
          getErrorMessage(error),
          { node_id: node.id }
        );
        return { failed: 1 };
      }

      let next =
        outgoing.find((edge) => String(edge.sourceHandle || "").toLowerCase() === branchSelection.handle) || null;
      if (!next && branchSelection.handle.startsWith("else_if_")) {
        next = outgoing.find((edge) => edge.sourceHandle === "else" || edge.sourceHandle === "no") || null;
      }
      if (!next) {
        next = outgoing[0] || null;
      }

      await logAutomationEvent(
        workflow,
        contact.id,
        "condition_evaluated",
        currentStep,
        `Condition routed to ${branchSelection.label}.`,
        {
          branch: branchSelection.handle,
          rule: branchSelection.clause?.rule || null,
          value: branchSelection.clause?.value || null,
          node_id: node.id,
        }
      );

      currentStep += 1;

      if (!next) {
        await completeContact(contact.id, currentStep, { ...state, current_node_id: null });
        await logAutomationEvent(
          workflow,
          contact.id,
          "workflow_completed",
          currentStep,
          "Workflow completed: condition has no outbound target.",
          { node_id: node.id }
        );
        return { completed: 1 };
      }

      currentNodeId = next.target;
      state = {
        ...state,
        current_node_id: currentNodeId,
      };

      await admin
        .from("automation_contacts")
        .update({
          status: "active",
          current_step: currentStep,
          next_run_at: new Date().toISOString(),
          processing_started_at: null,
          state,
          last_error: null,
        })
        .eq("id", contact.id);
      continue;
    }

    if (node.kind === "send_email") {
      const next = outgoing[0] || null;
      const nextNodeId = next ? next.target : null;
      return await sendEmailForStep(
        workflow,
        contact,
        {
          id: node.id,
          name: node.title || "Send email",
          config: safeJsonObject(node.config),
        },
        currentStep,
        {
          statePatch: {
            ...state,
            current_node_id: nextNodeId,
          },
          retryStatePatch: {
            ...state,
            current_node_id: node.id,
          },
          nodeId: node.id,
          completeAfterSend: !nextNodeId,
        }
      );
    }

    if (node.kind === "webhook") {
      let webhookResult;
      try {
        webhookResult = await runWebhookNode(workflow, contact, node, currentStep, state);
      } catch (error) {
        await releaseContactForRetry(
          contact.id,
          addMinutes(new Date(), WEBHOOK_RETRY_MINUTES),
          getErrorMessage(error),
          {
            ...state,
            current_node_id: node.id,
          }
        );
        await logAutomationEvent(
          workflow,
          contact.id,
          "webhook_failed",
          currentStep,
          getErrorMessage(error),
          { node_id: node.id }
        );
        return { failed: 1 };
      }

      const next = outgoing[0] || null;
      const nextNodeId = next ? next.target : null;
      const nextStep = currentStep + 1;
      const nextState = {
        ...safeJsonObject(webhookResult.statePatch),
        current_node_id: nextNodeId,
      };

      await logAutomationEvent(
        workflow,
        contact.id,
        "webhook_sent",
        currentStep,
        `Webhook responded with ${Number(webhookResult.status || 0)}.`,
        {
          node_id: node.id,
          method: webhookResult.method || null,
          url: webhookResult.url || null,
          status: Number(webhookResult.status || 0),
          response_preview: webhookResult.responsePreview || null,
        }
      );

      if (!nextNodeId) {
        await completeContact(contact.id, nextStep, {
          ...nextState,
          current_node_id: null,
        });
        await logAutomationEvent(
          workflow,
          contact.id,
          "workflow_completed",
          nextStep,
          "Workflow completed after webhook node.",
          { node_id: node.id }
        );
        return { completed: 1 };
      }

      currentStep = nextStep;
      currentNodeId = nextNodeId;
      state = nextState;

      await admin
        .from("automation_contacts")
        .update({
          status: "active",
          current_step: currentStep,
          next_run_at: new Date().toISOString(),
          processing_started_at: null,
          state,
          last_error: null,
        })
        .eq("id", contact.id);
      continue;
    }

    await admin
      .from("automation_contacts")
      .update({
        status: "failed",
        next_run_at: null,
        processing_started_at: null,
        last_error: `Unsupported node type: ${node.kind}`,
        state: {
          ...state,
          current_node_id: node.id,
        },
      })
      .eq("id", contact.id);

    await logAutomationEvent(
      workflow,
      contact.id,
      "unsupported_node",
      currentStep,
      `Node type "${node.kind}" is not supported by the runner.`,
      { node_id: node.id }
    );
    return { failed: 1 };
  }

  await releaseContactForRetry(
    contact.id,
    addMinutes(new Date(), 1),
    "Graph recursion guard reached.",
    {
      ...state,
      current_node_id: currentNodeId,
    }
  );
  return { failed: 1 };
};

const processContact = async (
  workflow: Record<string, unknown>,
  contact: Record<string, unknown>,
  graphRuntime: ReturnType<typeof normalizeWorkflowGraph> = null
) => {
  if (graphRuntime) {
    return await processContactGraph(workflow, contact, graphRuntime);
  }
  return await processContactLegacy(workflow, contact);
};

const claimDueContacts = async (workflowId: string, batchSize = DUE_CONTACTS_BATCH) => {
  const nowIso = new Date().toISOString();

  const { data: dueContacts, error } = await admin
    .from("automation_contacts")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    throw new Error(`Unable to fetch due contacts: ${error.message}`);
  }

  const claimed: Record<string, unknown>[] = [];
  for (const contact of dueContacts || []) {
    const { data, error: claimError } = await admin
      .from("automation_contacts")
      .update({
        status: "processing",
        processing_started_at: nowIso,
      })
      .eq("id", contact.id)
      .eq("status", "active")
      .select("*")
      .maybeSingle();

    if (!claimError && data) {
      claimed.push(data);
    }
  }

  return claimed;
};

const runWorkflow = async (
  workflow: Record<string, unknown>,
  options: { force?: boolean; enroll?: boolean; batchSize?: number } = {}
) => {
  const status = toWorkflowStatus(workflow.status);
  const shouldRun = options.force || status === "live" || status === "paused";
  const summary = {
    workflowId: workflow.id,
    workflowName: workflow.name,
    status,
    enrolled: 0,
    processed: 0,
    sent: 0,
    waiting: 0,
    completed: 0,
    failed: 0,
    creditBlocked: 0,
    skipped: false,
  };

  if (!shouldRun) {
    summary.skipped = true;
    return summary;
  }

  if (options.enroll && String(workflow.trigger_type || "list_joined") === "list_joined" && workflow.trigger_list_id) {
    try {
      const { data: enrolledData, error: enrollError } = await admin.rpc("enroll_workflow_contacts", {
        p_workflow_id: workflow.id,
        p_limit: 400,
      });
      if (enrollError) {
        throw new Error(enrollError.message);
      }
      summary.enrolled = Number(enrolledData || 0);
    } catch (error) {
      await logAutomationEvent(
        workflow,
        null,
        "enroll_failed",
        null,
        getErrorMessage(error),
        {}
      );
    }
  }

  await admin
    .from("automation_contacts")
    .update({
      status: "active",
      processing_started_at: null,
    })
    .eq("workflow_id", workflow.id)
    .eq("status", "processing")
    .lt("processing_started_at", addMinutes(new Date(), -15).toISOString());

  const graphRuntime = normalizeWorkflowGraph(workflow);
  const claimedContacts = await claimDueContacts(workflow.id, options.batchSize || DUE_CONTACTS_BATCH);
  for (const contact of claimedContacts) {
    summary.processed += 1;
    const result = await processContact(workflow, contact, graphRuntime);
    summary.sent += Number(result?.sent || 0);
    summary.waiting += Number(result?.waiting || 0);
    summary.completed += Number(result?.completed || 0);
    summary.failed += Number(result?.failed || 0);
    summary.creditBlocked += Number(result?.creditBlocked || 0);
  }

  const finishedAt = new Date().toISOString();
  await admin
    .from("automation_workflows")
    .update({
      last_run_at: finishedAt,
      run_summary: {
        ...summary,
        finishedAt,
      },
    })
    .eq("id", workflow.id);

  return summary;
};

const loadWorkflow = async (workflowId: string, userId?: string) => {
  let query = admin.from("automation_workflows").select("*").eq("id", workflowId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const payload =
      req.method === "POST"
        ? await req.json().catch(() => ({}))
        : Object.fromEntries(new URL(req.url).searchParams.entries());

    const action = String(payload.action || "tick").toLowerCase();
    const workflowId = payload.workflowId || payload.workflow_id || null;
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const token = getBearerToken(req);
    const serviceCall = isServiceToken(token);
    const user = authHeader ? await getRequestUser(authHeader) : null;

    if (!serviceCall && !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (action === "enroll_now") {
      if (!workflowId) return jsonResponse({ error: "workflowId is required" }, 400);

      const workflow = await loadWorkflow(String(workflowId), serviceCall ? undefined : user?.id);
      if (!workflow) return jsonResponse({ error: "Workflow not found" }, 404);

      const { data, error } = await admin.rpc("enroll_workflow_contacts", {
        p_workflow_id: workflow.id,
        p_limit: Number(payload.limit || 1000),
      });
      if (error) throw new Error(error.message);

      await logAutomationEvent(
        workflow,
        null,
        "manual_enroll",
        null,
        "Manual enrollment completed.",
        { enrolled: Number(data || 0) }
      );

      return jsonResponse({
        success: true,
        action,
        workflowId: workflow.id,
        enrolled: Number(data || 0),
      });
    }

    if (action === "run_now") {
      if (!workflowId) return jsonResponse({ error: "workflowId is required" }, 400);

      const workflow = await loadWorkflow(String(workflowId), serviceCall ? undefined : user?.id);
      if (!workflow) return jsonResponse({ error: "Workflow not found" }, 404);

      const summary = await runWorkflow(workflow, {
        force: true,
        enroll: true,
        batchSize: Number(payload.batchSize || DUE_CONTACTS_BATCH),
      });
      return jsonResponse({ success: true, action, summary });
    }

    const runLiveOnly = action === "tick";
    let workflowQuery = admin
      .from("automation_workflows")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(Number(payload.maxWorkflows || 40));

    if (runLiveOnly) {
      workflowQuery = workflowQuery.eq("status", "live");
    } else if (action === "run_all") {
      workflowQuery = workflowQuery.in("status", ["live", "paused"]);
    }

    if (!serviceCall && user?.id) {
      workflowQuery = workflowQuery.eq("user_id", user.id);
    }

    const { data: workflows, error: workflowsError } = await workflowQuery;
    if (workflowsError) throw new Error(workflowsError.message);

    const results = [];
    for (const workflow of workflows || []) {
      const summary = await runWorkflow(workflow, {
        force: !runLiveOnly,
        enroll: true,
        batchSize: Number(payload.batchSize || DUE_CONTACTS_BATCH),
      });
      results.push(summary);
    }

    const totals = results.reduce(
      (acc, row) => {
        acc.workflows += 1;
        acc.enrolled += Number(row.enrolled || 0);
        acc.processed += Number(row.processed || 0);
        acc.sent += Number(row.sent || 0);
        acc.waiting += Number(row.waiting || 0);
        acc.completed += Number(row.completed || 0);
        acc.failed += Number(row.failed || 0);
        acc.creditBlocked += Number(row.creditBlocked || 0);
        return acc;
      },
      {
        workflows: 0,
        enrolled: 0,
        processed: 0,
        sent: 0,
        waiting: 0,
        completed: 0,
        failed: 0,
        creditBlocked: 0,
      }
    );

    return jsonResponse({
      success: true,
      action,
      service: serviceCall,
      totals,
      workflows: results,
    });
  } catch (error) {
    console.error("automation-runner error:", getErrorMessage(error));
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});
