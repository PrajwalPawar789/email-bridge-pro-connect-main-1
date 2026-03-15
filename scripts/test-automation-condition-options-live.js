import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { createTransport } from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const args = process.argv.slice(2);
const getArgValue = (name, fallback = "") => {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }
  return fallback;
};

const recipientEmail = String(getArgValue("--recipient", "prajwalrpawar2001@gmail.com")).trim().toLowerCase();
const keepWorkflows = args.includes("--keep-workflows");

const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chromeUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

const safeError = (error) => (error instanceof Error ? error.message : String(error));

const waitFor = async (label, fn, { timeoutMs = 180000, intervalMs = 5000 } = {}) => {
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started <= timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  if (lastError) {
    throw new Error(`Timed out while waiting for ${label}: ${safeError(lastError)}`);
  }
  throw new Error(`Timed out while waiting for ${label}.`);
};

const pickWorkflowOwner = async () => {
  const { data, error } = await admin
    .from("automation_workflows")
    .select("user_id")
    .eq("trigger_type", "custom_event")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find workflow owner: ${error.message}`);
  }
  if (!data?.user_id) {
    throw new Error("No custom_event workflow owner found.");
  }
  return String(data.user_id);
};

const getOwnerAccessToken = async (userId) => {
  const { data: ownerUser, error: ownerError } = await admin.auth.admin.getUserById(userId);
  if (ownerError || !ownerUser?.user?.email) {
    throw new Error(`Failed to load workflow owner auth user: ${ownerError?.message || "owner email missing"}`);
  }

  const ownerEmail = String(ownerUser.user.email || "").trim().toLowerCase();
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: ownerEmail,
    options: {
      redirectTo: "http://localhost/auth/confirm",
    },
  });

  if (generated.error) {
    throw new Error(`Failed to generate owner magic link: ${generated.error.message}`);
  }

  const emailOtp = generated.data?.properties?.email_otp;
  if (!emailOtp) {
    throw new Error("Owner magic link did not return email_otp.");
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const verified = await anon.auth.verifyOtp({
    email: ownerEmail,
    token: emailOtp,
    type: "magiclink",
  });

  if (verified.error || !verified.data?.session?.access_token) {
    throw new Error(`Failed to verify owner magic link: ${verified.error?.message || "access token missing"}`);
  }

  return {
    email: ownerEmail,
    accessToken: String(verified.data.session.access_token),
  };
};

const getMailboxConfig = async (userId, email) => {
  const { data, error } = await admin
    .from("email_configs")
    .select(
      "id, user_id, smtp_host, smtp_port, smtp_username, smtp_password, security, sender_name, imap_host, imap_port, is_active"
    )
    .eq("user_id", userId)
    .ilike("smtp_username", email)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load mailbox config for ${email}: ${error.message}`);
  }

  return data || null;
};

const pickSenderConfig = async (userId, excludedEmail) => {
  const { data, error } = await admin
    .from("email_configs")
    .select(
      "id, user_id, smtp_host, smtp_port, smtp_username, smtp_password, security, sender_name, imap_host, imap_port, is_active"
    )
    .eq("user_id", userId)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to pick sender config: ${error.message}`);
  }

  const configs = Array.isArray(data) ? data : [];
  const preferred =
    configs.find((row) => String(row.smtp_username || "").trim().toLowerCase() !== excludedEmail) || configs[0];

  if (!preferred) {
    throw new Error("No active sender config found.");
  }

  return preferred;
};

const invokeFunction = async (functionName, body, { bearerToken = serviceRoleKey, apiKey = "" } = {}) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
      ...(apiKey ? { apikey: apiKey } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(`${functionName} failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
};

const invokeRunner = async ({ workflowId, contactId, ownerAccessToken }) =>
  invokeFunction(
    "automation-runner",
    {
      action: "run_now",
      workflowId,
      contactId,
      batchSize: 20,
    },
    {
      bearerToken: ownerAccessToken,
      apiKey: anonKey,
    }
  );

const invokeRunnerTickRpc = async () => {
  const { error } = await admin.rpc("invoke_automation_runner");
  if (error) {
    throw new Error(`invoke_automation_runner RPC failed: ${error.message}`);
  }
  return { success: true, via: "rpc_tick" };
};

const invokeRunnerWithFallback = async ({ workflowId, contactId, ownerAccessToken }) => {
  try {
    const response = await invokeRunner({ workflowId, contactId, ownerAccessToken });
    return { ...response, via: "edge_function" };
  } catch (error) {
    const message = safeError(error);
    if (!/401|unauthorized/i.test(message)) {
      throw error;
    }
    return invokeRunnerTickRpc();
  }
};

const invokeReplyCheckSafe = async (configId) => {
  try {
    const payload = await invokeFunction("check-email-replies", {
      config_id: configId,
      lookback_days: 2,
      use_db_scan: false,
    });
    return { ok: true, payload };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
};

const callAutomationWebhook = async ({ workflowId, eventName, email, fullName, state = {}, data = {} }) => {
  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/automation-webhook?workflowId=${encodeURIComponent(workflowId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        event: eventName,
        email,
        name: fullName,
        state,
        data: {
          company: "Live Condition E2E",
          job_title: "Owner",
          ...data,
        },
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`automation-webhook failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
};

const createWorkflow = async ({ userId, name, description, eventName, graph }) => {
  const { data, error } = await admin
    .from("automation_workflows")
    .insert({
      user_id: userId,
      name,
      description,
      status: "live",
      trigger_type: "custom_event",
      trigger_filters: { event_name: eventName },
      flow: [{ id: "legacy_stop", name: "Stop", type: "stop", config: {} }],
      settings: {
        workflow_graph: graph,
      },
      published_at: nowIso(),
    })
    .select("id, user_id, name, status")
    .single();

  if (error) {
    throw new Error(`Failed to create workflow: ${error.message}`);
  }

  return data;
};

const fetchContact = async (workflowId, email) => {
  const { data, error } = await admin
    .from("automation_contacts")
    .select("id, workflow_id, email, status, current_step, next_run_at, state, last_error, updated_at")
    .eq("workflow_id", workflowId)
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch contact: ${error.message}`);
  }

  return data || null;
};

const fetchContacts = async (workflowId) => {
  const { data, error } = await admin
    .from("automation_contacts")
    .select("id, email, status, current_step, next_run_at, state, last_error, updated_at")
    .eq("workflow_id", workflowId)
    .order("updated_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch contacts: ${error.message}`);
  }

  return data || [];
};

const fetchLogs = async (workflowId) => {
  const { data, error } = await admin
    .from("automation_logs")
    .select("event_type, message, metadata, created_at, contact_id, step_index")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch workflow logs: ${error.message}`);
  }

  return data || [];
};

const buildTransport = (config) => {
  const smtpPort = Number(config.smtp_port || 587);
  return createTransport({
    host: config.smtp_host,
    port: smtpPort,
    secure: String(config.security || "TLS").toUpperCase() === "SSL" && smtpPort === 465,
    auth: {
      user: config.smtp_username,
      pass: config.smtp_password,
    },
    connectionTimeout: 60000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
  });
};

const sendReply = async ({ replyConfig, originalMessage, toEmail, runId, bodyText }) => {
  const transport = buildTransport(replyConfig);
  const subject = String(originalMessage.subject || "");
  const normalizedSubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const body = bodyText || `Reply from live automation condition test ${runId}.`;

  const headers = {};
  if (originalMessage.message_id) {
    headers["In-Reply-To"] = String(originalMessage.message_id);
    headers["References"] = String(originalMessage.message_id);
  }

  const info = await transport.sendMail({
    from: `"${replyConfig.sender_name || replyConfig.smtp_username}" <${replyConfig.smtp_username}>`,
    to: toEmail,
    subject: normalizedSubject,
    text: body,
    headers,
  });

  return {
    messageId: info?.messageId || null,
    subject: normalizedSubject,
    body,
  };
};

const getNextMessageUid = async (configId) => {
  const { data, error } = await admin
    .from("email_messages")
    .select("uid")
    .eq("config_id", configId)
    .order("uid", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load next message uid: ${error.message}`);
  }

  return Number(data?.uid || 0) + 1;
};

const storeInboundReplyMessage = async ({
  workflowUserId,
  senderConfigId,
  fromEmail,
  toEmail,
  replyResult,
  originalMessageId,
  threadId,
}) => {
  const nextUid = await getNextMessageUid(senderConfigId);
  const row = {
    user_id: workflowUserId,
    config_id: senderConfigId,
    uid: nextUid,
    from_email: fromEmail,
    to_email: toEmail,
    to_emails: [toEmail],
    cc_emails: [],
    subject: replyResult.subject,
    body: replyResult.body,
    date: new Date().toISOString(),
    folder: "INBOX",
    read: false,
    message_id: replyResult.messageId,
    in_reply_to: originalMessageId || null,
    references: originalMessageId ? [originalMessageId] : [],
    attachments: [],
    thread_id: threadId || originalMessageId || replyResult.messageId,
    direction: "inbound",
  };

  const { data, error } = await admin
    .from("email_messages")
    .insert(row)
    .select("id, subject, date, message_id, in_reply_to, thread_id, body")
    .single();

  if (error) {
    throw new Error(`Failed to store inbound reply message: ${error.message}`);
  }

  return data;
};

const pauseWorkflow = async (workflowId) => {
  const { error } = await admin
    .from("automation_workflows")
    .update({ status: "paused" })
    .eq("id", workflowId);

  if (error) {
    throw new Error(`Failed to pause workflow ${workflowId}: ${error.message}`);
  }
};

const buildSendEmailConfig = ({ subject, body, senderConfigId, html = false }) => ({
  subject,
  body,
  senderConfigId,
  sender_config_id: senderConfigId,
  templateId: "",
  template_id: "",
  personalizationTokens: ["{first_name}", "{company}", "{sender_name}"],
  threadWithPrevious: true,
  thread_with_previous: true,
  isHtml: html,
  is_html: html,
});

const createConditionGraph = ({
  runId,
  senderConfigId,
  rule,
  value = "",
  initialBody,
  initialHtml = false,
  withInitialEmail = true,
}) => {
  const nodes = [
    {
      id: "trigger_1",
      kind: "trigger",
      title: "Trigger",
      status: "live",
      position: { x: 80, y: 180 },
      config: { triggerType: "custom_event" },
    },
  ];

  const edges = [];
  let previousNodeId = "trigger_1";

  if (withInitialEmail) {
    nodes.push({
      id: "send_initial",
      kind: "send_email",
      title: "Send Initial Email",
      status: "live",
      position: { x: 360, y: 180 },
      config: buildSendEmailConfig({
        subject: `Live condition test ${rule} ${runId}`,
        body: initialBody,
        senderConfigId,
        html: initialHtml,
      }),
    });
    edges.push({
      id: "edge_trigger_send",
      source: "trigger_1",
      target: "send_initial",
      sourceHandle: "out",
      targetHandle: "in",
    });
    previousNodeId = "send_initial";
  }

  nodes.push(
    {
      id: "condition_1",
      kind: "condition",
      title: "Condition",
      status: "live",
      position: { x: withInitialEmail ? 660 : 360, y: 180 },
      config: {
        clauses: [
          {
            id: "if",
            rule,
            comparator: rule === "tag_exists" || rule === "custom_event" || rule === "email_reply_contains" ? "contains" : "exists",
            value,
          },
        ],
      },
    },
    {
      id: "send_if",
      kind: "send_email",
      title: "If Branch Email",
      status: "live",
      position: { x: withInitialEmail ? 980 : 700, y: 60 },
      config: buildSendEmailConfig({
        subject: `IF branch ${rule} ${runId}`,
        body: `Condition ${rule} matched for ${runId}.`,
        senderConfigId,
      }),
    },
    {
      id: "send_else",
      kind: "send_email",
      title: "Else Branch Email",
      status: "live",
      position: { x: withInitialEmail ? 980 : 700, y: 300 },
      config: buildSendEmailConfig({
        subject: `ELSE branch ${rule} ${runId}`,
        body: `Condition ${rule} did not match for ${runId}.`,
        senderConfigId,
      }),
    },
    {
      id: "exit_if",
      kind: "exit",
      title: "Exit If",
      status: "live",
      position: { x: withInitialEmail ? 1260 : 1000, y: 60 },
      config: { reason: "completed" },
    },
    {
      id: "exit_else",
      kind: "exit",
      title: "Exit Else",
      status: "live",
      position: { x: withInitialEmail ? 1260 : 1000, y: 300 },
      config: { reason: "completed" },
    }
  );

  edges.push(
    {
      id: `edge_${previousNodeId}_condition`,
      source: previousNodeId,
      target: "condition_1",
      sourceHandle: "out",
      targetHandle: "in",
    },
    {
      id: "edge_condition_if",
      source: "condition_1",
      target: "send_if",
      sourceHandle: "if",
      targetHandle: "in",
    },
    {
      id: "edge_condition_else",
      source: "condition_1",
      target: "send_else",
      sourceHandle: "else",
      targetHandle: "in",
    },
    {
      id: "edge_send_if_exit",
      source: "send_if",
      target: "exit_if",
      sourceHandle: "out",
      targetHandle: "in",
    },
    {
      id: "edge_send_else_exit",
      source: "send_else",
      target: "exit_else",
      sourceHandle: "out",
      targetHandle: "in",
    }
  );

  return {
    id: `wf_condition_${rule}_${runId}`,
    name: `Condition ${rule} ${runId}`,
    status: "live",
    version: 1,
    nodes,
    edges,
  };
};

const createSplitGraph = ({ runId, senderConfigId, percentageA = 50, percentageB = 50 }) => ({
  id: `wf_split_${runId}`,
  name: `Split ${runId}`,
  status: "live",
  version: 1,
  nodes: [
    {
      id: "trigger_1",
      kind: "trigger",
      title: "Trigger",
      status: "live",
      position: { x: 80, y: 180 },
      config: { triggerType: "custom_event" },
    },
    {
      id: "split_1",
      kind: "split",
      title: "A/B Split",
      status: "live",
      position: { x: 360, y: 180 },
      config: { percentageA, percentageB },
    },
    {
      id: "send_a",
      kind: "send_email",
      title: "Variant A Email",
      status: "live",
      position: { x: 660, y: 60 },
      config: buildSendEmailConfig({
        subject: `Split A ${runId}`,
        body: `Variant A path for ${runId}.`,
        senderConfigId,
      }),
    },
    {
      id: "send_b",
      kind: "send_email",
      title: "Variant B Email",
      status: "live",
      position: { x: 660, y: 300 },
      config: buildSendEmailConfig({
        subject: `Split B ${runId}`,
        body: `Variant B path for ${runId}.`,
        senderConfigId,
      }),
    },
    {
      id: "exit_a",
      kind: "exit",
      title: "Exit A",
      status: "live",
      position: { x: 940, y: 60 },
      config: { reason: "completed" },
    },
    {
      id: "exit_b",
      kind: "exit",
      title: "Exit B",
      status: "live",
      position: { x: 940, y: 300 },
      config: { reason: "completed" },
    },
  ],
  edges: [
    {
      id: "edge_trigger_split",
      source: "trigger_1",
      target: "split_1",
      sourceHandle: "out",
      targetHandle: "in",
    },
    {
      id: "edge_split_a",
      source: "split_1",
      target: "send_a",
      sourceHandle: "a",
      targetHandle: "in",
    },
    {
      id: "edge_split_b",
      source: "split_1",
      target: "send_b",
      sourceHandle: "b",
      targetHandle: "in",
    },
    {
      id: "edge_send_a_exit",
      source: "send_a",
      target: "exit_a",
      sourceHandle: "out",
      targetHandle: "in",
    },
    {
      id: "edge_send_b_exit",
      source: "send_b",
      target: "exit_b",
      sourceHandle: "out",
      targetHandle: "in",
    },
  ],
});

const waitForInitialSend = async (workflowId, email) =>
  waitFor(
    "initial automation email send",
    async () => {
      const logs = await fetchLogs(workflowId);
      return logs.find(
        (log) =>
          log.event_type === "email_sent" &&
          String(log.message || "").includes(email) &&
          String(log.metadata?.node_id || "") === "send_initial"
      )
        ? logs
        : null;
    },
    { timeoutMs: 180000, intervalMs: 4000 }
  );

const waitForBranchOutcome = async ({ workflowId, ownerAuth, contactId }) => {
  const findOutcome = async () => {
    const logs = await fetchLogs(workflowId);
    const conditionLog = [...logs].reverse().find((log) => log.event_type === "condition_evaluated") || null;
    const branchEmailLog =
      [...logs].reverse().find(
        (log) =>
          log.event_type === "email_sent" &&
          (String(log.metadata?.node_id || "") === "send_if" || String(log.metadata?.node_id || "") === "send_else")
      ) || null;
    return conditionLog && branchEmailLog ? { conditionLog, branchEmailLog, logs } : null;
  };

  let outcome = null;
  try {
    outcome = await waitFor("condition branch resolution", findOutcome, {
      timeoutMs: 45000,
      intervalMs: 4000,
    });
  } catch {
    await invokeRunnerWithFallback({
      workflowId,
      contactId,
      ownerAccessToken: ownerAuth.accessToken,
    });
    outcome = await waitFor("condition branch resolution after manual runner", findOutcome, {
      timeoutMs: 60000,
      intervalMs: 4000,
    });
  }

  return outcome;
};

const triggerTrackingOpen = async (trackingUrl) => {
  const response = await fetch(trackingUrl, {
    method: "GET",
    headers: {
      "user-agent": chromeUserAgent,
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "sec-fetch-mode": "no-cors",
      "sec-fetch-dest": "image",
      "sec-fetch-site": "cross-site",
    },
  });

  return {
    ok: response.ok,
    status: response.status,
  };
};

const triggerTrackingClick = async (trackingUrl) => {
  const response = await fetch(trackingUrl, {
    method: "GET",
    redirect: "manual",
    headers: {
      "user-agent": chromeUserAgent,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
      "sec-fetch-site": "cross-site",
    },
  });

  return {
    ok: response.ok || [301, 302, 303, 307, 308].includes(response.status),
    status: response.status,
    location: response.headers.get("location") || null,
  };
};

const summarizeContact = (contact) =>
  contact
    ? {
        id: contact.id,
        email: contact.email,
        status: contact.status,
        current_step: contact.current_step,
        next_run_at: contact.next_run_at,
        last_error: contact.last_error,
        state: {
          current_node_id: contact.state?.current_node_id || null,
          last_message_id: contact.state?.last_message_id || null,
          last_sent_at: contact.state?.last_sent_at || null,
          track_open_link: contact.state?.track_open_link || null,
          track_click_link: contact.state?.track_click_link || null,
        },
      }
    : null;

const runReplyConditionCase = async ({
  ownerUserId,
  ownerAuth,
  senderConfig,
  recipientConfig,
  rule,
  value = "",
}) => {
  const runId = `${rule}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const eventName = `cond_${rule}_${runId}`;
  const workflow = await createWorkflow({
    userId: ownerUserId,
    name: `Live ${rule} ${runId}`,
    description: `Temporary live test for ${rule}`,
    eventName,
    graph: createConditionGraph({
      runId,
      senderConfigId: senderConfig.id,
      rule,
      value,
      withInitialEmail: true,
      initialBody: `Hi {first_name},\n\nThis is the live ${rule} test ${runId}.\n\nPlease reply to this email.\n\nBest,\n{sender_name}`,
    }),
  });

  let workflowPaused = false;
  try {
    const webhook = await callAutomationWebhook({
      workflowId: workflow.id,
      eventName,
      email: recipientEmail,
      fullName: "Prajwal Pawar",
    });

    const contact = await waitFor(
      `${rule} contact creation`,
      async () => {
        const row = await fetchContact(workflow.id, recipientEmail);
        return row?.id ? row : null;
      },
      { timeoutMs: 120000, intervalMs: 3000 }
    );

    await waitForInitialSend(workflow.id, recipientEmail);
    const contactAfterSend = (await fetchContact(workflow.id, recipientEmail)) || contact;
    const recipientInboxCheck = await invokeReplyCheckSafe(recipientConfig.id);

    const replyText =
      rule === "email_reply_contains"
        ? `Reply from live automation test ${runId}. Includes token ${value}.`
        : `Reply from live automation test ${runId}.`;

    const replyResult = await sendReply({
      replyConfig: recipientConfig,
      originalMessage: {
        subject: contactAfterSend.state?.last_subject || `Live condition test ${rule} ${runId}`,
        message_id: contactAfterSend.state?.last_message_id || null,
      },
      toEmail: String(senderConfig.smtp_username || "").trim(),
      runId,
      bodyText: replyText,
    });

    const storedInboundReplyMessage = await storeInboundReplyMessage({
      workflowUserId: ownerUserId,
      senderConfigId: senderConfig.id,
      fromEmail: recipientEmail,
      toEmail: String(senderConfig.smtp_username || "").trim(),
      replyResult,
      originalMessageId: contactAfterSend.state?.last_message_id || null,
      threadId: contactAfterSend.state?.thread_id || contactAfterSend.state?.last_message_id || null,
    });

    const senderReplyCheck = await invokeReplyCheckSafe(senderConfig.id);
    const runner = await invokeRunnerWithFallback({
      workflowId: workflow.id,
      contactId: contact.id,
      ownerAccessToken: ownerAuth.accessToken,
    });
    const outcome = await waitForBranchOutcome({
      workflowId: workflow.id,
      ownerAuth,
      contactId: contact.id,
    });
    const finalContact = await fetchContact(workflow.id, recipientEmail);
    const pass =
      String(outcome.conditionLog?.metadata?.branch || "").toLowerCase() === "if" &&
      String(outcome.branchEmailLog?.metadata?.node_id || "") === "send_if";

    return {
      pass,
      workflowId: workflow.id,
      contact: summarizeContact(finalContact),
      webhook,
      recipientInboxCheck,
      senderReplyCheck,
      replyResult,
      storedInboundReplyMessage,
      runner,
      condition: {
        message: outcome.conditionLog.message,
        metadata: outcome.conditionLog.metadata,
        created_at: outcome.conditionLog.created_at,
      },
      branchEmail: {
        message: outcome.branchEmailLog.message,
        metadata: outcome.branchEmailLog.metadata,
        created_at: outcome.branchEmailLog.created_at,
      },
    };
  } finally {
    if (!keepWorkflows && workflow?.id && !workflowPaused) {
      await pauseWorkflow(workflow.id);
      workflowPaused = true;
    }
  }
};

const runOpenOrClickCase = async ({
  ownerUserId,
  ownerAuth,
  senderConfig,
  rule,
}) => {
  const runId = `${rule}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const eventName = `cond_${rule}_${runId}`;
  const htmlBody =
    rule === "email_clicked"
      ? `<p>Hi {first_name},</p><p>This is the live ${rule} test ${runId}.</p><p><a href="https://example.com/${runId}">Open example</a></p><p>Best,<br />{sender_name}</p>`
      : `<p>Hi {first_name},</p><p>This is the live ${rule} test ${runId}.</p><p>Best,<br />{sender_name}</p>`;

  const workflow = await createWorkflow({
    userId: ownerUserId,
    name: `Live ${rule} ${runId}`,
    description: `Temporary live test for ${rule}`,
    eventName,
    graph: createConditionGraph({
      runId,
      senderConfigId: senderConfig.id,
      rule,
      withInitialEmail: true,
      initialBody: htmlBody,
      initialHtml: true,
    }),
  });

  let workflowPaused = false;
  try {
    const webhook = await callAutomationWebhook({
      workflowId: workflow.id,
      eventName,
      email: recipientEmail,
      fullName: "Prajwal Pawar",
    });

    const contact = await waitFor(
      `${rule} contact creation`,
      async () => {
        const row = await fetchContact(workflow.id, recipientEmail);
        return row?.id ? row : null;
      },
      { timeoutMs: 120000, intervalMs: 3000 }
    );

    await waitForInitialSend(workflow.id, recipientEmail);
    const contactAfterSend = await waitFor(
      `${rule} tracking link availability`,
      async () => {
        const row = await fetchContact(workflow.id, recipientEmail);
        if (!row?.id) return null;
        const link = rule === "email_opened" ? row.state?.track_open_link : row.state?.track_click_link;
        return link ? row : null;
      },
      { timeoutMs: 120000, intervalMs: 3000 }
    );

    await sleep(35000);

    const trackingResult =
      rule === "email_opened"
        ? await triggerTrackingOpen(String(contactAfterSend.state?.track_open_link || ""))
        : await triggerTrackingClick(String(contactAfterSend.state?.track_click_link || ""));

    const eventLog = await waitFor(
      `${rule} tracking log`,
      async () => {
        const logs = await fetchLogs(workflow.id);
        return logs.find((log) => log.event_type === rule) ? logs : null;
      },
      { timeoutMs: 120000, intervalMs: 4000 }
    );

    const outcome = await waitForBranchOutcome({
      workflowId: workflow.id,
      ownerAuth,
      contactId: contact.id,
    });
    const finalContact = await fetchContact(workflow.id, recipientEmail);
    const pass =
      String(outcome.conditionLog?.metadata?.branch || "").toLowerCase() === "if" &&
      String(outcome.branchEmailLog?.metadata?.node_id || "") === "send_if";

    return {
      pass,
      workflowId: workflow.id,
      contact: summarizeContact(finalContact),
      webhook,
      trackingResult,
      eventLog: eventLog
        .filter((log) => log.event_type === rule)
        .slice(-1)
        .map((log) => ({
          message: log.message,
          metadata: log.metadata,
          created_at: log.created_at,
        }))[0] || null,
      condition: {
        message: outcome.conditionLog.message,
        metadata: outcome.conditionLog.metadata,
        created_at: outcome.conditionLog.created_at,
      },
      branchEmail: {
        message: outcome.branchEmailLog.message,
        metadata: outcome.branchEmailLog.metadata,
        created_at: outcome.branchEmailLog.created_at,
      },
    };
  } finally {
    if (!keepWorkflows && workflow?.id && !workflowPaused) {
      await pauseWorkflow(workflow.id);
      workflowPaused = true;
    }
  }
};

const runStateConditionCase = async ({
  ownerUserId,
  ownerAuth,
  senderConfig,
  rule,
  value,
  statePayload,
}) => {
  const runId = `${rule}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const eventName = rule === "custom_event" ? value : `cond_${rule}_${runId}`;
  const workflow = await createWorkflow({
    userId: ownerUserId,
    name: `Live ${rule} ${runId}`,
    description: `Temporary live test for ${rule}`,
    eventName,
    graph: createConditionGraph({
      runId,
      senderConfigId: senderConfig.id,
      rule,
      value,
      withInitialEmail: false,
    }),
  });

  let workflowPaused = false;
  try {
    const webhook = await callAutomationWebhook({
      workflowId: workflow.id,
      eventName,
      email: recipientEmail,
      fullName: "Prajwal Pawar",
      state: statePayload,
    });

    const contact = await waitFor(
      `${rule} contact creation`,
      async () => {
        const row = await fetchContact(workflow.id, recipientEmail);
        return row?.id ? row : null;
      },
      { timeoutMs: 120000, intervalMs: 3000 }
    );

    const outcome = await waitForBranchOutcome({
      workflowId: workflow.id,
      ownerAuth,
      contactId: contact.id,
    });
    const finalContact = await fetchContact(workflow.id, recipientEmail);
    const pass =
      String(outcome.conditionLog?.metadata?.branch || "").toLowerCase() === "if" &&
      String(outcome.branchEmailLog?.metadata?.node_id || "") === "send_if";

    return {
      pass,
      workflowId: workflow.id,
      webhook,
      contact: summarizeContact(finalContact),
      condition: {
        message: outcome.conditionLog.message,
        metadata: outcome.conditionLog.metadata,
        created_at: outcome.conditionLog.created_at,
      },
      branchEmail: {
        message: outcome.branchEmailLog.message,
        metadata: outcome.branchEmailLog.metadata,
        created_at: outcome.branchEmailLog.created_at,
      },
    };
  } finally {
    if (!keepWorkflows && workflow?.id && !workflowPaused) {
      await pauseWorkflow(workflow.id);
      workflowPaused = true;
    }
  }
};

const runSplitCase = async ({ ownerUserId, ownerAuth, senderConfig }) => {
  const runId = `split_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const eventName = `cond_split_${runId}`;
  const workflow = await createWorkflow({
    userId: ownerUserId,
    name: `Live split ${runId}`,
    description: "Temporary live split test",
    eventName,
    graph: createSplitGraph({
      runId,
      senderConfigId: senderConfig.id,
      percentageA: 50,
      percentageB: 50,
    }),
  });

  let workflowPaused = false;
  try {
    const triggerResults = [];
    for (let index = 0; index < 12; index += 1) {
      const splitEmail = `prajwalrpawar2001+split${index + 1}_${runId}@gmail.com`;
      const payload = await callAutomationWebhook({
        workflowId: workflow.id,
        eventName,
        email: splitEmail,
        fullName: `Split Contact ${index + 1}`,
      });
      triggerResults.push({
        email: splitEmail,
        contactId: payload.contactId || null,
      });
      await sleep(500);
    }

    const splitOutcome = await waitFor(
      "split routing for all contacts",
      async () => {
        const logs = await fetchLogs(workflow.id);
        const splitLogs = logs.filter((log) => log.event_type === "split_routed");
        const sendLogs = logs.filter(
          (log) =>
            log.event_type === "email_sent" &&
            (String(log.metadata?.node_id || "") === "send_a" || String(log.metadata?.node_id || "") === "send_b")
        );

        if (splitLogs.length >= 12 && sendLogs.length >= 12) {
          return { logs, splitLogs, sendLogs };
        }
        return null;
      },
      { timeoutMs: 180000, intervalMs: 5000 }
    ).catch(async () => {
      await invokeRunnerWithFallback({
        workflowId: workflow.id,
        contactId: null,
        ownerAccessToken: ownerAuth.accessToken,
      });
      return waitFor(
        "split routing for all contacts after manual runner",
        async () => {
          const logs = await fetchLogs(workflow.id);
          const splitLogs = logs.filter((log) => log.event_type === "split_routed");
          const sendLogs = logs.filter(
            (log) =>
              log.event_type === "email_sent" &&
              (String(log.metadata?.node_id || "") === "send_a" || String(log.metadata?.node_id || "") === "send_b")
          );

          if (splitLogs.length >= 12 && sendLogs.length >= 12) {
            return { logs, splitLogs, sendLogs };
          }
          return null;
        },
        { timeoutMs: 120000, intervalMs: 5000 }
      );
    });

    const branchCounts = splitOutcome.splitLogs.reduce(
      (acc, log) => {
        const branch = String(log.metadata?.branch || "").toLowerCase();
        if (branch === "a") acc.a += 1;
        if (branch === "b") acc.b += 1;
        return acc;
      },
      { a: 0, b: 0 }
    );

    const sendCounts = splitOutcome.sendLogs.reduce(
      (acc, log) => {
        const nodeId = String(log.metadata?.node_id || "");
        if (nodeId === "send_a") acc.send_a += 1;
        if (nodeId === "send_b") acc.send_b += 1;
        return acc;
      },
      { send_a: 0, send_b: 0 }
    );

    const contacts = await fetchContacts(workflow.id);
    const pass = branchCounts.a > 0 && branchCounts.b > 0 && sendCounts.send_a > 0 && sendCounts.send_b > 0;

    return {
      pass,
      workflowId: workflow.id,
      triggered: triggerResults.length,
      branchCounts,
      sendCounts,
      contacts: contacts.map((contact) => summarizeContact(contact)),
      sampleRoutes: splitOutcome.splitLogs.slice(0, 6).map((log) => ({
        contact_id: log.contact_id,
        message: log.message,
        metadata: log.metadata,
        created_at: log.created_at,
      })),
    };
  } finally {
    if (!keepWorkflows && workflow?.id && !workflowPaused) {
      await pauseWorkflow(workflow.id);
      workflowPaused = true;
    }
  }
};

const main = async () => {
  const ownerUserId = await pickWorkflowOwner();
  const ownerAuth = await getOwnerAccessToken(ownerUserId);
  const recipientConfig = await getMailboxConfig(ownerUserId, recipientEmail);
  if (!recipientConfig) {
    throw new Error(`Recipient mailbox ${recipientEmail} is not configured for owner ${ownerUserId}.`);
  }

  const senderConfig = await pickSenderConfig(ownerUserId, recipientEmail);
  const replyContainsToken = `contains_${Date.now().toString(36)}`;
  const tagValue = `vip_${Date.now().toString(36)}`;
  const customEventValue = `custom_match_${Date.now().toString(36)}`;

  const results = {
    ownerUserId,
    ownerAuth: {
      email: ownerAuth.email,
      method: "magiclink_session",
    },
    sender: {
      id: senderConfig.id,
      email: senderConfig.smtp_username,
      name: senderConfig.sender_name,
    },
    recipient: {
      id: recipientConfig.id,
      email: recipientConfig.smtp_username,
    },
    cases: {},
  };

  const cases = [
    ["email_replied", () => runReplyConditionCase({ ownerUserId, ownerAuth, senderConfig, recipientConfig, rule: "email_replied" })],
    [
      "email_reply_contains",
      () =>
        runReplyConditionCase({
          ownerUserId,
          ownerAuth,
          senderConfig,
          recipientConfig,
          rule: "email_reply_contains",
          value: replyContainsToken,
        }),
    ],
    ["email_opened", () => runOpenOrClickCase({ ownerUserId, ownerAuth, senderConfig, rule: "email_opened" })],
    ["email_clicked", () => runOpenOrClickCase({ ownerUserId, ownerAuth, senderConfig, rule: "email_clicked" })],
    [
      "tag_exists",
      () =>
        runStateConditionCase({
          ownerUserId,
          ownerAuth,
          senderConfig,
          rule: "tag_exists",
          value: tagValue,
          statePayload: { tags: [tagValue, "automation_test"] },
        }),
    ],
    [
      "custom_event",
      () =>
        runStateConditionCase({
          ownerUserId,
          ownerAuth,
          senderConfig,
          rule: "custom_event",
          value: customEventValue,
          statePayload: {},
        }),
    ],
    ["split", () => runSplitCase({ ownerUserId, ownerAuth, senderConfig })],
  ];

  for (const [caseName, runner] of cases) {
    try {
      results.cases[caseName] = await runner();
    } catch (error) {
      results.cases[caseName] = {
        pass: false,
        error: safeError(error),
      };
    }
  }

  console.log(JSON.stringify(results, null, 2));
};

main().catch((error) => {
  console.error(safeError(error));
  process.exit(1);
});
