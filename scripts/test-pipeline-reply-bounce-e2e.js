import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

const admin = createClient(supabaseUrl, serviceRoleKey);

const runId = `pipe_reply_bounce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const fail = (message) => {
  throw new Error(message);
};

const getSingle = async (queryPromise, errorPrefix) => {
  const { data, error } = await queryPromise;
  if (error) fail(`${errorPrefix}: ${error.message}`);
  return data;
};

const findUserContext = async () => {
  const fromCampaign = await admin.from("campaigns").select("user_id").limit(1).maybeSingle();
  if (fromCampaign.data?.user_id) return { userId: fromCampaign.data.user_id, createdTempUser: false, tempUserId: null };

  const fromEmailConfig = await admin.from("email_configs").select("user_id").limit(1).maybeSingle();
  if (fromEmailConfig.data?.user_id) return { userId: fromEmailConfig.data.user_id, createdTempUser: false, tempUserId: null };

  const authUser = await admin.schema("auth").from("users").select("id").limit(1).maybeSingle();
  if (authUser.data?.id) return { userId: authUser.data.id, createdTempUser: false, tempUserId: null };

  const tempEmail = `${runId}@example.com`;
  const tempPassword = `Tmp-${Math.random().toString(36).slice(2)}-Aa1!`;
  const created = await admin.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (created.error || !created.data?.user?.id) {
    fail(`No user found and temp user creation failed: ${created.error?.message || "unknown error"}`);
  }

  return { userId: created.data.user.id, createdTempUser: true, tempUserId: created.data.user.id };
};

const invokeReplyCheck = async (configId) => {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/check-email-replies`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      config_id: configId,
      lookback_days: 3,
      use_db_scan: true,
      sync_mailbox: false,
    }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    fail(`check-email-replies failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
};

const run = async () => {
  const created = {
    tempUserId: null,
    campaignId: null,
    pipelineId: null,
    emailConfigId: null,
  };

  try {
    console.log(`[E2E] Starting pipeline/reply/bounce test (${runId})`);
    const userContext = await findUserContext();
    created.tempUserId = userContext.tempUserId;

    const senderEmail = `sender.${runId}@example.com`;
    const replyLeadEmail = `lead.reply.${runId}@example.com`;
    const bounceLeadEmail = `lead.bounce.${runId}@example.com`;
    const autoLeadEmail = `lead.auto.${runId}@example.com`;

    const sentAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const replyAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const bounceAt = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const autoReplyAt = new Date(Date.now() - 80 * 60 * 1000).toISOString();

    const emailConfig = await getSingle(
      admin
        .from("email_configs")
        .insert({
          user_id: userContext.userId,
          smtp_host: "smtp.example.com",
          smtp_port: 587,
          smtp_username: senderEmail,
          smtp_password: "test-password",
          security: "TLS",
          imap_host: "imap.example.com",
          imap_port: 993,
          sender_name: "Pipeline E2E Sender",
        })
        .select("id, smtp_username")
        .single(),
      "Failed to create email config"
    );
    created.emailConfigId = emailConfig.id;

    const campaign = await getSingle(
      admin
        .from("campaigns")
        .insert({
          user_id: userContext.userId,
          name: `E2E Campaign ${runId}`,
          subject: `Campaign Subject ${runId}`,
          body: "E2E body",
          status: "sent",
          sent_count: 3,
          total_recipients: 3,
        })
        .select("id, replied_count, bounced_count")
        .single(),
      "Failed to create campaign"
    );
    created.campaignId = campaign.id;

    const pipeline = await getSingle(
      admin
        .from("pipelines")
        .insert({
          user_id: userContext.userId,
          name: `E2E Pipeline ${runId}`,
          description: "Pipeline routing test",
          is_default: false,
        })
        .select("id")
        .single(),
      "Failed to create pipeline"
    );
    created.pipelineId = pipeline.id;

    const insertedStages = await getSingle(
      admin
        .from("pipeline_stages")
        .insert([
          {
            pipeline_id: pipeline.id,
            name: `New Lead ${runId}`,
            description: "Default stage",
            sort_order: 1,
            tone: "neutral",
            is_won: false,
            is_lost: false,
          },
          {
            pipeline_id: pipeline.id,
            name: `Interested ${runId}`,
            description: "Intent: interested",
            sort_order: 2,
            tone: "warm",
            is_won: false,
            is_lost: false,
          },
          {
            pipeline_id: pipeline.id,
            name: `Closed Lost ${runId}`,
            description: "Intent: not interested",
            sort_order: 3,
            tone: "cold",
            is_won: false,
            is_lost: true,
          },
        ])
        .select("id, name, sort_order"),
      "Failed to create pipeline stages"
    );

    const stageByName = new Map(insertedStages.map((stage) => [stage.name, stage]));
    const newLeadStage = stageByName.get(`New Lead ${runId}`);
    const interestedStage = stageByName.get(`Interested ${runId}`);
    const closedLostStage = stageByName.get(`Closed Lost ${runId}`);

    if (!newLeadStage || !interestedStage || !closedLostStage) {
      fail("Failed to map created pipeline stages");
    }

    await getSingle(
      admin
        .from("pipeline_stage_keywords")
        .insert([
          { pipeline_stage_id: interestedStage.id, keyword: "interested" },
          { pipeline_stage_id: interestedStage.id, keyword: "pricing" },
          { pipeline_stage_id: interestedStage.id, keyword: "demo" },
          { pipeline_stage_id: closedLostStage.id, keyword: "not interested" },
          { pipeline_stage_id: closedLostStage.id, keyword: "unsubscribe" },
        ])
        .select("id"),
      "Failed to create pipeline stage keywords"
    );

    await getSingle(
      admin
        .from("campaign_pipeline_settings")
        .insert({
          campaign_id: campaign.id,
          pipeline_id: pipeline.id,
          create_on: "positive",
          initial_stage_id: newLeadStage.id,
          owner_rule: "sender",
          enabled: true,
        })
        .select("id")
        .single(),
      "Failed to create campaign pipeline settings"
    );

    const recipients = await getSingle(
      admin
        .from("recipients")
        .insert([
          {
            campaign_id: campaign.id,
            email: replyLeadEmail,
            name: "Reply Lead",
            status: "sent",
            replied: false,
            bounced: false,
            last_email_sent_at: sentAt,
            updated_at: sentAt,
            assigned_email_config_id: emailConfig.id,
            sender_email: senderEmail,
            message_id: `<msg.reply.${runId}@example.com>`,
            thread_id: `<thread.reply.${runId}@example.com>`,
          },
          {
            campaign_id: campaign.id,
            email: bounceLeadEmail,
            name: "Bounce Lead",
            status: "sent",
            replied: false,
            bounced: false,
            last_email_sent_at: sentAt,
            updated_at: sentAt,
            assigned_email_config_id: emailConfig.id,
            sender_email: senderEmail,
            message_id: `<msg.bounce.${runId}@example.com>`,
            thread_id: `<thread.bounce.${runId}@example.com>`,
          },
          {
            campaign_id: campaign.id,
            email: autoLeadEmail,
            name: "Auto Reply Lead",
            status: "sent",
            replied: false,
            bounced: false,
            last_email_sent_at: sentAt,
            updated_at: sentAt,
            assigned_email_config_id: emailConfig.id,
            sender_email: senderEmail,
            message_id: `<msg.auto.${runId}@example.com>`,
            thread_id: `<thread.auto.${runId}@example.com>`,
          },
        ])
        .select("id, email"),
      "Failed to create recipients"
    );

    const recipientByEmail = new Map(recipients.map((recipient) => [recipient.email, recipient]));

    await getSingle(
      admin
        .from("email_messages")
        .insert([
          {
            user_id: userContext.userId,
            config_id: emailConfig.id,
            folder: "INBOX",
            uid: Date.now(),
            from_email: replyLeadEmail,
            to_email: senderEmail,
            subject: `Interested in pricing ${runId}`,
            body: `Hi team, we are interested in pricing and a demo. ${runId}`,
            date: replyAt,
            direction: "inbound",
            message_id: `<in.reply.${runId}@example.com>`,
            in_reply_to: `<msg.reply.${runId}@example.com>`,
            thread_id: `<thread.reply.${runId}@example.com>`,
          },
          {
            user_id: userContext.userId,
            config_id: emailConfig.id,
            folder: "INBOX",
            uid: Date.now() + 1,
            from_email: "mailer-daemon@example.net",
            to_email: senderEmail,
            subject: `Delivery Status Notification (Failure) ${runId}`,
            body: `Undelivered to: ${bounceLeadEmail}. Remote server rejected recipient.`,
            date: bounceAt,
            direction: "inbound",
            message_id: `<in.bounce.${runId}@example.com>`,
            thread_id: `<thread.bounce.${runId}@example.com>`,
          },
          {
            user_id: userContext.userId,
            config_id: emailConfig.id,
            folder: "INBOX",
            uid: Date.now() + 2,
            from_email: autoLeadEmail,
            to_email: senderEmail,
            subject: `Automatic Reply: Out of Office ${runId}`,
            body: "I am currently out of office.",
            date: autoReplyAt,
            direction: "inbound",
            message_id: `<in.auto.${runId}@example.com>`,
            thread_id: `<thread.auto.${runId}@example.com>`,
          },
        ])
        .select("id"),
      "Failed to insert inbound email messages"
    );

    const replyCheckResult = await invokeReplyCheck(emailConfig.id);
    console.log("[E2E] check-email-replies response:", JSON.stringify(replyCheckResult, null, 2));

    const updatedRecipients = await getSingle(
      admin
        .from("recipients")
        .select("id, email, status, replied, bounced, bounced_at")
        .in("id", [
          recipientByEmail.get(replyLeadEmail)?.id,
          recipientByEmail.get(bounceLeadEmail)?.id,
          recipientByEmail.get(autoLeadEmail)?.id,
        ]),
      "Failed to fetch updated recipients"
    );

    const updatedByEmail = new Map(updatedRecipients.map((recipient) => [recipient.email, recipient]));
    const replyRecipient = updatedByEmail.get(replyLeadEmail);
    const bounceRecipient = updatedByEmail.get(bounceLeadEmail);
    const autoRecipient = updatedByEmail.get(autoLeadEmail);

    const assertions = [];
    const expect = (condition, message) => {
      if (!condition) assertions.push(message);
    };

    expect(Boolean(replyRecipient?.replied), "Reply recipient was not marked as replied");
    expect(!replyRecipient?.bounced, "Reply recipient should not be marked as bounced");
    expect(Boolean(bounceRecipient?.bounced), "Bounce recipient was not marked as bounced");
    expect(bounceRecipient?.status === "bounced", `Bounce recipient status expected "bounced", got "${bounceRecipient?.status}"`);
    expect(!bounceRecipient?.replied, "Bounce recipient should not be marked as replied");
    expect(!autoRecipient?.replied, "Auto-reply recipient should not be marked as replied");
    expect(!autoRecipient?.bounced, "Auto-reply recipient should not be marked as bounced");

    const opportunities = await getSingle(
      admin
        .from("opportunities")
        .select("id, contact_email, stage_id, pipeline_id, status")
        .eq("pipeline_id", pipeline.id),
      "Failed to fetch opportunities"
    );

    const replyOpportunity = opportunities.find((opportunity) => opportunity.contact_email?.toLowerCase() === replyLeadEmail);
    const bounceOpportunity = opportunities.find((opportunity) => opportunity.contact_email?.toLowerCase() === bounceLeadEmail);
    const autoOpportunity = opportunities.find((opportunity) => opportunity.contact_email?.toLowerCase() === autoLeadEmail);

    expect(Boolean(replyOpportunity), "No opportunity created for replied lead");
    expect(replyOpportunity?.stage_id === interestedStage.id, "Reply lead was not routed to the intent-matched pipeline stage");
    expect(!bounceOpportunity, "Bounce lead should not be auto-created in pipeline");
    expect(!autoOpportunity, "Auto-reply lead should not be auto-created in pipeline");

    const updatedCampaign = await getSingle(
      admin
        .from("campaigns")
        .select("id, replied_count, bounced_count")
        .eq("id", campaign.id)
        .single(),
      "Failed to fetch campaign counts"
    );

    expect(Number(updatedCampaign.replied_count || 0) >= 1, "Campaign replied_count was not updated");
    expect(Number(updatedCampaign.bounced_count || 0) >= 1, "Campaign bounced_count was not updated");

    if (assertions.length > 0) {
      console.error("[E2E] FAIL");
      assertions.forEach((message, index) => {
        console.error(`${index + 1}. ${message}`);
      });
      process.exitCode = 1;
      return;
    }

    console.log("[E2E] PASS");
    console.log(`[E2E] Reply detected and routed to stage: ${interestedStage.name}`);
    console.log("[E2E] Bounce detected and marked without pipeline promotion.");
    console.log("[E2E] Auto-reply ignored (no false reply/bounce).");
  } finally {
    if (created.campaignId) {
      await admin.from("campaigns").delete().eq("id", created.campaignId);
    }
    if (created.pipelineId) {
      await admin.from("pipelines").delete().eq("id", created.pipelineId);
    }
    if (created.emailConfigId) {
      await admin.from("email_configs").delete().eq("id", created.emailConfigId);
    }
    if (created.tempUserId) {
      await admin.auth.admin.deleteUser(created.tempUserId);
    }
  }
};

await run();
