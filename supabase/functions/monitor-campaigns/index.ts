// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// Monitor and process all active campaigns
const monitorCampaigns = async () => {
  console.log('Checking for campaigns that need a batch sent...');
  
  try {
    // 1. Get all campaigns that are currently 'sending' or 'sent' (completed initial batch)
    // We include 'sent' because they might have pending follow-ups
    const { data: activeCampaigns, error: fetchError } = await supabase
      .from('campaigns')
      .select('id, name, status, last_batch_sent_at, send_delay_minutes, scheduled_at')
      .in('status', ['sending', 'sent', 'scheduled']);
    
    if (fetchError) {
      console.error('Error fetching campaigns:', fetchError);
      return { error: 'Failed to fetch campaigns' };
    }
    
    if (!activeCampaigns || activeCampaigns.length === 0) {
      console.log('No active campaigns found.');
      return { success: true, message: 'No active campaigns', campaigns: [] };
    }
    
    // 2. Get follow-up configurations for these campaigns
    const campaignIds = activeCampaigns.map(c => c.id);
    const { data: followups, error: followupError } = await supabase
      .from('campaign_followups')
      .select('campaign_id, step_number')
      .in('campaign_id', campaignIds);

    if (followupError) {
      console.error('Error fetching followups:', followupError);
    }

    // 2.5 Get email configurations for these campaigns (for multi-sender support)
    const { data: emailConfigs, error: configError } = await supabase
      .from('campaign_email_configurations')
      .select('campaign_id, email_config_id, last_sent_at')
      .in('campaign_id', campaignIds);

    if (configError) {
      console.error('Error fetching email configs:', configError);
    }

    console.log(`Found ${activeCampaigns.length} active campaigns. Checking eligibility...`);
    
    const results = [];
    const now = new Date().getTime();

    // 3. Check which campaigns are ready for the next batch
    for (const campaign of activeCampaigns) {
      
      // Handle scheduled campaigns
      if (campaign.status === 'scheduled') {
        if (campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() <= now) {
           console.log(`Starting scheduled campaign: ${campaign.name}`);
           const { error: updateError } = await supabase
             .from('campaigns')
             .update({ status: 'sending' })
             .eq('id', campaign.id);
           
           if (updateError) {
             console.error(`Failed to start scheduled campaign ${campaign.name}:`, updateError);
             continue;
           } else {
             // Update local status to process it immediately in this run
             campaign.status = 'sending';
           }
        } else {
           console.log(`Campaign ${campaign.name} is scheduled for ${campaign.scheduled_at}. Waiting...`);
           continue;
        }
      }

      // --- STEP 0: Initial Emails ---
      if (campaign.status === 'sending') {
        // Default delay to 1 minute if not set
        const delayMinutes = campaign.send_delay_minutes || 1;
        const delayMs = delayMinutes * 60 * 1000;
        
        // Check for multi-sender configs
        const campaignConfigs = emailConfigs?.filter(c => c.campaign_id === campaign.id) || [];

        if (campaignConfigs.length > 0) {
          // Multi-sender mode: Check each config independently
          console.log(`Campaign ${campaign.name} has ${campaignConfigs.length} senders configured. Checking each...`);
          
          const promises = campaignConfigs.map(async (config) => {
            const lastSent = config.last_sent_at ? new Date(config.last_sent_at).getTime() : 0;
            const timeSinceLastBatch = now - lastSent;

            if (lastSent === 0 || timeSinceLastBatch >= delayMs) {
              console.log(`Triggering Step 0 batch for: ${campaign.name} (Sender: ${config.email_config_id})`);
              
              try {
                const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
                  body: { 
                    campaignId: campaign.id, 
                    batchSize: 1, 
                    step: 0,
                    emailConfigId: config.email_config_id 
                  }
                });
                
                if (error) {
                  console.error(`Failed to trigger Step 0 for ${campaign.name} (Sender: ${config.email_config_id}):`, error);
                  results.push({ id: campaign.id, name: campaign.name, step: 0, sender: config.email_config_id, status: 'error', error });
                } else {
                  results.push({ id: campaign.id, name: campaign.name, step: 0, sender: config.email_config_id, status: 'triggered', data });
                }
              } catch (err) {
                console.error(`Exception triggering Step 0 for ${campaign.name}:`, err);
              }
            }
          });
          
          await Promise.all(promises);
        } else {
          // Single sender mode (Legacy)
          // If never sent, or if enough time has passed since last batch
          const lastSent = campaign.last_batch_sent_at ? new Date(campaign.last_batch_sent_at).getTime() : 0;
          const timeSinceLastBatch = now - lastSent;
          
          if (lastSent === 0 || timeSinceLastBatch >= delayMs) {
            console.log(`Triggering Step 0 batch for: ${campaign.name} (Single Sender)`);
            
            // Use batchSize = 1 to strictly respect the "Delay Between Emails" setting.
            // This ensures we send 1 email, then wait for the configured delay.
            try {
              const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
                body: { campaignId: campaign.id, batchSize: 1, step: 0 }
              });
              
              if (error) {
                console.error(`Failed to trigger Step 0 for ${campaign.name}:`, error);
                results.push({ id: campaign.id, name: campaign.name, step: 0, status: 'error', error });
              } else {
                results.push({ id: campaign.id, name: campaign.name, step: 0, status: 'triggered', data });
              }
            } catch (err) {
              console.error(`Exception triggering Step 0 for ${campaign.name}:`, err);
            }
          } else {
            // console.log(`Skipping Step 0 for ${campaign.name}: Waiting for delay`);
          }
        }
      }

      // --- FOLLOW-UP STEPS ---
      const campaignFollowups = followups?.filter(f => f.campaign_id === campaign.id) || [];
      const campaignConfigsForFollowup = emailConfigs?.filter(c => c.campaign_id === campaign.id) || [];

      if (campaignConfigsForFollowup.length > 0) {
        // Parallel follow-ups per sender
        const promises = campaignConfigsForFollowup.map(async (config) => {
          for (const fp of campaignFollowups) {
            try {
              const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
                body: { 
                  campaignId: campaign.id, 
                  batchSize: 10, 
                  step: fp.step_number,
                  emailConfigId: config.email_config_id
                }
              });
              
              if (error) {
                console.error(`Failed to trigger Step ${fp.step_number} for ${campaign.name} (Sender: ${config.email_config_id}):`, error);
                results.push({ id: campaign.id, name: campaign.name, step: fp.step_number, sender: config.email_config_id, status: 'error', error });
              } else {
                results.push({ id: campaign.id, name: campaign.name, step: fp.step_number, sender: config.email_config_id, status: 'triggered', data });
              }
            } catch (err) {
              console.error(`Exception triggering Step ${fp.step_number} for ${campaign.name}:`, err);
            }
          }
        });
        await Promise.all(promises);
      } else {
        // Legacy single sender follow-ups
        for (const fp of campaignFollowups) {
          // For follow-ups, we just trigger the worker. It handles the "is eligible?" logic per recipient.
          // We don't want to spam it too hard, but since we don't track "last_followup_batch_at",
          // we rely on the worker being efficient.
          
          // console.log(`Triggering follow-up check for ${campaign.name} (Step ${fp.step_number})`);
          
          try {
            const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
              body: { campaignId: campaign.id, batchSize: 10, step: fp.step_number }
            });
            
            if (error) {
              console.error(`Failed to trigger Step ${fp.step_number} for ${campaign.name}:`, error);
              results.push({ id: campaign.id, name: campaign.name, step: fp.step_number, status: 'error', error });
            } else {
              // Only log if it actually did something (optional, but hard to know from here without parsing data)
              results.push({ id: campaign.id, name: campaign.name, step: fp.step_number, status: 'triggered', data });
            }
          } catch (err) {
            console.error(`Exception triggering Step ${fp.step_number} for ${campaign.name}:`, err);
          }
        }
      }
    }
    
    return { 
      success: true, 
      message: `Checked ${activeCampaigns.length} campaigns`,
      results 
    };
    
  } catch (error) {
    console.error('Error in campaign monitoring:', error);
    return { error: 'Campaign monitoring failed' };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const result = await monitorCampaigns();
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        } 
      }
    );

  } catch (error) {
    console.error('Error in monitor-campaigns function:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        } 
      }
    );
  }
});