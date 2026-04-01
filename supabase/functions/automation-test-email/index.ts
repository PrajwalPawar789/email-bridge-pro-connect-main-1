// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTransport } from "npm:nodemailer@6.9.7";
import { looksLikeHtml, normalizePlainTextEmailBody } from "../../../shared/email-content.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

let adminClient: ReturnType<typeof createClient> | null = null;

const getAdmin = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
  }

  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }

  return adminClient;
};

const EMAIL_BUILDER_STATE_REGEX = /<!--\s*IntentAtlas_EMAIL_BUILDER_STATE:([\s\S]*?)-->/;

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

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildHiddenPreheaderHtml = (value: string) => {
  const preheader = String(value || "").trim();
  if (!preheader) return "";
  return `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;color:transparent;">${escapeHtml(
    preheader
  )}</div>`;
};

const fromBase64 = (value: string) => {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const renderBuilderBlocksText = (blocks: any[]) =>
  blocks
    .map((block) => String(block?.content?.text || "").trim())
    .filter(Boolean)
    .join("\n\n");

const renderBuilderBlocksHtml = (blocks: any[]) =>
  blocks
    .map((block) => {
      const html = String(block?.content?.html || "").trim();
      if (html) return html;
      const text = String(block?.content?.text || "");
      return text ? escapeHtml(text).replace(/\n/g, "<br />") : "";
    })
    .filter(Boolean)
    .join("\n");

const extractBuilderStateContent = (content: string) => {
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

const formatPlainTextToHtml = (value: string) => {
  if (!value) return "";
  const escaped = escapeHtml(value);
  return escaped
    .split(/\r?\n\r?\n/)
    .map((block) => `<p>${block.replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
};

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
};

const resolveUserId = async (req: Request) => {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new Error("Invalid user session.");
  }

  return data.user.id;
};

const loadEmailConfig = async (userId: string, senderConfigId: string) => {
  const normalizedId = String(senderConfigId || "").trim();
  if (!normalizedId) {
    throw new Error("Choose a sender account before sending a test email.");
  }

  const { data, error } = await getAdmin()
    .from("email_configs")
    .select("id, smtp_host, smtp_port, smtp_username, smtp_password, security, sender_name")
    .eq("id", normalizedId)
    .eq("user_id", userId)
    .or("is_active.is.null,is_active.eq.true")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Selected sender account was not found or is inactive.");
  return data;
};

const loadTemplateIfNeeded = async (userId: string, templateId?: string | null) => {
  const normalizedId = String(templateId || "").trim();
  if (!normalizedId) return null;

  const { data, error } = await getAdmin()
    .from("email_templates")
    .select("id, subject, content, is_html")
    .eq("id", normalizedId)
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

  let value = String(input || "");
  Object.entries(replacements).forEach(([token, replacement]) => {
    const regex = new RegExp(`\\{\\s*${token}\\s*\\}`, "gi");
    value = value.replace(regex, replacement || "");
  });
  return value;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const userId = await resolveUserId(req);
    const payload = safeJsonObject(await req.json().catch(() => ({})));

    const toEmail = normalizeEmail(payload.toEmail || payload.to_email);
    if (!isValidEmail(toEmail)) {
      return jsonResponse({ error: "A valid recipient email is required." }, 400);
    }

    const senderConfigId = String(payload.senderConfigId || payload.sender_config_id || "").trim();
    const workflowName = String(payload.workflowName || "Automation").trim() || "Automation";
    const templateId = String(payload.templateId || payload.template_id || "").trim();
    const subjectInput = String(payload.subject || "").trim();
    const bodyInput = String(payload.body || "").trim();
    const previewData = safeJsonObject(payload.previewData);

    const sender = await loadEmailConfig(userId, senderConfigId);
    const template = await loadTemplateIfNeeded(userId, templateId || null);

    const subjectRaw = subjectInput || String(template?.subject || "").trim();
    const bodyRaw = bodyInput || String(template?.content || "").trim();
    if (!subjectRaw) {
      return jsonResponse({ error: "Email subject is required." }, 400);
    }
    if (!bodyRaw) {
      return jsonResponse({ error: "Email body is required." }, 400);
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
    const plainTextBody = isHtml
      ? normalizePlainTextEmailBody(personalizedBody)
      : normalizePlainTextEmailBody(personalizedBody);
    const htmlBody = isHtml
      ? `${personalizedPreheaderHtml}${personalizedHtmlBody}`
      : formatPlainTextToHtml(plainTextBody);

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

    return jsonResponse({
      success: true,
      messageId: String(info?.messageId || ""),
      toEmail,
      subject: personalizedSubject,
      senderName,
      senderEmail,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("automation-test-email error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
