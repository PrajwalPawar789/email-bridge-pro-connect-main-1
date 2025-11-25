
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

    // Properly decode the tracked URL
    const targetUrl = encodedUrl ? decodeURIComponent(encodedUrl) : "";

    console.log(`Tracking email click - Campaign: ${campaignId}, Recipient: ${recipientId}, Target: ${targetUrl}`);

    if (campaignId && recipientId) {
      // Check if already clicked (prevent duplicate tracking)
      const { data: existing } = await supabase
        .from('recipients')
        .select('clicked_at')
        .eq('id', recipientId)
        .single();

      if (existing && !existing.clicked_at) {
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
      } else if (existing?.clicked_at) {
        console.log(`Email link already clicked for recipient: ${recipientId}`);
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
