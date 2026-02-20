
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const BOT_SCORE_THRESHOLD = 70;
const SPEED_TRAP_CRITICAL_MS = 5000;
const SPEED_TRAP_SUSPICIOUS_MS = 30000;
const SPEED_TRAP_MILD_MS = 120000;
const OPEN_CLICK_CRITICAL_MS = 15000;
const OPEN_CLICK_SUSPICIOUS_MS = 45000;
const OPEN_CLICK_BURST_AFTER_SEND_MS = 60000;
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
  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get('campaign_id');
    const recipientId = url.searchParams.get('recipient_id');
    const encodedUrl = url.searchParams.get('url');
    const isGhost = url.searchParams.get('type') === 'ghost';
    const stepParam = url.searchParams.get('step');
    const stepNumber = stepParam ? Number(stepParam) : null;
    const step = Number.isFinite(stepNumber) ? stepNumber : null;

    // Properly decode the tracked URL
    const targetUrl = encodedUrl ? decodeURIComponent(encodedUrl) : "";
    
    const userAgent = req.headers.get('user-agent') || '';
    const forwardedFor = req.headers.get('x-forwarded-for') || '';
    const forwardedIp = forwardedFor.split(',')[0]?.trim();
    const ip = forwardedIp || req.headers.get('cf-connecting-ip') || '';
    const accept = req.headers.get('accept') || '';
    const via = req.headers.get('via') || '';
    const secFetchSite = req.headers.get('sec-fetch-site') || '';
    const secFetchMode = req.headers.get('sec-fetch-mode') || '';
    const secFetchDest = req.headers.get('sec-fetch-dest') || '';

    console.log(`Tracking email click - Campaign: ${campaignId}, Recipient: ${recipientId}, Target: ${targetUrl}`);

    if (campaignId && recipientId) {
      // Check if already clicked (prevent duplicate tracking)
      const { data: existing } = await supabase
        .from('recipients')
        .select('clicked_at, opened_at, last_email_sent_at')
        .eq('id', recipientId)
        .single();

      if (existing) {
        let botScore = 0;
        const botReasons: string[] = [];
        let recentIpCount = 0;
        let msSinceSend: number | null = null;
        let msSinceOpen: number | null = null;
        let latestOpenEvent: {
          id: string;
          created_at: string | null;
          is_bot: boolean | null;
          bot_score: number | null;
          bot_reasons: string[] | null;
          metadata: Record<string, unknown> | null;
        } | null = null;

        const addReason = (score: number, reason: string) => {
          botScore += score;
          if (!botReasons.includes(reason)) {
            botReasons.push(reason);
          }
        };

        if (req.method && req.method.toUpperCase() === 'HEAD') {
          addReason(80, 'head_request');
        }

        // 1. Speed Trap relative to send time
        if (existing.last_email_sent_at) {
            const sentTime = new Date(existing.last_email_sent_at).getTime();
            const now = new Date().getTime();
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

        // 2. Open->click burst signal for per-recipient bot scans
        const { data: recentOpen, error: recentOpenError } = await supabase
          .from('tracking_events')
          .select('id, created_at, is_bot, bot_score, bot_reasons, metadata')
          .eq('recipient_id', recipientId)
          .eq('event_type', 'open')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentOpenError) {
          console.error('Error fetching recent open event:', recentOpenError);
        } else if (recentOpen) {
          const openMetadata =
            recentOpen.metadata &&
            typeof recentOpen.metadata === 'object' &&
            !Array.isArray(recentOpen.metadata)
              ? (recentOpen.metadata as Record<string, unknown>)
              : null;

          latestOpenEvent = {
            id: recentOpen.id,
            created_at: recentOpen.created_at,
            is_bot: recentOpen.is_bot,
            bot_score: recentOpen.bot_score,
            bot_reasons: recentOpen.bot_reasons,
            metadata: openMetadata
          };

          if (recentOpen.created_at) {
            const openTime = new Date(recentOpen.created_at).getTime();
            const now = Date.now();
            const gapMs = now - openTime;
            msSinceOpen = gapMs;

            if (gapMs >= 0 && gapMs <= OPEN_CLICK_CRITICAL_MS) {
              addReason(60, 'open_click_gap_critical');
            } else if (gapMs >= 0 && gapMs <= OPEN_CLICK_SUSPICIOUS_MS) {
              addReason(35, 'open_click_gap_suspicious');
            }
          }
        } else if (existing.opened_at) {
          // Fallback to recipient opened_at if no open event row is available yet.
          const openTime = new Date(existing.opened_at).getTime();
          const now = Date.now();
          const gapMs = now - openTime;
          msSinceOpen = gapMs;

          if (gapMs >= 0 && gapMs <= OPEN_CLICK_CRITICAL_MS) {
            addReason(60, 'open_click_gap_critical');
          } else if (gapMs >= 0 && gapMs <= OPEN_CLICK_SUSPICIOUS_MS) {
            addReason(35, 'open_click_gap_suspicious');
          }
        }

        if (
          msSinceSend !== null &&
          msSinceOpen !== null &&
          msSinceSend >= 0 &&
          msSinceOpen >= 0 &&
          msSinceSend <= OPEN_CLICK_BURST_AFTER_SEND_MS &&
          msSinceOpen <= OPEN_CLICK_SUSPICIOUS_MS
        ) {
          addReason(45, 'open_click_burst_after_send');
        }

        // 3. Honeypot
        if (isGhost) {
            addReason(100, 'honeypot_clicked');
        }

        // 4. User Agent
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
        if (acceptLower && !acceptLower.includes('text/html')) {
          addReason(20, 'accept_not_html');
        }

        if (ip) {
          const since = new Date(Date.now() - IP_BURST_WINDOW_MS).toISOString();
          const { count: ipCount, error: ipError } = await supabase
            .from('tracking_events')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaignId)
            .eq('event_type', 'click')
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

        // Log detailed tracking event
        await supabase.from('tracking_events').insert({
            campaign_id: campaignId,
            recipient_id: recipientId,
            event_type: 'click',
            user_agent: userAgent,
            ip_address: ip,
            is_bot: isBot,
            bot_score: botScore,
            bot_reasons: botReasons,
            step_number: step,
            metadata: {
              target_url: targetUrl,
              is_ghost: isGhost,
              accept,
              via,
              sec_fetch_site: secFetchSite,
              sec_fetch_mode: secFetchMode,
              sec_fetch_dest: secFetchDest,
              ms_since_send: msSinceSend,
              ms_since_open: msSinceOpen,
              open_event_id: latestOpenEvent?.id || null,
              ip_burst_count: recentIpCount
            }
        });

        if (isBot) {
            console.log(`Bot click detected! Score: ${botScore}, Reasons: ${botReasons.join(', ')}`);

            const shouldReclassifyOpenAsBot =
              !!latestOpenEvent &&
              latestOpenEvent.is_bot === false &&
              msSinceOpen !== null &&
              msSinceOpen >= 0 &&
              msSinceOpen <= OPEN_CLICK_SUSPICIOUS_MS &&
              botReasons.includes('open_click_burst_after_send');

            if (shouldReclassifyOpenAsBot && latestOpenEvent) {
              const existingOpenReasons = Array.isArray(latestOpenEvent.bot_reasons)
                ? [...latestOpenEvent.bot_reasons]
                : [];
              if (!existingOpenReasons.includes('retroactive_open_click_burst')) {
                existingOpenReasons.push('retroactive_open_click_burst');
              }

              const existingOpenMetadata =
                latestOpenEvent.metadata &&
                typeof latestOpenEvent.metadata === 'object' &&
                !Array.isArray(latestOpenEvent.metadata)
                  ? latestOpenEvent.metadata
                  : {};

              const { data: reclassifiedOpenRows, error: reclassifyOpenError } = await supabase
                .from('tracking_events')
                .update({
                  is_bot: true,
                  bot_score: Math.max(latestOpenEvent.bot_score || 0, BOT_SCORE_THRESHOLD),
                  bot_reasons: existingOpenReasons,
                  metadata: {
                    ...existingOpenMetadata,
                    retro_classified_by_click: true,
                    retro_classified_at: new Date().toISOString(),
                    retro_classified_click_gap_ms: msSinceOpen,
                    retro_classified_click_reasons: botReasons
                  }
                })
                .eq('id', latestOpenEvent.id)
                .eq('is_bot', false)
                .select('id');

              if (reclassifyOpenError) {
                console.error('Error reclassifying open event as bot:', reclassifyOpenError);
              } else if ((reclassifiedOpenRows || []).length > 0) {
                await supabase.rpc('increment_bot_open_count', { campaign_id: campaignId });

                const { data: firstHumanOpenAfterReclass, error: firstHumanOpenError } = await supabase
                  .from('tracking_events')
                  .select('created_at')
                  .eq('recipient_id', recipientId)
                  .eq('event_type', 'open')
                  .eq('is_bot', false)
                  .order('created_at', { ascending: true })
                  .limit(1)
                  .maybeSingle();

                if (firstHumanOpenError) {
                  console.error('Error fetching first human open after reclassification:', firstHumanOpenError);
                } else {
                  const nextHumanOpenedAt = firstHumanOpenAfterReclass?.created_at || null;
                  const { error: recipientOpenUpdateError } = await supabase
                    .from('recipients')
                    .update({ opened_at: nextHumanOpenedAt })
                    .eq('id', recipientId);

                  if (recipientOpenUpdateError) {
                    console.error('Error updating recipient opened_at after reclassification:', recipientOpenUpdateError);
                  } else {
                    const { error: recountOpenError } = await supabase.rpc('increment_opened_count', {
                      campaign_id: campaignId
                    });
                    if (recountOpenError) {
                      console.error('Error recalculating opened_count after reclassification:', recountOpenError);
                    }
                  }
                }
              }
            }

            await supabase.rpc('increment_bot_click_count', { campaign_id: campaignId });
            // Redirect but don't count as human click
            if (targetUrl && targetUrl !== "") {
                return Response.redirect(targetUrl, 302);
            }
            return new Response('Link tracked', { status: 200 });
        }

        const { data: firstHumanClick } = await supabase
          .from('tracking_events')
          .select('created_at')
          .eq('recipient_id', recipientId)
          .eq('event_type', 'click')
          .eq('is_bot', false)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        const firstHumanClickedAt = firstHumanClick?.created_at || new Date().toISOString();
        const currentClickedAt = existing.clicked_at ? new Date(existing.clicked_at).getTime() : null;
        const earliestHumanClickedAt = new Date(firstHumanClickedAt).getTime();

        if (currentClickedAt === null || currentClickedAt !== earliestHumanClickedAt) {
          const { error: updateError } = await supabase
            .from('recipients')
            .update({ clicked_at: firstHumanClickedAt })
            .eq('id', recipientId);

          if (updateError) {
            console.error('Error updating recipient clicked_at:', updateError);
          } else {
            console.log(`Successfully updated clicked_at for recipient: ${recipientId}`);

            const { error: rpcError } = await supabase.rpc('increment_clicked_count', {
              campaign_id: campaignId
            });

            if (rpcError) {
              console.error('Error calling increment_clicked_count RPC:', rpcError);
            } else {
              console.log(`Successfully incremented clicked count for campaign: ${campaignId}`);
            }
          }
        } else {
          console.log(`Email link already clicked for recipient: ${recipientId}`);
        }
      } else {
        console.error(`Recipient not found: ${recipientId}`);
      }
    } else {
      console.error('Missing required parameters for click tracking');
    }

    // Redirect to the original URL
    if (targetUrl && targetUrl !== "") {
      console.log(`Redirecting to: ${targetUrl}`);
      return Response.redirect(targetUrl, 302);
    }

    return new Response('Link tracked but no redirect URL provided', { status: 200 });
  } catch (error) {
    console.error('Error in track-email-click:', error);
    
    // Fallback redirect if tracking fails
    const url = new URL(req.url);
    const encodedUrl = url.searchParams.get('url');
    const targetUrl = encodedUrl ? decodeURIComponent(encodedUrl) : "";
    if (targetUrl && targetUrl !== "") {
      console.log(`Fallback redirect to: ${targetUrl}`);
      return Response.redirect(targetUrl, 302);
    }
    
    return new Response('Error processing click tracking', { status: 500 });
  }
});
