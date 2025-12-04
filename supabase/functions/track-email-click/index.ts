
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get('campaign_id');
    const recipientId = url.searchParams.get('recipient_id');
    const encodedUrl = url.searchParams.get('url');
    const isGhost = url.searchParams.get('type') === 'ghost';

    // Properly decode the tracked URL
    const targetUrl = encodedUrl ? decodeURIComponent(encodedUrl) : "";
    
    const userAgent = req.headers.get('user-agent') || '';
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '';

    console.log(`Tracking email click - Campaign: ${campaignId}, Recipient: ${recipientId}, Target: ${targetUrl}`);

    if (campaignId && recipientId) {
      // Check if already clicked (prevent duplicate tracking)
      const { data: existing } = await supabase
        .from('recipients')
        .select('clicked_at, last_email_sent_at')
        .eq('id', recipientId)
        .single();

      if (existing) {
        let botScore = 0;
        const botReasons: string[] = [];
        let isBot = false;

        // 1. Speed Trap
        if (existing.last_email_sent_at) {
            const sentTime = new Date(existing.last_email_sent_at).getTime();
            const now = new Date().getTime();
            const timeDiff = now - sentTime;
            
            if (timeDiff < 2000) { 
                botScore += 90;
                botReasons.push('speed_trap_critical');
            }
        }

        // 2. Honeypot
        if (isGhost) {
            botScore += 100;
            botReasons.push('honeypot_clicked');
        }

        // 3. User Agent
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
            event_type: 'click',
            user_agent: userAgent,
            ip_address: ip,
            is_bot: isBot,
            bot_score: botScore,
            bot_reasons: botReasons,
            metadata: { target_url: targetUrl, is_ghost: isGhost }
        });

        if (isBot) {
            console.log(`Bot click detected! Score: ${botScore}`);
            await supabase.rpc('increment_bot_click_count', { campaign_id: campaignId });
            // Redirect but don't count as human click
            if (targetUrl && targetUrl !== "") {
                return Response.redirect(targetUrl, 302);
            }
            return new Response('Link tracked', { status: 200 });
        }

        if (!existing.clicked_at) {
          // Update recipient with clicked timestamp
          const { error: updateError } = await supabase
            .from('recipients')
            .update({ 
              clicked_at: new Date().toISOString()
            })
            .eq('id', recipientId);

          if (updateError) {
            console.error('Error updating recipient clicked_at:', updateError);
          } else {
            console.log(`Successfully updated clicked_at for recipient: ${recipientId}`);
            
            // Update campaign clicked count
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
