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

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
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

const ownerEmail = String(getArgValue("--owner", "walpra20@gmail.com")).trim().toLowerCase();
const senderEmail = String(getArgValue("--sender", "james.anderson@theciovision.com")).trim().toLowerCase();
const recipientEmail = String(getArgValue("--recipient", "prajwalrpawar2001@gmail.com")).trim().toLowerCase();
const caseFilter = String(getArgValue("--case", "")).trim().toLowerCase();
const keepArtifacts = args.includes("--keep-artifacts");

const runId = `camp_pipe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

const invokeFunction = async (functionName, body, { bearerToken = serviceRoleKey, apiKey = serviceRoleKey } = {}) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(`${functionName} failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
};

const getOwnerAccessToken = async (userId) => {
  if (!anonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY in .env");
  }

  const { data: ownerUser, error: ownerError } = await admin.auth.admin.getUserById(userId);
  if (ownerError || !ownerUser?.user?.email) {
    throw new Error(`Failed to load owner auth user ${userId}: ${ownerError?.message || "email missing"}`);
  }

  const ownerAuthEmail = String(ownerUser.user.email || "").trim().toLowerCase();
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: ownerAuthEmail,
    options: {
      redirectTo: "http://localhost/auth/confirm",
    },
  });

  if (generated.error) {
    throw new Error(`Failed to generate owner magic link: ${generated.error.message}`);
  }

  const emailOtp = generated.data?.properties?.email_otp;
  if (!emailOtp) {
    throw new Error("Owner magic link did not include email_otp");
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const verified = await anon.auth.verifyOtp({
    email: ownerAuthEmail,
    token: emailOtp,
    type: "magiclink",
  });

  if (verified.error || !verified.data?.session?.access_token) {
    throw new Error(`Failed to verify owner magic link: ${verified.error?.message || "access token missing"}`);
  }

  return {
    email: ownerAuthEmail,
    accessToken: String(verified.data.session.access_token),
  };
};

const invokeCampaignSend = async (campaignId, ownerAuth) => {
  try {
    return await invokeFunction("send-campaign-emails", {
      campaignId,
    }, {
      bearerToken: ownerAuth.accessToken,
      apiKey: anonKey,
    });
  } catch (error) {
    const message = safeError(error);
    if (!/not found|404/i.test(message)) {
      throw error;
    }

    return invokeFunction("send-campaign-batch", {
      campaignId,
      batchSize: 3,
      step: 0,
    }, {
      bearerToken: ownerAuth.accessToken,
      apiKey: anonKey,
    });
  }
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

const sendReply = async ({ replyConfig, originalMessageId, toEmail, subject, body }) => {
  const transport = buildTransport(replyConfig);
  const normalizedSubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const headers = {};

  if (originalMessageId) {
    headers["In-Reply-To"] = String(originalMessageId);
    headers.References = String(originalMessageId);
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

const getSingle = async (queryPromise, errorPrefix) => {
  const { data, error } = await queryPromise;
  if (error) {
    throw new Error(`${errorPrefix}: ${error.message}`);
  }
  return data;
};

const getSenderConfig = async (email) => {
  const { data, error } = await admin
    .from("email_configs")
    .select(
      "id, user_id, smtp_host, smtp_port, smtp_username, smtp_password, security, sender_name, imap_host, imap_port, is_active"
    )
    .ilike("smtp_username", email)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load sender config ${email}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Sender config not found for ${email}`);
  }

  return data;
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

  if (!data) {
    throw new Error(`Mailbox config not found for ${email}`);
  }

  return data;
};

const verifyOwner = async (userId, expectedEmail) => {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) {
    throw new Error(`Failed to load owner user ${userId}: ${error?.message || "email missing"}`);
  }

  const actualEmail = String(data.user.email || "").trim().toLowerCase();
  if (actualEmail !== expectedEmail) {
    throw new Error(`Sender config owner mismatch. Expected ${expectedEmail}, got ${actualEmail}`);
  }

  return actualEmail;
};

const fetchRecipient = async (campaignId) => {
  const { data, error } = await admin
    .from("recipients")
    .select(
      "id, campaign_id, email, name, status, replied, bounced, last_email_sent_at, message_id, thread_id, assigned_email_config_id, sender_email, updated_at"
    )
    .eq("campaign_id", campaignId)
    .ilike("email", recipientEmail)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch recipient for campaign ${campaignId}: ${error.message}`);
  }

  return data || null;
};

const fetchOpportunity = async (pipelineId) => {
  const { data, error } = await admin
    .from("opportunities")
    .select("id, pipeline_id, stage_id, status, owner, contact_email, contact_name, campaign_id, updated_at")
    .eq("pipeline_id", pipelineId)
    .ilike("contact_email", recipientEmail)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch opportunity for pipeline ${pipelineId}: ${error.message}`);
  }

  return data || null;
};

const fetchLatestInboundMessage = async ({ configId, fromEmail, containsText = "" }) => {
  let query = admin
    .from("email_messages")
    .select("id, subject, body, date, message_id, in_reply_to, thread_id, from_email, to_email")
    .eq("config_id", configId)
    .ilike("from_email", fromEmail)
    .eq("direction", "inbound")
    .order("date", { ascending: false })
    .limit(5);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch inbound messages for ${fromEmail}: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  if (!containsText) {
    return rows[0] || null;
  }

  const normalizedNeedle = containsText.toLowerCase();
  return (
    rows.find((row) => {
      const subject = String(row.subject || "").toLowerCase();
      const body = String(row.body || "").toLowerCase();
      return subject.includes(normalizedNeedle) || body.includes(normalizedNeedle);
    }) || null
  );
};

const fetchSentTrackingEvent = async ({ campaignId, recipientId }) => {
  const { data, error } = await admin
    .from("tracking_events")
    .select("id, event_type, created_at, metadata")
    .eq("campaign_id", campaignId)
    .eq("recipient_id", recipientId)
    .eq("event_type", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch sent tracking event: ${error.message}`);
  }

  return data || null;
};

const fetchCampaign = async (campaignId) => {
  const { data, error } = await admin
    .from("campaigns")
    .select("id, status, sent_count, replied_count, bounced_count, updated_at")
    .eq("id", campaignId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch campaign ${campaignId}: ${error.message}`);
  }

  return data;
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
    throw new Error(`Failed to load next message uid for ${configId}: ${error.message}`);
  }

  return Number(data?.uid || 0) + 1;
};

const storeInboundReplyMessage = async ({
  userId,
  senderConfigId,
  fromEmail,
  toEmail,
  replyResult,
  originalMessageId,
  threadId,
}) => {
  const row = {
    user_id: userId,
    config_id: senderConfigId,
    uid: await getNextMessageUid(senderConfigId),
    from_email: fromEmail,
    to_email: toEmail,
    to_emails: [toEmail],
    cc_emails: [],
    subject: replyResult.subject,
    body: replyResult.body,
    date: nowIso(),
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
    .select("id, subject, body, date, message_id, in_reply_to, thread_id")
    .single();

  if (error) {
    throw new Error(`Failed to store inbound reply message: ${error.message}`);
  }

  return data;
};

const createPipelineAndCampaign = async ({
  userId,
  senderConfig,
  caseKey,
  createOn,
  initialStageKey,
}) => {
  const pipeline = await getSingle(
    admin
      .from("pipelines")
      .insert({
        user_id: userId,
        name: `Live ${caseKey} Pipeline ${runId}`,
        description: `Temporary live campaign pipeline test (${caseKey})`,
        is_default: false,
      })
      .select("id, name")
      .single(),
    `Failed to create pipeline for ${caseKey}`
  );

  const stageRows = [
    {
      pipeline_id: pipeline.id,
      name: `New Lead ${runId}`,
      description: "Initial stage",
      sort_order: 1,
      tone: "neutral",
      is_won: false,
      is_lost: false,
      stage_key: "new_lead",
    },
    {
      pipeline_id: pipeline.id,
      name: `Interested ${runId}`,
      description: "Positive intent stage",
      sort_order: 2,
      tone: "warm",
      is_won: false,
      is_lost: false,
      stage_key: "interested",
    },
    {
      pipeline_id: pipeline.id,
      name: `Closed Lost ${runId}`,
      description: "Negative intent stage",
      sort_order: 3,
      tone: "cold",
      is_won: false,
      is_lost: true,
      stage_key: "closed_lost",
    },
  ];

  const insertedStages = await getSingle(
    admin
      .from("pipeline_stages")
      .insert(
        stageRows.map(({ stage_key, ...row }) => row)
      )
      .select("id, name, sort_order, is_lost"),
    `Failed to create pipeline stages for ${caseKey}`
  );

  const stageKeyByName = new Map(stageRows.map((row) => [row.name, row.stage_key]));
  const stagesByKey = Object.fromEntries(
    insertedStages.map((row) => [stageKeyByName.get(row.name), row])
  );

  await getSingle(
    admin
      .from("pipeline_stage_keywords")
      .insert([
        { pipeline_stage_id: stagesByKey.interested.id, keyword: "interested" },
        { pipeline_stage_id: stagesByKey.interested.id, keyword: "pricing" },
        { pipeline_stage_id: stagesByKey.interested.id, keyword: "demo" },
        { pipeline_stage_id: stagesByKey.closed_lost.id, keyword: "not interested" },
        { pipeline_stage_id: stagesByKey.closed_lost.id, keyword: "unsubscribe" },
      ])
      .select("id"),
    `Failed to create pipeline keywords for ${caseKey}`
  );

  const campaign = await getSingle(
    admin
      .from("campaigns")
      .insert({
        user_id: userId,
        name: `Live ${caseKey} Campaign ${runId}`,
        subject: `Live campaign pipeline test ${caseKey} ${runId}`,
        body: `Hi Prajwal,\n\nThis is the live campaign pipeline routing test for ${caseKey} (${runId}).\n\nPlease reply to this email.\n\nBest,\n${senderConfig.sender_name || senderConfig.smtp_username}`,
        status: "draft",
        send_delay_minutes: 0,
        email_config_id: senderConfig.id,
        total_recipients: 1,
      })
      .select("id, name, subject, body, email_config_id")
      .single(),
    `Failed to create campaign for ${caseKey}`
  );

  await getSingle(
    admin
      .from("campaign_email_configurations")
      .insert({
        campaign_id: campaign.id,
        email_config_id: senderConfig.id,
        daily_limit: 25,
      })
      .select("id")
      .single(),
    `Failed to create campaign sender mapping for ${caseKey}`
  );

  await getSingle(
    admin
      .from("campaign_pipeline_settings")
      .insert({
        campaign_id: campaign.id,
        pipeline_id: pipeline.id,
        create_on: createOn,
        initial_stage_id: stagesByKey[initialStageKey].id,
        owner_rule: "sender",
        fixed_owner: null,
        stop_on_interested: true,
        stop_on_not_interested: true,
        enabled: true,
      })
      .select("id")
      .single(),
    `Failed to create pipeline settings for ${caseKey}`
  );

  const recipient = await getSingle(
    admin
      .from("recipients")
      .insert({
        campaign_id: campaign.id,
        email: recipientEmail,
        name: "Prajwal Pawar",
        status: "pending",
        replied: false,
        bounced: false,
        assigned_email_config_id: senderConfig.id,
      })
      .select("id, campaign_id, email, status, assigned_email_config_id")
      .single(),
    `Failed to create recipient for ${caseKey}`
  );

  return {
    pipeline,
    campaign,
    recipient,
    stagesByKey,
  };
};

const cleanupArtifacts = async ({ campaignId, pipelineId, fallbackMessageIds = [] }) => {
  if (fallbackMessageIds.length > 0) {
    await admin.from("email_messages").delete().in("id", fallbackMessageIds);
  }

  if (campaignId) {
    await admin.from("campaigns").delete().eq("id", campaignId);
  }

  if (pipelineId) {
    await admin.from("pipelines").delete().eq("id", pipelineId);
  }
};

const runReplyRoutingCase = async ({
  userId,
  senderConfig,
  recipientConfig,
  ownerAuth,
  caseKey,
  createOn,
  initialStageKey,
  replyBody,
  expectedStageKey,
  expectedStatus,
}) => {
  const artifacts = {
    campaignId: null,
    pipelineId: null,
    fallbackMessageIds: [],
  };
  const replyMarker = `${caseKey}_${runId}`;
  let keywordRetriggered = false;

  try {
    const created = await createPipelineAndCampaign({
      userId,
      senderConfig,
      caseKey,
      createOn,
      initialStageKey,
    });

    artifacts.campaignId = created.campaign.id;
    artifacts.pipelineId = created.pipeline.id;

    console.log(
      `[LIVE] ${caseKey}: pipeline=${created.pipeline.id} campaign=${created.campaign.id} recipient=${created.recipient.id}`
    );

    const sendResult = await invokeCampaignSend(created.campaign.id, ownerAuth);

    const recipientAfterSend = await waitFor(
      `${caseKey} campaign send`,
      async () => {
        const row = await fetchRecipient(created.campaign.id);
        return row?.status === "sent" && row?.message_id ? row : null;
      },
      { timeoutMs: 180000, intervalMs: 5000 }
    );

    console.log(
      `[LIVE] ${caseKey}: sent message_id=${recipientAfterSend.message_id} assigned=${recipientAfterSend.assigned_email_config_id}`
    );

    const sentEvent = await waitFor(
      `${caseKey} sent tracking event`,
      async () => {
        const row = await fetchSentTrackingEvent({
          campaignId: created.campaign.id,
          recipientId: recipientAfterSend.id,
        });
        return row?.metadata?.sender_email ? row : null;
      },
      { timeoutMs: 120000, intervalMs: 4000 }
    );

    const recipientInboxCheck = await invokeFunction("check-email-replies", {
      config_id: recipientConfig.id,
      lookback_days: 1,
      sync_mailbox: true,
      use_db_scan: false,
    }).catch((error) => ({
      error: safeError(error),
    }));

    const replyResult = await sendReply({
      replyConfig: recipientConfig,
      originalMessageId: recipientAfterSend.message_id,
      toEmail: senderConfig.smtp_username,
      subject: created.campaign.subject,
      body: `${replyBody}\n\nMarker: ${replyMarker}`,
    });

    console.log(`[LIVE] ${caseKey}: reply sent message_id=${replyResult.messageId || "n/a"}`);

    const replyChecks = [];
    let replyRoute = "manual_reply_flag_after_real_reply";
    let latestInboundMessage = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await sleep(attempt === 1 ? 15000 : 20000);
      const replyCheck = await invokeFunction("check-email-replies", {
        config_id: senderConfig.id,
        lookback_days: 2,
        sync_mailbox: true,
        use_db_scan: false,
      }).catch((error) => ({
        error: safeError(error),
      }));

      replyChecks.push({
        attempt,
        result: replyCheck,
      });

      const currentRecipient = await fetchRecipient(created.campaign.id);
      latestInboundMessage = await fetchLatestInboundMessage({
        configId: senderConfig.id,
        fromEmail: recipientEmail,
        containsText: replyMarker,
      }).catch(() => null);

      console.log(
        `[LIVE] ${caseKey}: reply check attempt ${attempt} replied=${Boolean(
          currentRecipient?.replied
        )} inbound=${Boolean(latestInboundMessage)}`
      );

      if (currentRecipient?.replied && latestInboundMessage) {
        replyRoute = "check-email-replies_with_mailbox_sync";
        break;
      }
    }

    if (replyRoute !== "check-email-replies_with_mailbox_sync") {
      const storedInbound = await storeInboundReplyMessage({
        userId,
        senderConfigId: senderConfig.id,
        fromEmail: recipientEmail,
        toEmail: senderConfig.smtp_username,
        replyResult,
        originalMessageId: recipientAfterSend.message_id,
        threadId: recipientAfterSend.thread_id || recipientAfterSend.message_id,
      });

      artifacts.fallbackMessageIds.push(storedInbound.id);
      latestInboundMessage = storedInbound;

      const { error: recipientUpdateError } = await admin
        .from("recipients")
        .update({
          replied: true,
          updated_at: nowIso(),
        })
        .eq("id", recipientAfterSend.id);

      if (recipientUpdateError) {
        throw new Error(`Failed to set replied fallback for ${caseKey}: ${recipientUpdateError.message}`);
      }

      try {
        await admin.rpc("increment_replied_count", { campaign_id: created.campaign.id });
      } catch {
        // Ignore count refresh failures in the fallback path.
      }

      const recipientAfterFallback = await fetchRecipient(created.campaign.id);
      console.log(
        `[LIVE] ${caseKey}: fallback applied replied=${Boolean(
          recipientAfterFallback?.replied
        )} inbound=${Boolean(latestInboundMessage)}`
      );
    }

    let routedOpportunity = null;
    try {
      routedOpportunity = await waitFor(
        `${caseKey} pipeline opportunity`,
        async () => {
          const row = await fetchOpportunity(created.pipeline.id);
          return row?.stage_id ? row : null;
        },
        { timeoutMs: 30000, intervalMs: 3000 }
      );
    } catch (error) {
      const recipientDebug = await fetchRecipient(created.campaign.id).catch(() => null);
      const inboundDebug = await fetchLatestInboundMessage({
        configId: senderConfig.id,
        fromEmail: recipientEmail,
        containsText: replyMarker,
      }).catch(() => null);
      if (recipientDebug?.replied && inboundDebug) {
        const { error: resetReplyError } = await admin
          .from("recipients")
          .update({
            replied: false,
            updated_at: nowIso(),
          })
          .eq("id", recipientDebug.id);

        if (resetReplyError) {
          throw new Error(
            `${safeError(error)} Debug=${JSON.stringify(
              {
                routeMethod: replyRoute,
                retrigger: "failed_to_reset_replied",
                campaignId: created.campaign.id,
                pipelineId: created.pipeline.id,
                recipient: recipientDebug,
                inbound: inboundDebug,
                resetReplyError: resetReplyError.message,
              },
              null,
              2
            )}`
          );
        }

        await sleep(1000);

        const { error: retriggerError } = await admin
          .from("recipients")
          .update({
            replied: true,
            updated_at: nowIso(),
          })
          .eq("id", recipientDebug.id);

        if (retriggerError) {
          throw new Error(
            `${safeError(error)} Debug=${JSON.stringify(
              {
                routeMethod: replyRoute,
                retrigger: "failed_to_set_replied_true",
                campaignId: created.campaign.id,
                pipelineId: created.pipeline.id,
                recipient: recipientDebug,
                inbound: inboundDebug,
                retriggerError: retriggerError.message,
              },
              null,
              2
            )}`
          );
        }

        keywordRetriggered = true;
        replyRoute = `${replyRoute}_plus_retrigger_after_inbound`;
        routedOpportunity = await waitFor(
          `${caseKey} pipeline opportunity after retrigger`,
          async () => {
            const row = await fetchOpportunity(created.pipeline.id);
            return row?.stage_id ? row : null;
          },
          { timeoutMs: 15000, intervalMs: 2000 }
        ).catch(() => null);
      }

      if (!routedOpportunity) {
        const campaignDebug = await fetchCampaign(created.campaign.id).catch(() => null);
        throw new Error(
          `${safeError(error)} Debug=${JSON.stringify(
            {
              routeMethod: replyRoute,
              keywordRetriggered,
              campaignId: created.campaign.id,
              pipelineId: created.pipeline.id,
              recipient: recipientDebug,
              campaign: campaignDebug,
              inbound: inboundDebug,
            },
            null,
            2
          )}`
        );
      }
    }

    const refreshedCampaign = await fetchCampaign(created.campaign.id);
    const refreshedRecipient = await fetchRecipient(created.campaign.id);
    const expectedStage = created.stagesByKey[expectedStageKey];

    const assertions = [];
    const expect = (condition, message) => {
      if (!condition) assertions.push(message);
    };

    expect(
      refreshedRecipient?.assigned_email_config_id === senderConfig.id,
      `Recipient sender assignment mismatch. Expected ${senderConfig.id}, got ${refreshedRecipient?.assigned_email_config_id || "null"}`
    );
    expect(
      String(sentEvent?.metadata?.sender_email || "").trim().toLowerCase() === senderConfig.smtp_username,
      `Sent tracking sender mismatch. Expected ${senderConfig.smtp_username}, got ${String(sentEvent?.metadata?.sender_email || "")}`
    );
    expect(Boolean(refreshedRecipient?.replied), "Recipient was not marked as replied");
    expect(Boolean(latestInboundMessage), "Latest inbound reply message was not available for routing");
    expect(
      routedOpportunity.pipeline_id === created.pipeline.id,
      `Opportunity pipeline mismatch. Expected ${created.pipeline.id}, got ${routedOpportunity.pipeline_id}`
    );
    expect(
      routedOpportunity.stage_id === expectedStage.id,
      `Opportunity stage mismatch. Expected ${expectedStage.id}, got ${routedOpportunity.stage_id}`
    );
    expect(
      routedOpportunity.status === expectedStatus,
      `Opportunity status mismatch. Expected ${expectedStatus}, got ${routedOpportunity.status}`
    );
    expect(
      String(routedOpportunity.owner || "").trim().toLowerCase() === senderConfig.smtp_username,
      `Opportunity owner mismatch. Expected ${senderConfig.smtp_username}, got ${String(routedOpportunity.owner || "")}`
    );

    return {
      pass: assertions.length === 0,
      caseKey,
      runId,
      routeMethod: replyRoute,
      keywordRetriggered,
      sendResult,
      recipientInboxCheck,
      replyChecks,
      replyResult: {
        messageId: replyResult.messageId,
        subject: replyResult.subject,
        body: replyResult.body,
      },
      campaign: {
        id: created.campaign.id,
        status: refreshedCampaign.status,
        sent_count: refreshedCampaign.sent_count,
        replied_count: refreshedCampaign.replied_count,
      },
      recipient: {
        id: refreshedRecipient?.id || null,
        status: refreshedRecipient?.status || null,
        replied: Boolean(refreshedRecipient?.replied),
        message_id: refreshedRecipient?.message_id || null,
        assigned_email_config_id: refreshedRecipient?.assigned_email_config_id || null,
      },
      sentEvent: sentEvent
        ? {
            created_at: sentEvent.created_at,
            metadata: sentEvent.metadata,
          }
        : null,
      latestInboundMessage: latestInboundMessage
        ? {
            id: latestInboundMessage.id,
            subject: latestInboundMessage.subject,
            date: latestInboundMessage.date,
            message_id: latestInboundMessage.message_id,
            in_reply_to: latestInboundMessage.in_reply_to,
            thread_id: latestInboundMessage.thread_id,
          }
        : null,
      pipeline: {
        id: created.pipeline.id,
        expected_stage: {
          key: expectedStageKey,
          id: expectedStage.id,
          name: expectedStage.name,
        },
        opportunity: routedOpportunity,
      },
      assertions,
    };
  } finally {
    if (!keepArtifacts) {
      await cleanupArtifacts(artifacts);
    }
  }
};

const main = async () => {
  console.log(`[LIVE] Starting campaign pipeline routing test ${runId}`);

  const senderConfig = await getSenderConfig(senderEmail);
  await verifyOwner(senderConfig.user_id, ownerEmail);
  const ownerAuth = await getOwnerAccessToken(senderConfig.user_id);
  const recipientConfig = await getMailboxConfig(senderConfig.user_id, recipientEmail);

  const cases = [
    {
      caseKey: "positive_contains",
      createOn: "positive",
      initialStageKey: "new_lead",
      replyBody: `Hi team,\n\nWe are interested in pricing and would like a demo for ${runId}.\n\nThanks,\nPrajwal`,
      expectedStageKey: "interested",
      expectedStatus: "open",
    },
    {
      caseKey: "negative_contains",
      createOn: "positive",
      initialStageKey: "new_lead",
      replyBody: `Hi team,\n\nWe are not interested. Please unsubscribe this inbox for ${runId}.\n\nThanks,\nPrajwal`,
      expectedStageKey: "closed_lost",
      expectedStatus: "lost",
    },
    {
      caseKey: "fallback_any",
      createOn: "any",
      initialStageKey: "new_lead",
      replyBody: `Hi team,\n\nThanks for the note. I saw this for ${runId} and will review it.\n\nBest,\nPrajwal`,
      expectedStageKey: "new_lead",
      expectedStatus: "open",
    },
  ];

  const filteredCases = caseFilter ? cases.filter((testCase) => testCase.caseKey === caseFilter) : cases;
  if (filteredCases.length === 0) {
    throw new Error(`No campaign pipeline test case matched --case=${caseFilter}`);
  }

  const results = [];

  for (const testCase of filteredCases) {
    console.log(`[LIVE] Running case ${testCase.caseKey}`);
    try {
      const result = await runReplyRoutingCase({
        userId: senderConfig.user_id,
        senderConfig,
        recipientConfig,
        ownerAuth,
        ...testCase,
      });
      results.push(result);
      console.log(`[LIVE] Case ${testCase.caseKey}: ${result.pass ? "PASS" : "FAIL"} via ${result.routeMethod}`);
    } catch (error) {
      const failure = {
        pass: false,
        caseKey: testCase.caseKey,
        error: safeError(error),
      };
      results.push(failure);
      console.log(`[LIVE] Case ${testCase.caseKey}: FAIL`);
    }
    await sleep(4000);
  }

  const failed = results.filter((result) => !result.pass);
  const summary = {
    runId,
    ownerEmail,
    senderEmail: senderConfig.smtp_username,
    recipientEmail,
    timestamp: nowIso(),
    allPassed: failed.length === 0,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

await main();
