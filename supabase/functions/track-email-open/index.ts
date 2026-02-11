// @ts-nocheck

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// 1x1 transparent pixel (GIF format)
const transparentPixel = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x04, 0x01, 0x00, 0x3B
]);

const BOT_SCORE_THRESHOLD = 70;
const SPEED_TRAP_CRITICAL_MS = 2000;
const SPEED_TRAP_SUSPICIOUS_MS = 10000;
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

const IMAGE_PROXY_UA_TOKENS = [
  'googleimageproxy',
  'ggpht.com',
  'imageproxy',
  'image proxy',
  'mailprivacy'
];

const hasToken = (value: string, tokens: string[]) =>
  tokens.some((token) => value.includes(token));

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

          if (timeDiff <= SPEED_TRAP_CRITICAL_MS) {
            addReason(90, 'speed_trap_critical');
          } else if (timeDiff <= SPEED_TRAP_SUSPICIOUS_MS) {
            addReason(40, 'speed_trap_suspicious');
          }
        }

        const ua = userAgent.toLowerCase();
        if (!ua) {
          addReason(100, 'empty_user_agent');
        } else {
          if (hasToken(ua, HIGH_CONFIDENCE_UA_TOKENS)) {
            addReason(100, 'known_bot_ua');
          }
          if (hasToken(ua, HTTP_LIBRARY_UA_TOKENS)) {
            addReason(80, 'http_library_ua');
          }
          if (hasToken(ua, IMAGE_PROXY_UA_TOKENS)) {
            addReason(40, 'image_proxy');
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

        const isBot = botScore >= BOT_SCORE_THRESHOLD;

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
    } else {
      console.error('Missing campaign_id or recipient_id in tracking request');
    }
  } catch (error) {
    console.error('Error in track-email-open:', error);
  }

  return response;
});
