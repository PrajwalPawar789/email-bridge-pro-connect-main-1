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

    console.log(`Tracking email open - Campaign: ${campaignId}, Recipient: ${recipientId}`);

    if (campaignId && recipientId) {
      const userAgent = req.headers.get('user-agent') || '';
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '';
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
        let isBot = false;

        // 1. Speed Trap (Temporal Analysis)
        if (recipient.last_email_sent_at) {
            const sentTime = new Date(recipient.last_email_sent_at).getTime();
            const now = new Date().getTime();
            const timeDiff = now - sentTime;

            if (timeDiff < 2000) { // < 2 seconds
                botScore += 90;
                botReasons.push('speed_trap_critical');
            } else if (timeDiff < 5000) { // < 5 seconds
                botScore += 50;
                botReasons.push('speed_trap_suspicious');
            }
        }

        // 2. User Agent Analysis
        const ua = userAgent.toLowerCase();
        if (!ua) {
            botScore += 100;
            botReasons.push('empty_user_agent');
        } else if (ua.includes('bot') || ua.includes('spider') || ua.includes('crawler') || ua.includes('barracuda') || ua.includes('mimecast')) {
            botScore += 100;
            botReasons.push('known_bot_ua');
        }

        isBot = botScore >= 50;

        // Log detailed tracking event
        await supabase.from('tracking_events').insert({
            campaign_id: campaignId,
            recipient_id: recipientId,
            event_type: 'open',
            user_agent: userAgent,
            ip_address: ip,
            is_bot: isBot,
            bot_score: botScore,
            bot_reasons: botReasons
        });

        if (isBot) {
            console.log(`Bot open detected! Score: ${botScore}, Reasons: ${botReasons.join(', ')}`);
            await supabase.rpc('increment_bot_open_count', { campaign_id: campaignId });
            // Do not mark recipient as opened if it's a bot
            return response;
        }

        if (!recipient.opened_at) {
          // Update recipient with opened timestamp
          const { error: updateError } = await supabase
            .from('recipients')
            .update({ 
              opened_at: new Date().toISOString()
            })
            .eq('id', recipientId);

          if (updateError) {
            console.error('Error updating recipient opened_at:', updateError);
          } else {
            console.log(`Successfully updated opened_at for recipient: ${recipientId}`);
            
            // Update campaign opened count
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
