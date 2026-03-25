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
const mailboxApiUrl =
  (process.env.VITE_MAILBOX_API_URL || process.env.MAILBOX_API_URL || "").trim().replace(/\/+$/, "");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const recipientEmail = String(
  getArgValue("--recipient", "prajwalrpawar2001@gmail.com")
).trim().toLowerCase();
const keepWorkflow = args.includes("--keep-workflow");

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

const invokeFunction = async (functionName, body, { auth = true, bearerToken = "", apiKey = "" } = {}) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth
        ? {
            Authorization: `Bearer ${bearerToken || serviceRoleKey}`,
            ...(apiKey ? { apikey: apiKey } : {}),
          }
        : {}),
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

const callAutomationWebhook = async ({ workflowId, eventName, email, fullName }) => {
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
        data: {
          company: "Live E2E Test",
          job_title: "Owner",
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

const waitFor = async (label, fn, { timeoutMs = 180000, intervalMs = 5000 } = {}) => {
  const started = Date.now();

  while (Date.now() - started <= timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(intervalMs);
  }

  throw new Error(`Timed out while waiting for ${label}.`);
};

const createWorkflowGraph = ({ runId, senderConfigId }) => ({
  id: `wf_live_e2e_${runId}`,
  name: `Automation Live E2E ${runId}`,
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
      id: "send_initial",
      kind: "send_email",
      title: "Send Initial Email",
      status: "live",
      position: { x: 360, y: 180 },
      config: {
        subject: `Live automation test ${runId}`,
        body: `Hi {first_name},\n\nThis is the live automation E2E test ${runId}.\n\nPlease reply to this email.\n\nBest,\n{sender_name}`,
        senderConfigId,
        templateId: "",
        personalizationTokens: ["{first_name}", "{sender_name}"],
        threadWithPrevious: true,
      },
    },
    {
      id: "wait_30_seconds",
      kind: "wait",
      title: "Wait 30 Seconds",
      status: "live",
      position: { x: 640, y: 180 },
      config: {
        duration: 0.5,
        unit: "minutes",
        randomized: false,
        randomMaxMinutes: 0,
        timeWindowStart: "00:00",
        timeWindowEnd: "23:59",
      },
    },
    {
      id: "condition_reply",
      kind: "condition",
      title: "Reply Received?",
      status: "live",
      position: { x: 920, y: 180 },
      config: {
        clauses: [
          {
            id: "if",
            rule: "email_replied",
            comparator: "exists",
            value: "",
          },
        ],
      },
    },
    {
      id: "send_if_reply",
      kind: "send_email",
      title: "Reply Branch Email",
      status: "live",
      position: { x: 1240, y: 60 },
      config: {
        subject: `Reply branch confirmed ${runId}`,
        body: `Hi {first_name},\n\nYour reply was detected for live E2E test ${runId}.\n\nBest,\n{sender_name}`,
        senderConfigId,
        templateId: "",
        personalizationTokens: ["{first_name}", "{sender_name}"],
        threadWithPrevious: true,
      },
    },
    {
      id: "send_else",
      kind: "send_email",
      title: "Else Branch Email",
      status: "live",
      position: { x: 1240, y: 300 },
      config: {
        subject: `Else branch confirmed ${runId}`,
        body: `Hi {first_name},\n\nNo reply was detected for live E2E test ${runId}.\n\nBest,\n{sender_name}`,
        senderConfigId,
        templateId: "",
        personalizationTokens: ["{first_name}", "{sender_name}"],
        threadWithPrevious: true,
      },
    },
    {
      id: "exit_if",
      kind: "exit",
      title: "Exit If",
      status: "live",
      position: { x: 1500, y: 60 },
      config: { reason: "completed" },
    },
    {
      id: "exit_else",
      kind: "exit",
      title: "Exit Else",
      status: "live",
      position: { x: 1500, y: 300 },
      config: { reason: "completed" },
    },
  ],
  edges: [
    { id: "edge_trigger_send", source: "trigger_1", target: "send_initial", sourceHandle: "out", targetHandle: "in" },
    {
      id: "edge_send_wait",
      source: "send_initial",
      target: "wait_30_seconds",
      sourceHandle: "out",
      targetHandle: "in",
    },
    {
      id: "edge_wait_condition",
      source: "wait_30_seconds",
      target: "condition_reply",
      sourceHandle: "out",
      targetHandle: "in",
    },
    {
      id: "edge_condition_if",
      source: "condition_reply",
      target: "send_if_reply",
      sourceHandle: "if",
      targetHandle: "in",
    },
    {
      id: "edge_condition_else",
      source: "condition_reply",
      target: "send_else",
      sourceHandle: "else",
      targetHandle: "in",
    },
    {
      id: "edge_if_exit",
      source: "send_if_reply",
      target: "exit_if",
      sourceHandle: "out",
      targetHandle: "in",
    },
    {
      id: "edge_else_exit",
      source: "send_else",
      target: "exit_else",
      sourceHandle: "out",
      targetHandle: "in",
    },
  ],
});

const createWorkflow = async ({ userId, senderConfigId, eventName, runId }) => {
  const graph = createWorkflowGraph({ runId, senderConfigId });
  const { data, error } = await admin
    .from("automation_workflows")
    .insert({
      user_id: userId,
      name: `Live E2E Reply Test ${runId}`,
      description: "Temporary live automation E2E workflow",
      status: "live",
      trigger_type: "custom_event",
      trigger_filters: { event_name: eventName },
      flow: [{ id: "stop", name: "Stop", type: "stop", config: {} }],
      settings: {
        workflow_graph: graph,
      },
      published_at: nowIso(),
    })
    .select("id, user_id, name, status, trigger_filters")
    .single();

  if (error) {
    throw new Error(`Failed to create workflow: ${error.message}`);
  }

  return data;
};

const fetchContact = async (workflowId, email) => {
  const { data, error } = await admin
    .from("automation_contacts")
    .select("id, workflow_id, email, status, current_step, next_run_at, state, last_error")
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

const getOwnerAccessToken = async (userId) => {
  if (!anonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY in .env");
  }

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

const invokeRunner = async ({ workflowId, contactId, ownerAccessToken }) =>
  invokeFunction("automation-runner", {
    action: "run_now",
    workflowId,
    contactId,
    batchSize: 20,
  }, {
    bearerToken: ownerAccessToken,
    apiKey: anonKey,
  });

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
    const message = error instanceof Error ? error.message : String(error);
    if (!/401|unauthorized/i.test(message)) {
      throw error;
    }
    return invokeRunnerTickRpc();
  }
};

const invokeReplyCheck = async (configId) =>
  invokeFunction("check-email-replies", {
    config_id: configId,
    lookback_days: 2,
    use_db_scan: false,
  });

const invokeReplyCheckSafe = async (configId) => {
  try {
    const payload = await invokeReplyCheck(configId);
    return {
      ok: true,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const fetchMessageBySubject = async ({ configId, subject, fromEmail }) => {
  let query = admin
    .from("email_messages")
    .select("id, config_id, from_email, to_email, subject, body, date, message_id, in_reply_to, thread_id, direction")
    .eq("config_id", configId)
    .ilike("subject", `%${subject}%`)
    .order("date", { ascending: false })
    .limit(10);

  if (fromEmail) {
    query = query.ilike("from_email", fromEmail);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch messages for subject ${subject}: ${error.message}`);
  }

  return Array.isArray(data) ? data[0] || null : null;
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

const sendReply = async ({ replyConfig, originalMessage, toEmail, runId }) => {
  const transport = buildTransport(replyConfig);
  const subject = String(originalMessage.subject || "");
  const normalizedSubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const body = `Reply from live automation E2E ${runId}.\n\nThis should drive the If branch.`;

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
    .select("id, subject, date, message_id, in_reply_to, thread_id")
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

const main = async () => {
  const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const eventName = `live_e2e_${runId}`;
  const ownerUserId = await pickWorkflowOwner();
  const ownerAuth = await getOwnerAccessToken(ownerUserId);
  const recipientConfig = await getMailboxConfig(ownerUserId, recipientEmail);

  if (!recipientConfig) {
    throw new Error(`Recipient mailbox ${recipientEmail} is not configured for owner ${ownerUserId}.`);
  }

  const senderConfig = await pickSenderConfig(ownerUserId, recipientEmail);
  if (!senderConfig?.id) {
    throw new Error("No usable sender config found.");
  }

  const workflow = await createWorkflow({
    userId: ownerUserId,
    senderConfigId: senderConfig.id,
    eventName,
    runId,
  });

  let contact = null;
  let workflowPaused = false;

  try {
    const webhookPayload = await callAutomationWebhook({
      workflowId: workflow.id,
      eventName,
      email: recipientEmail,
      fullName: "Prajwal Pawar",
    });

    contact = await waitFor(
      "automation contact creation",
      async () => {
        const row = await fetchContact(workflow.id, recipientEmail);
        return row?.id ? row : null;
      },
      { timeoutMs: 120000, intervalMs: 3000 }
    );

    await waitFor(
      "initial automation email send",
      async () => {
        const logs = await fetchLogs(workflow.id);
        return logs.find((log) => log.event_type === "email_sent" && String(log.message || "").includes(recipientEmail))
          ? logs
          : null;
      },
      { timeoutMs: 180000, intervalMs: 5000 }
    );

    await invokeRunnerWithFallback({
      workflowId: workflow.id,
      contactId: contact.id,
      ownerAccessToken: ownerAuth.accessToken,
    });

    contact = await waitFor(
      "wait scheduling",
      async () => {
        const row = await fetchContact(workflow.id, recipientEmail);
        const waitKeys = Object.keys(row?.state || {}).filter((key) => key.startsWith("wait_until"));
        const nextRunAtMs = row?.next_run_at ? new Date(String(row.next_run_at)).getTime() : 0;
        const lastSentAtMs = row?.state?.last_sent_at ? new Date(String(row.state.last_sent_at)).getTime() : 0;
        return row && (waitKeys.length > 0 || nextRunAtMs > lastSentAtMs) ? row : null;
      },
      { timeoutMs: 120000, intervalMs: 3000 }
    );

    const recipientInboxCheckBeforeReply = await invokeReplyCheckSafe(recipientConfig.id);

    let initialInboxMessage = null;
    try {
      initialInboxMessage = await waitFor(
        "initial email in recipient inbox",
        async () =>
          fetchMessageBySubject({
            configId: recipientConfig.id,
            subject: `Live automation test ${runId}`,
            fromEmail: String(senderConfig.smtp_username || "").trim().toLowerCase(),
          }),
        { timeoutMs: 60000, intervalMs: 5000 }
      );
    } catch {
      initialInboxMessage = null;
    }

    contact = (await fetchContact(workflow.id, recipientEmail)) || contact;
    const initialMessage = initialInboxMessage || {
      id: null,
      subject: contact?.state?.last_subject || `Live automation test ${runId}`,
      date: contact?.state?.last_sent_at || null,
      message_id: contact?.state?.last_message_id || null,
    };

    const replyResult = await sendReply({
      replyConfig: recipientConfig,
      originalMessage: initialMessage,
      toEmail: String(senderConfig.smtp_username || "").trim(),
      runId,
    });

    const storedInboundReplyMessage = await storeInboundReplyMessage({
      workflowUserId: ownerUserId,
      senderConfigId: senderConfig.id,
      fromEmail: recipientEmail,
      toEmail: String(senderConfig.smtp_username || "").trim(),
      replyResult,
      originalMessageId: initialMessage.message_id,
      threadId: contact?.state?.thread_id || initialMessage.message_id,
    });

    const senderReplyCheck = await invokeReplyCheckSafe(senderConfig.id);

    let senderReplyMessage = null;
    try {
      senderReplyMessage = await waitFor(
        "reply visibility in sender inbox",
        async () =>
          fetchMessageBySubject({
            configId: senderConfig.id,
            subject: `Live automation test ${runId}`,
            fromEmail: recipientEmail,
          }),
        { timeoutMs: 90000, intervalMs: 5000 }
      );
    } catch {
      senderReplyMessage = storedInboundReplyMessage;
    }

    const waitUntilRaw =
      contact?.state?.wait_until_node_wait_30_seconds ||
      contact?.state?.wait_until_node_wait_30_seconds?.toString() ||
      Object.entries(contact?.state || {}).find(([key]) => key.startsWith("wait_until"))?.[1];
    const waitUntilMs = waitUntilRaw ? new Date(String(waitUntilRaw)).getTime() : Date.now() + 35000;
    const remainingMs = Math.max(waitUntilMs - Date.now() + 3000, 0);
    if (remainingMs > 0) {
      await sleep(remainingMs);
    } else {
      await sleep(3000);
    }

    const runAfterWait = await invokeRunnerWithFallback({
      workflowId: workflow.id,
      contactId: contact.id,
      ownerAccessToken: ownerAuth.accessToken,
    });
    await sleep(5000);
    await invokeRunnerWithFallback({
      workflowId: workflow.id,
      contactId: contact.id,
      ownerAccessToken: ownerAuth.accessToken,
    });

    const recipientInboxCheckAfterBranch = await invokeReplyCheckSafe(recipientConfig.id);

    const finalLogs = await fetchLogs(workflow.id);
    const conditionLog = [...finalLogs].reverse().find((log) => log.event_type === "condition_evaluated") || null;
    const branchEmailLog = [...finalLogs]
      .reverse()
      .find(
        (log) =>
          log.event_type === "email_sent" &&
          (String(log.metadata?.node_id || "") === "send_if_reply" ||
            String(log.metadata?.node_id || "") === "send_else")
      ) || null;

    let followUpInboxMessage = null;
    try {
      followUpInboxMessage = await waitFor(
        "branch email in recipient inbox",
        async () =>
          fetchMessageBySubject({
            configId: recipientConfig.id,
            subject: "branch confirmed",
            fromEmail: String(senderConfig.smtp_username || "").trim().toLowerCase(),
          }),
        { timeoutMs: 60000, intervalMs: 5000 }
      );
    } catch {
      followUpInboxMessage = null;
    }

    const finalContact = await fetchContact(workflow.id, recipientEmail);

    const result = {
      runId,
      ownerUserId,
      workflowId: workflow.id,
      contactId: contact.id,
      sender: {
        id: senderConfig.id,
        email: senderConfig.smtp_username,
        name: senderConfig.sender_name,
      },
      ownerAuth: {
        email: ownerAuth.email,
        method: "magiclink_session",
      },
      recipient: {
        id: recipientConfig.id,
        email: recipientConfig.smtp_username,
      },
      webhook: webhookPayload,
      recipientInboxCheckBeforeReply,
      initialInboxMessage: {
        id: initialMessage.id,
        subject: initialMessage.subject,
        date: initialMessage.date,
        message_id: initialMessage.message_id,
      },
      sentReply: replyResult,
      storedInboundReplyMessage,
      senderReplyCheck,
      senderReplyMessage: senderReplyMessage
        ? {
            id: senderReplyMessage.id,
            subject: senderReplyMessage.subject,
            date: senderReplyMessage.date,
            message_id: senderReplyMessage.message_id,
          }
        : null,
      runnerAfterWait: runAfterWait,
      condition: conditionLog
        ? {
            message: conditionLog.message,
            metadata: conditionLog.metadata,
            created_at: conditionLog.created_at,
          }
        : null,
      branchEmail: branchEmailLog
        ? {
            message: branchEmailLog.message,
            metadata: branchEmailLog.metadata,
            created_at: branchEmailLog.created_at,
          }
        : null,
      followUpInboxMessage: followUpInboxMessage
        ? {
            id: followUpInboxMessage.id,
            subject: followUpInboxMessage.subject,
            date: followUpInboxMessage.date,
            message_id: followUpInboxMessage.message_id,
          }
        : null,
      recipientInboxCheckAfterBranch,
      finalContact: finalContact
        ? {
            status: finalContact.status,
            current_step: finalContact.current_step,
            next_run_at: finalContact.next_run_at,
            last_error: finalContact.last_error,
            state: {
              current_node_id: finalContact.state?.current_node_id || null,
              last_sent_at: finalContact.state?.last_sent_at || null,
              last_replied_at: finalContact.state?.last_replied_at || null,
            },
          }
        : null,
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (!keepWorkflow && workflow?.id && !workflowPaused) {
      try {
        await pauseWorkflow(workflow.id);
        workflowPaused = true;
      } catch (pauseError) {
        console.error(`Failed to pause workflow ${workflow.id}:`, pauseError instanceof Error ? pauseError.message : pauseError);
      }
    }
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
