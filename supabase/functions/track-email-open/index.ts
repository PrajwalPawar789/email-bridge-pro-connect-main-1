// @ts-nocheck

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

// 1x1 transparent pixel (GIF format)
const transparentPixel = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x04, 0x01, 0x00, 0x3B
]);

const BOT_SCORE_THRESHOLD = 70;
const SPEED_TRAP_CRITICAL_MS = 10000;
const SPEED_TRAP_SUSPICIOUS_MS = 30000;
const SPEED_TRAP_MILD_MS = 120000;
const IP_BURST_WINDOW_MS = 60000;
const IP_BURST_THRESHOLD = 3;

const HIGH_CONFIDENCE_UA_TOKENS = [
  'barracuda',
  'mimecast',
  'proofpoint',
  'sophos',
  'trendmicro',
  'symantec',
  'mcafee',
  'kaspersky',
  'bitdefender',
  'forcepoint',
  'fortinet',
  'safelinks',
  'urldefense',
  'defender',
  'antivirus',
  'spam',
  'scanner',
  'crawler',
  'spider',
  'bot'
];

const HTTP_LIBRARY_UA_TOKENS = [
  'curl',
  'wget',
  'python-requests',
  'httpclient',
  'aiohttp',
  'libwww-perl',
  'java',
  'okhttp',
  'go-http-client'
];

const TRUSTED_IMAGE_PROXY_UA_TOKENS = [
  'googleimageproxy',
  'ggpht.com'
];

const PRIVACY_IMAGE_PROXY_UA_TOKENS = [
  'imageproxy',
  'image proxy',
  'mailprivacy'
];

const hasToken = (value: string, tokens: string[]) =>
  tokens.some((token) => value.includes(token));

const safeJsonObject = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

const parseIsoTimestamp = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const hasEventInCurrentCycle = (state: Record<string, unknown>, key: string) => {
  const eventAt = parseIsoTimestamp(state[key]);
  const sentAt = parseIsoTimestamp(state.last_sent_at);
  if (eventAt === null) return false;
  return sentAt === null || eventAt >= sentAt;
};

const logAutomationEvent = async (
  workflowId: string,
  contactId: string,
  userId: string,
  eventType: string,
  message: string,
  metadata: Record<string, unknown> = {},
  stepIndex: number | null = null
) => {
  try {
    await supabase.from("automation_logs").insert({
      workflow_id: workflowId,
      contact_id: contactId,
      user_id: userId,
      event_type: eventType,
      step_index: stepIndex,
      message,
      metadata,
    });
  } catch (error) {
    console.error("Failed to log automation open event:", error);
  }
};

const touchProspectActivity = async (
  prospectId: string | null | undefined,
  activityType: string,
  activityAt = new Date().toISOString()
) => {
  const normalizedProspectId = String(prospectId || "").trim();
  if (!normalizedProspectId) return;

  try {
    await supabase
      .from("prospects")
      .update({
        last_activity_at: activityAt,
        last_activity_type: activityType,
      })
      .eq("id", normalizedProspectId);
  } catch (error) {
    console.error("Failed to update prospect after open:", error);
  }
};

const triggerAutomationRunner = async (workflowId: string, contactId?: string) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !workflowId) return;

  try {
    await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/automation-runner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: "run_now",
        workflowId,
        contactId: contactId || undefined,
        batchSize: 40,
      }),
    });
  } catch (error) {
    console.error("Failed to trigger automation runner after open:", error);
  }
};

const processAutomationOpen = async (
  workflowId: string,
  contactId: string,
  nodeId: string,
  trackedMessageId: string,
  step: number | null,
  req: Request
) => {
  const userAgent = req.headers.get("user-agent") || "";
  const accept = req.headers.get("accept") || "";
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "";
  const via = req.headers.get("via") || "";
  const secFetchSite = req.headers.get("sec-fetch-site") || "";
  const secFetchMode = req.headers.get("sec-fetch-mode") || "";
  const secFetchDest = req.headers.get("sec-fetch-dest") || "";

  const { data: contact } = await supabase
    .from("automation_contacts")
    .select("id, workflow_id, user_id, prospect_id, status, state")
    .eq("id", contactId)
    .eq("workflow_id", workflowId)
    .maybeSingle();

  if (!contact) {
    console.error(`Automation contact not found for open tracking: ${workflowId}/${contactId}`);
    return;
  }

  if (["completed", "failed", "paused", "unsubscribed"].includes(String(contact.status || "").toLowerCase())) {
    return;
  }

  const state = safeJsonObject(contact.state);
  const currentTrackedMessageId = String(state.last_tracking_message_id || state.last_message_id || "").trim();
  if (trackedMessageId && currentTrackedMessageId && trackedMessageId !== currentTrackedMessageId) {
    await logAutomationEvent(
      workflowId,
      contactId,
      String(contact.user_id || ""),
      "email_open_ignored",
      "Ignored stale open event for a previous automation email.",
      {
        node_id: nodeId || null,
        tracked_message_id: trackedMessageId,
        active_message_id: currentTrackedMessageId,
        ip_address: ip || null,
      },
      step
    );
    return;
  }

  let botScore = 0;
  const botReasons: string[] = [];
  let msSinceSend: number | null = null;

  const addReason = (score: number, reason: string) => {
    botScore += score;
    if (!botReasons.includes(reason)) {
      botReasons.push(reason);
    }
  };

  if (req.method && req.method.toUpperCase() === "HEAD") {
    addReason(80, "head_request");
  }

  if (state.last_sent_at) {
    const sentTime = new Date(String(state.last_sent_at)).getTime();
    const now = Date.now();
    const timeDiff = now - sentTime;
    msSinceSend = timeDiff;

    if (timeDiff >= 0 && timeDiff <= SPEED_TRAP_CRITICAL_MS) {
      addReason(95, "speed_trap_critical");
    } else if (timeDiff >= 0 && timeDiff <= SPEED_TRAP_SUSPICIOUS_MS) {
      addReason(50, "speed_trap_suspicious");
    } else if (timeDiff >= 0 && timeDiff <= SPEED_TRAP_MILD_MS) {
      addReason(20, "speed_trap_mild");
    }
  }

  const ua = userAgent.toLowerCase();
  const hasHighConfidenceUa = hasToken(ua, HIGH_CONFIDENCE_UA_TOKENS);
  const hasHttpLibraryUa = hasToken(ua, HTTP_LIBRARY_UA_TOKENS);
  const hasTrustedImageProxyUa = hasToken(ua, TRUSTED_IMAGE_PROXY_UA_TOKENS);
  const hasPrivacyImageProxyUa = hasToken(ua, PRIVACY_IMAGE_PROXY_UA_TOKENS);

  if (!ua) {
    addReason(100, "empty_user_agent");
  } else {
    if (hasHighConfidenceUa) addReason(100, "known_bot_ua");
    if (hasHttpLibraryUa) addReason(80, "http_library_ua");
    if (hasPrivacyImageProxyUa) {
      addReason(40, "image_proxy");
    } else if (hasTrustedImageProxyUa) {
      addReason(5, "trusted_image_proxy");
    }
  }

  const acceptLower = accept.toLowerCase();
  if (acceptLower && !acceptLower.includes("image")) {
    addReason(20, "accept_not_image");
  }

  const trustedImageProxyLikelyHuman =
    hasTrustedImageProxyUa &&
    !hasHighConfidenceUa &&
    !hasHttpLibraryUa &&
    req.method?.toUpperCase() !== "HEAD";

  const isBot = trustedImageProxyLikelyHuman ? false : botScore >= BOT_SCORE_THRESHOLD;
  if (isBot) {
    await logAutomationEvent(
      workflowId,
      contactId,
      String(contact.user_id || ""),
      "email_open_ignored_bot",
      "Ignored automation email open because the event looks like a bot or privacy proxy prefetch.",
      {
        node_id: nodeId || null,
        tracked_message_id: trackedMessageId || null,
        bot_score: botScore,
        bot_reasons: botReasons,
        user_agent: userAgent || null,
        ip_address: ip || null,
        accept: accept || null,
        via: via || null,
        sec_fetch_site: secFetchSite || null,
        sec_fetch_mode: secFetchMode || null,
        sec_fetch_dest: secFetchDest || null,
        ms_since_send: msSinceSend,
      },
      step
    );
    return;
  }

  if (hasEventInCurrentCycle(state, "last_opened_at")) {
    return;
  }

  const openedAt = new Date().toISOString();
  const nextState = {
    ...state,
    email_opened: true,
    opened: true,
    last_opened_at: openedAt,
  };

  const { error: updateError } = await supabase
    .from("automation_contacts")
    .update({
      status: "active",
      next_run_at: openedAt,
      processing_started_at: null,
      last_error: null,
      state: nextState,
    })
    .eq("id", contactId);

  if (updateError) {
    console.error("Failed to update automation contact open state:", updateError);
    return;
  }

  await logAutomationEvent(
    workflowId,
    contactId,
    String(contact.user_id || ""),
    "email_opened",
    "Tracked a human email open for the current automation message.",
    {
      node_id: nodeId || null,
      tracked_message_id: trackedMessageId || null,
      user_agent: userAgent || null,
      ip_address: ip || null,
      ms_since_send: msSinceSend,
    },
    step
  );

  await touchProspectActivity(String(contact.prospect_id || ""), "automation_email_opened", openedAt);
  await triggerAutomationRunner(workflowId, contactId);
};

serve(async (req) => {
  // Always return the pixel first for fast response
  const response = new Response(transparentPixel, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*'
    }
  });

  // Process tracking in background
  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get('campaign_id');
    const recipientId = url.searchParams.get('recipient_id');
    const workflowId = url.searchParams.get('workflow_id');
    const contactId = url.searchParams.get('contact_id');
    const nodeId = url.searchParams.get('node_id') || '';
    const trackedMessageId = url.searchParams.get('message_id') || '';
    const stepParam = url.searchParams.get('step');
    const stepNumber = stepParam ? Number(stepParam) : null;
    const step = Number.isFinite(stepNumber) ? stepNumber : null;

    console.log(`Tracking email open - Campaign: ${campaignId}, Recipient: ${recipientId}`);

    if (campaignId && recipientId) {
      const userAgent = req.headers.get('user-agent') || '';
      const forwardedFor = req.headers.get('x-forwarded-for') || '';
      const forwardedIp = forwardedFor.split(',')[0]?.trim();
      const ip = forwardedIp || req.headers.get('cf-connecting-ip') || '';
      const accept = req.headers.get('accept') || '';
      const via = req.headers.get('via') || '';
      const secFetchSite = req.headers.get('sec-fetch-site') || '';
      const secFetchMode = req.headers.get('sec-fetch-mode') || '';
      const secFetchDest = req.headers.get('sec-fetch-dest') || '';
      console.log(`User-Agent: ${userAgent}`);

      // Check if already opened (prevent duplicate tracking)
      const { data: recipient } = await supabase
        .from('recipients')
        .select('opened_at, last_email_sent_at')
        .eq('id', recipientId)
        .single();

      if (recipient) {
        let botScore = 0;
        const botReasons: string[] = [];
        let recentIpCount = 0;
        let msSinceSend: number | null = null;

        const addReason = (score: number, reason: string) => {
          botScore += score;
          if (!botReasons.includes(reason)) {
            botReasons.push(reason);
          }
        };

        if (req.method && req.method.toUpperCase() === 'HEAD') {
          addReason(80, 'head_request');
        }

        if (recipient.last_email_sent_at) {
          const sentTime = new Date(recipient.last_email_sent_at).getTime();
          const now = Date.now();
          const timeDiff = now - sentTime;
          msSinceSend = timeDiff;

          if (timeDiff >= 0 && timeDiff <= SPEED_TRAP_CRITICAL_MS) {
            addReason(95, 'speed_trap_critical');
          } else if (timeDiff >= 0 && timeDiff <= SPEED_TRAP_SUSPICIOUS_MS) {
            addReason(50, 'speed_trap_suspicious');
          } else if (timeDiff >= 0 && timeDiff <= SPEED_TRAP_MILD_MS) {
            addReason(20, 'speed_trap_mild');
          }
        }

        const ua = userAgent.toLowerCase();
        const hasHighConfidenceUa = hasToken(ua, HIGH_CONFIDENCE_UA_TOKENS);
        const hasHttpLibraryUa = hasToken(ua, HTTP_LIBRARY_UA_TOKENS);
        const hasTrustedImageProxyUa = hasToken(ua, TRUSTED_IMAGE_PROXY_UA_TOKENS);
        const hasPrivacyImageProxyUa = hasToken(ua, PRIVACY_IMAGE_PROXY_UA_TOKENS);

        if (!ua) {
          addReason(100, 'empty_user_agent');
        } else {
          if (hasHighConfidenceUa) {
            addReason(100, 'known_bot_ua');
          }
          if (hasHttpLibraryUa) {
            addReason(80, 'http_library_ua');
          }
          if (hasPrivacyImageProxyUa) {
            addReason(40, 'image_proxy');
          } else if (hasTrustedImageProxyUa) {
            addReason(5, 'trusted_image_proxy');
          }
        }

        const acceptLower = accept.toLowerCase();
        if (acceptLower && !acceptLower.includes('image')) {
          addReason(20, 'accept_not_image');
        }

        if (ip) {
          const since = new Date(Date.now() - IP_BURST_WINDOW_MS).toISOString();
          const { count: ipCount, error: ipError } = await supabase
            .from('tracking_events')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaignId)
            .eq('ip_address', ip)
            .gte('created_at', since);

          if (!ipError && ipCount !== null) {
            recentIpCount = ipCount;
            if (ipCount >= IP_BURST_THRESHOLD) {
              addReason(50, 'ip_burst');
            }
          }
        }

        const trustedImageProxyLikelyHuman =
          hasTrustedImageProxyUa &&
          !hasHighConfidenceUa &&
          !hasHttpLibraryUa &&
          req.method?.toUpperCase() !== 'HEAD' &&
          recentIpCount < IP_BURST_THRESHOLD;

        const isBot = trustedImageProxyLikelyHuman ? false : botScore >= BOT_SCORE_THRESHOLD;

        await supabase.from('tracking_events').insert({
          campaign_id: campaignId,
          recipient_id: recipientId,
          event_type: 'open',
          user_agent: userAgent,
          ip_address: ip,
          is_bot: isBot,
          bot_score: botScore,
          bot_reasons: botReasons,
          step_number: step,
          metadata: {
            accept,
            via,
            sec_fetch_site: secFetchSite,
            sec_fetch_mode: secFetchMode,
            sec_fetch_dest: secFetchDest,
            ms_since_send: msSinceSend,
            ip_burst_count: recentIpCount
          }
        });

        if (isBot) {
          console.log(`Bot open detected! Score: ${botScore}, Reasons: ${botReasons.join(', ')}`);
          await supabase.rpc('increment_bot_open_count', { campaign_id: campaignId });
          return response;
        }

        const { data: firstHumanOpen } = await supabase
          .from('tracking_events')
          .select('created_at')
          .eq('recipient_id', recipientId)
          .eq('event_type', 'open')
          .eq('is_bot', false)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        const firstHumanOpenedAt = firstHumanOpen?.created_at || new Date().toISOString();
        const currentOpenedAt = recipient.opened_at ? new Date(recipient.opened_at).getTime() : null;
        const earliestHumanOpenedAt = new Date(firstHumanOpenedAt).getTime();

        if (currentOpenedAt === null || currentOpenedAt !== earliestHumanOpenedAt) {
          const { error: updateError } = await supabase
            .from('recipients')
            .update({ opened_at: firstHumanOpenedAt })
            .eq('id', recipientId);

          if (updateError) {
            console.error('Error updating recipient opened_at:', updateError);
          } else {
            console.log(`Successfully updated opened_at for recipient: ${recipientId}`);

            const { error: rpcError } = await supabase.rpc('increment_opened_count', {
              campaign_id: campaignId
            });

            if (rpcError) {
              console.error('Error calling increment_opened_count RPC:', rpcError);
            } else {
              console.log(`Successfully incremented opened count for campaign: ${campaignId}`);
            }
          }
        } else {
          console.log(`Email already marked as opened for recipient: ${recipientId}`);
        }
      } else {
        console.error(`Recipient not found: ${recipientId}`);
      }
    } else if (workflowId && contactId) {
      await processAutomationOpen(workflowId, contactId, nodeId, trackedMessageId, step, req);
    } else {
      console.error('Missing campaign/recipient or workflow/contact identifiers in tracking request');
    }
  } catch (error) {
    console.error('Error in track-email-open:', error);
  }

  return response;
});
