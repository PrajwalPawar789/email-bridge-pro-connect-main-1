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

const STEP0_DAILY_QUOTA_RATIO = 0.5;

const getDailyQuotaForStep = (dailyLimit: number, step: number) => {
  if (dailyLimit <= 0) return 0;
  const step0Limit = Math.max(1, Math.floor(dailyLimit * STEP0_DAILY_QUOTA_RATIO));
  const followupLimit = Math.max(0, dailyLimit - step0Limit);
  return step === 0 ? step0Limit : followupLimit;
};

// Monitor and process all active campaigns
const monitorCampaigns = async () => {
  console.log('Checking for campaigns that need a batch sent...');
  
  try {
    // 1. Get all campaigns that are currently 'sending' or 'sent' (completed initial batch)
    // We include 'sent' because they might have pending follow-ups
    const { data: activeCampaigns, error: fetchError } = await supabase
      .from('campaigns')
      .select('id, name, status, last_batch_sent_at, send_delay_minutes, scheduled_at, email_config_id')
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
      .select('campaign_id, step_number, delay_days, delay_hours')
      .in('campaign_id', campaignIds);

    if (followupError) {
      console.error('Error fetching followups:', followupError);
    }

    // 2.5 Get email configurations for these campaigns (for multi-sender support)
    const { data: emailConfigs, error: configError } = await supabase
      .from('campaign_email_configurations')
      .select('campaign_id, email_config_id, last_sent_at, daily_limit')
      .in('campaign_id', campaignIds);

    if (configError) {
      console.error('Error fetching email configs:', configError);
    }

    console.log(`Found ${activeCampaigns.length} active campaigns. Checking eligibility...`);
    
    const results = [];
    const now = new Date().getTime();
    const dueCountCache = new Map<string, number>();
    const sentTodayCache = new Map<string, number>();
    const pendingCountCache = new Map<string, number>();

    const getDueRecipientCount = async (campaignId: string, step: number, followup: any, emailConfigId?: string | null) => {
      const cacheKey = `${campaignId}|${step}|${emailConfigId || 'any'}`;
      if (dueCountCache.has(cacheKey)) {
        return dueCountCache.get(cacheKey) || 0;
      }

      let dueQuery = supabase
        .from('recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .or('replied.is.null,replied.eq.false');

      if (step === 0) {
        dueQuery = dueQuery.or('status.is.null,status.eq.pending');
      } else {
        const delayDays = followup?.delay_days || 0;
        const delayHours = followup?.delay_hours || 0;
        const cutoffDate = new Date();

        cutoffDate.setDate(cutoffDate.getDate() - delayDays);
        cutoffDate.setHours(cutoffDate.getHours() - delayHours);

        dueQuery = dueQuery
          .eq('current_step', step - 1)
          .eq('status', 'sent')
          .lt('last_email_sent_at', cutoffDate.toISOString());
      }

      if (emailConfigId) {
        dueQuery = dueQuery.or(`assigned_email_config_id.eq.${emailConfigId},assigned_email_config_id.is.null`);
      }

      const { count, error } = await dueQuery;
      if (error) {
        console.warn(`Error counting due recipients for campaign ${campaignId} step ${step}:`, error.message);
        dueCountCache.set(cacheKey, 0);
        return 0;
      }

      const dueCount = count || 0;
      dueCountCache.set(cacheKey, dueCount);
      return dueCount;
    };

    const getSentTodayCount = async (campaignId: string, emailConfigId: string | null, step: number) => {
      if (!emailConfigId) return 0;
      const cacheKey = `${campaignId}|${emailConfigId}|${step}|sent`;
      if (sentTodayCache.has(cacheKey)) {
        return sentTodayCache.get(cacheKey) || 0;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let countQuery = supabase
        .from('recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('assigned_email_config_id', emailConfigId)
        .gte('last_email_sent_at', today.toISOString())
        .lt('last_email_sent_at', tomorrow.toISOString());

      if (step === 0) {
        countQuery = countQuery.or('current_step.eq.0,current_step.is.null');
      } else {
        countQuery = countQuery.gte('current_step', 1);
      }

      const { count, error } = await countQuery;
      if (error) {
        console.warn(`Error counting sent recipients for ${campaignId} config ${emailConfigId}:`, error.message);
        sentTodayCache.set(cacheKey, 0);
        return 0;
      }

      const sentToday = count || 0;
      sentTodayCache.set(cacheKey, sentToday);
      return sentToday;
    };

    const getPendingRecipientCount = async (campaignId: string) => {
      if (pendingCountCache.has(campaignId)) {
        return pendingCountCache.get(campaignId) || 0;
      }

      const { count, error } = await supabase
        .from('recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .or('status.is.null,status.eq.pending');

      if (error) {
        console.warn(`Error counting pending recipients for campaign ${campaignId}:`, error.message);
        pendingCountCache.set(campaignId, 0);
        return 0;
      }

      const pendingCount = count || 0;
      pendingCountCache.set(campaignId, pendingCount);
      return pendingCount;
    };

    const getRemainingCapacity = async (campaignId: string, emailConfigId: string | null, step: number, dailyLimit: number) => {
      if (!emailConfigId) return Number.POSITIVE_INFINITY;
      const stepLimit = getDailyQuotaForStep(dailyLimit, step);
      if (stepLimit <= 0) return 0;
      const sentToday = await getSentTodayCount(campaignId, emailConfigId, step);
      return Math.max(0, stepLimit - sentToday);
    };

    const hasDueFollowups = async (campaignId: string, emailConfigId: string | null, campaignFollowups: any[]) => {
      if (!campaignFollowups.length) return false;

      for (const step of campaignFollowups) {
        const dueCount = await getDueRecipientCount(campaignId, step.step_number, step, emailConfigId);
        if (dueCount > 0) {
          return true;
        }
      }

      return false;
    };

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

      // For sending campaigns, check follow-ups first, then initial emails
      // For sent campaigns, only check follow-ups
      if (campaign.status === 'sending' || campaign.status === 'sent') {
        // --- FOLLOW-UP STEPS FIRST (for sending campaigns) ---
        const campaignFollowups = followups?.filter(f => f.campaign_id === campaign.id) || [];
        const campaignConfigsForFollowup = emailConfigs?.filter(c => c.campaign_id === campaign.id) || [];

        if (campaignConfigsForFollowup.length > 0) {
          // Parallel follow-ups per sender
          const promises = campaignConfigsForFollowup.map(async (config) => {
            for (const fp of campaignFollowups) {
              try {
                const dueCount = await getDueRecipientCount(campaign.id, fp.step_number, fp, config.email_config_id);
                if (dueCount <= 0) {
                  continue;
                }

                const remainingCapacity = await getRemainingCapacity(
                  campaign.id,
                  config.email_config_id,
                  fp.step_number,
                  config.daily_limit || 100
                );

                if (remainingCapacity <= 0) {
                  continue;
                }

                const batchSize = Math.min(10, dueCount, remainingCapacity);
                if (batchSize <= 0) {
                  continue;
                }

                const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
                  body: { 
                    campaignId: campaign.id, 
                    batchSize, 
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
            try {
              const dueCount = await getDueRecipientCount(campaign.id, fp.step_number, fp, null);
              if (dueCount <= 0) {
                continue;
              }

              const remainingCapacity = await getRemainingCapacity(
                campaign.id,
                campaign.email_config_id || null,
                fp.step_number,
                100
              );

              if (remainingCapacity <= 0) {
                continue;
              }

              const batchSize = Math.min(10, dueCount, remainingCapacity);
              if (batchSize <= 0) {
                continue;
              }

              const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
                body: { campaignId: campaign.id, batchSize, step: fp.step_number }
              });
              
              if (error) {
                console.error(`Failed to trigger Step ${fp.step_number} for ${campaign.name}:`, error);
                results.push({ id: campaign.id, name: campaign.name, step: fp.step_number, status: 'error', error });
              } else {
                results.push({ id: campaign.id, name: campaign.name, step: fp.step_number, status: 'triggered', data });
              }
            } catch (err) {
              console.error(`Exception triggering Step ${fp.step_number} for ${campaign.name}:`, err);
            }
          }
        }
      }

      // --- STEP 0: Initial Emails ---
      if (campaign.status === 'sending') {
        // Default delay to 1 minute if not set
        const delayMinutes = campaign.send_delay_minutes || 1;
        const delayMs = delayMinutes * 60 * 1000;

        const pendingCount = await getPendingRecipientCount(campaign.id);
        if (pendingCount === 0) {
          await supabase
            .from('campaigns')
            .update({ 
              status: 'sent',
              updated_at: new Date().toISOString()
            })
            .eq('id', campaign.id);
          continue;
        }
        
        // Check for multi-sender configs
        const campaignConfigs = emailConfigs?.filter(c => c.campaign_id === campaign.id) || [];

        if (campaignConfigs.length > 0) {
          // Multi-sender mode: Check each config independently
          console.log(`Campaign ${campaign.name} has ${campaignConfigs.length} senders configured. Checking each...`);
          
          const promises = campaignConfigs.map(async (config) => {
            const campaignFollowups = followups?.filter(f => f.campaign_id === campaign.id) || [];
            const followupsDue = await hasDueFollowups(campaign.id, config.email_config_id, campaignFollowups);

            if (followupsDue) {
              console.log(`Skipping Step 0 for ${campaign.name} (Sender: ${config.email_config_id}) due to overdue follow-ups.`);
              return;
            }

            const dueCount = await getDueRecipientCount(campaign.id, 0, null, config.email_config_id);
            if (dueCount <= 0) {
              return;
            }

            const remainingCapacity = await getRemainingCapacity(
              campaign.id,
              config.email_config_id,
              0,
              config.daily_limit || 100
            );

            if (remainingCapacity <= 0) {
              return;
            }

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
          
          const campaignFollowups = followups?.filter(f => f.campaign_id === campaign.id) || [];
          const followupsDue = await hasDueFollowups(campaign.id, null, campaignFollowups);

          if (followupsDue) {
            console.log(`Skipping Step 0 for ${campaign.name} due to overdue follow-ups.`);
            continue;
          }

          const dueCount = await getDueRecipientCount(campaign.id, 0, null, null);
          if (dueCount <= 0) {
            continue;
          }

          const remainingCapacity = await getRemainingCapacity(
            campaign.id,
            campaign.email_config_id || null,
            0,
            100
          );

          if (remainingCapacity <= 0) {
            continue;
          }

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
