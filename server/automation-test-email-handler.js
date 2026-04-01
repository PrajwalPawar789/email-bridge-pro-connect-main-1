import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { looksLikeHtml, normalizePlainTextEmailBody } from "../shared/email-content.js";

const EMAIL_BUILDER_STATE_REGEX = /<!--\s*IntentAtlas_EMAIL_BUILDER_STATE:([\s\S]*?)-->/;

let adminClient = null;
let adminClientCacheKey = "";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const getEnvValue = (env, key) => {
  const primary = env?.[key];
  if (typeof primary === "string" && primary.trim()) {
    return primary.trim();
  }

  const fallback = process.env[key];
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback.trim();
  }

  return "";
};

const getSupabaseUrl = (env) =>
  getEnvValue(env, "SUPABASE_URL") || getEnvValue(env, "VITE_SUPABASE_URL");

const getAdmin = (env) => {
  const supabaseUrl = getSupabaseUrl(env);
  const serviceRoleKey = getEnvValue(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new HttpError(500, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const cacheKey = `${supabaseUrl}:${serviceRoleKey}`;
  if (!adminClient || adminClientCacheKey !== cacheKey) {
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    adminClientCacheKey = cacheKey;
  }

  return adminClient;
};

const safeJsonObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildHiddenPreheaderHtml = (value) => {
  const preheader = String(value || "").trim();
  if (!preheader) return "";

  return `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;color:transparent;">${escapeHtml(
    preheader
  )}</div>`;
};

const fromBase64 = (value) => Buffer.from(String(value || "").replace(/\s+/g, ""), "base64").toString("utf8");

const renderBuilderBlocksText = (blocks) =>
  blocks
    .map((block) => String(block?.content?.text || "").trim())
    .filter(Boolean)
    .join("\n\n");

const renderBuilderBlocksHtml = (blocks) =>
  blocks
    .map((block) => {
      const html = String(block?.content?.html || "").trim();
      if (html) return html;

      const text = String(block?.content?.text || "");
      return text ? escapeHtml(text).replace(/\n/g, "<br />") : "";
    })
    .filter(Boolean)
    .join("\n");

const extractBuilderStateContent = (content) => {
  const match = String(content || "").match(EMAIL_BUILDER_STATE_REGEX);
  if (!match?.[1]) {
    return {
      cleanContent: String(content || ""),
      builderText: "",
      builderHtml: "",
      preheader: "",
    };
  }

  const cleanContent = String(content || "").replace(EMAIL_BUILDER_STATE_REGEX, "").trim();
  try {
    const decoded = fromBase64(match[1]);
    const parsed = JSON.parse(decoded);
    const meta = parsed?.meta && typeof parsed.meta === "object" ? parsed.meta : {};
    const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];

    return {
      cleanContent,
      builderText: renderBuilderBlocksText(blocks),
      builderHtml: renderBuilderBlocksHtml(blocks),
      preheader: typeof meta.preheader === "string" ? meta.preheader : "",
    };
  } catch {
    return {
      cleanContent,
      builderText: "",
      builderHtml: "",
      preheader: "",
    };
  }
};

const formatPlainTextToHtml = (value) => {
  if (!value) return "";

  return escapeHtml(value)
    .split(/\r?\n\r?\n/)
    .map((block) => `<p>${block.replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
};

const getHeader = (headers, name) => {
  if (!headers) return "";

  if (typeof headers.get === "function") {
    return headers.get(name) || headers.get(name.toLowerCase()) || "";
  }

  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  if (!match) return "";

  const [, value] = match;
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
};

const getBearerToken = (headers) => {
  const authHeader = getHeader(headers, "authorization");
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authHeader.slice(7).trim();
};

const resolveUserId = async (headers, env) => {
  const token = getBearerToken(headers);
  if (!token) {
    throw new HttpError(401, "Missing bearer token.");
  }

  const { data, error } = await getAdmin(env).auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new HttpError(401, "Invalid user session.");
  }

  return data.user.id;
};

const loadEmailConfig = async (userId, senderConfigId, env) => {
  const normalizedId = String(senderConfigId || "").trim();
  if (!normalizedId) {
    throw new HttpError(400, "Choose a sender account before sending a test email.");
  }

  const { data, error } = await getAdmin(env)
    .from("email_configs")
    .select("id, smtp_host, smtp_port, smtp_username, smtp_password, security, sender_name")
    .eq("id", normalizedId)
    .eq("user_id", userId)
    .or("is_active.is.null,is_active.eq.true")
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message);
  }

  if (!data) {
    throw new HttpError(404, "Selected sender account was not found or is inactive.");
  }

  return data;
};

const loadTemplateIfNeeded = async (userId, templateId, env) => {
  const normalizedId = String(templateId || "").trim();
  if (!normalizedId) return null;

  const { data, error } = await getAdmin(env)
    .from("email_templates")
    .select("id, subject, content, is_html")
    .eq("id", normalizedId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message);
  }

  return data;
};

const personalize = (input, contact, state, sender) => {
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

  const replacements = {
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email,
    company,
    job_title: jobTitle,
    sender_name: senderName,
    sender_email: senderEmail,
  };

  let value = String(input || "");
  Object.entries(replacements).forEach(([token, replacement]) => {
    const regex = new RegExp(`\\{\\s*${token}\\s*\\}`, "gi");
    value = value.replace(regex, replacement || "");
  });

  return value;
};

export const sendAutomationTestEmailFromServer = async ({ headers, payload, env = process.env }) => {
  const userId = await resolveUserId(headers, env);
  const requestPayload = safeJsonObject(payload);

  const toEmail = normalizeEmail(requestPayload.toEmail || requestPayload.to_email);
  if (!isValidEmail(toEmail)) {
    throw new HttpError(400, "A valid recipient email is required.");
  }

  const senderConfigId = String(requestPayload.senderConfigId || requestPayload.sender_config_id || "").trim();
  const workflowName = String(requestPayload.workflowName || "Automation").trim() || "Automation";
  const templateId = String(requestPayload.templateId || requestPayload.template_id || "").trim();
  const subjectInput = String(requestPayload.subject || "").trim();
  const bodyInput = String(requestPayload.body || "").trim();
  const previewData = safeJsonObject(requestPayload.previewData);

  const sender = await loadEmailConfig(userId, senderConfigId, env);
  const template = await loadTemplateIfNeeded(userId, templateId || null, env);

  const subjectRaw = subjectInput || String(template?.subject || "").trim();
  const bodyRaw = bodyInput || String(template?.content || "").trim();
  if (!subjectRaw) {
    throw new HttpError(400, "Email subject is required.");
  }

  if (!bodyRaw) {
    throw new HttpError(400, "Email body is required.");
  }

  const sampleContact = {
    full_name: String(previewData.full_name || previewData.name || "Avery Johnson").trim(),
    email: toEmail,
  };
  const sampleState = {
    company: String(previewData.company || "Acme Inc").trim(),
    job_title: String(previewData.job_title || "Head of Growth").trim(),
    ...previewData,
  };

  const builderStateContent = extractBuilderStateContent(bodyRaw);
  const sourceTextBody = builderStateContent.builderText || builderStateContent.cleanContent;
  const sourceHtmlBody = builderStateContent.builderHtml || builderStateContent.cleanContent;
  const isHtml =
    Boolean(builderStateContent.builderHtml) ||
    Boolean(template?.is_html) ||
    looksLikeHtml(builderStateContent.cleanContent);

  const personalizedSubject = personalize(subjectRaw, sampleContact, sampleState, sender);
  const personalizedBody = personalize(sourceTextBody, sampleContact, sampleState, sender);
  const personalizedHtmlBody = personalize(sourceHtmlBody, sampleContact, sampleState, sender);
  const personalizedPreheaderHtml = builderStateContent.builderHtml
    ? buildHiddenPreheaderHtml(
        personalize(builderStateContent.preheader || "", sampleContact, sampleState, sender)
      )
    : "";
  const plainTextBody = normalizePlainTextEmailBody(personalizedBody);
  const htmlBody = isHtml
    ? `${personalizedPreheaderHtml}${personalizedHtmlBody}`
    : formatPlainTextToHtml(plainTextBody);

  const smtpPort = Number(sender.smtp_port || 587);
  const transporter = nodemailer.createTransport({
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
  const senderName = String(sender.sender_name || "").trim() || workflowName;
  const info = await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to: toEmail,
    subject: personalizedSubject,
    html: htmlBody,
    text: plainTextBody,
    headers: {
      Date: new Date().toUTCString(),
      "X-Mailer": "IntentAtlas Automation Test",
    },
  });

  return {
    success: true,
    messageId: String(info?.messageId || ""),
    toEmail,
    subject: personalizedSubject,
    senderName,
    senderEmail,
  };
};

export const readJsonRequestBody = async (req) => {
  if (req.body != null) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }

    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
};

export const toAutomationTestEmailErrorResponse = (error) => {
  const status = Number(error?.status) || 500;
  const message = error instanceof Error ? error.message : "Unable to send automation test email.";

  return {
    status,
    body: {
      error: message,
    },
  };
};
