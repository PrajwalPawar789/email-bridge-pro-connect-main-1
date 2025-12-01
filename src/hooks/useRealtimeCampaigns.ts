import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const useRealtimeCampaigns = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    try {
      console.log('Fetching campaigns with real-time tracking...');
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('No user found, skipping fetch');
        return;
      }

      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          recipients (id, status, opened_at, clicked_at, current_step, bounced, replied, last_email_sent_at, email, name),
          campaign_followups (id, step_number, delay_days, delay_hours)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching campaigns:', error);
        throw error;
      }
      
      console.log('Campaigns fetched with real-time data:', data?.length);
      setCampaigns(data || []);
    } catch (error: any) {
      console.error('Campaign fetch error:', error);
      toast({
        title: "Error",
        description: "Failed to fetch campaigns: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const resumeStuckCampaigns = useCallback(async () => {
    try {
      console.log('Checking for stuck campaigns...');
      
      // Call the database function to resume stuck campaigns
      const { error } = await supabase.rpc('resume_stuck_campaigns');
      
      if (error) {
        console.error('Error resuming stuck campaigns:', error);
        return;
      }
      
      console.log('Stuck campaigns check completed');
      
      // Check for campaigns that need to be restarted
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select(`
          id, name, status, sent_count, failed_count,
          recipients (id, status)
        `)
        .in('status', ['ready', 'sending', 'failed']);
      
      if (campaigns) {
        for (const campaign of campaigns) {
          const actualSent = campaign.recipients?.filter(r => r.status === 'sent').length || 0;
          const actualFailed = campaign.recipients?.filter(r => r.status === 'failed').length || 0;
          const actualPending = campaign.recipients?.filter(r => r.status === 'pending').length || 0;
          
          // Restart conditions:
          // 1. Status is 'ready' or 'failed' but has pending recipients
          // 2. Statistics mismatch with pending recipients
          // 3. Status is 'sending' but hasn't been updated recently and has pending recipients
          const shouldRestart = (
            (campaign.status === 'ready' && actualPending > 0) ||
            (campaign.status === 'failed' && actualPending > 0) ||
            (campaign.sent_count !== actualSent && actualPending > 0) ||
            (campaign.failed_count !== actualFailed && actualPending > 0)
          );
          
          if (shouldRestart) {
            console.log(`Restarting campaign: ${campaign.name} (${campaign.id})`);
            console.log(`Stats - DB: sent=${campaign.sent_count}, failed=${campaign.failed_count} | Actual: sent=${actualSent}, failed=${actualFailed}, pending=${actualPending}`);
            
            try {
              // Restart the campaign via edge function
              const { data, error } = await supabase.functions.invoke('send-campaign-emails', {
                body: { campaignId: campaign.id, resume: true }
              });
              
              if (error) {
                console.error(`Error restarting campaign ${campaign.id}:`, error);
              } else {
                console.log(`Successfully triggered restart for campaign ${campaign.id}`);
              }
            } catch (error) {
              console.error(`Exception restarting campaign ${campaign.id}:`, error);
            }
          }
        }
      }
      
      // Fetch campaigns again to reflect any status changes
      await fetchCampaigns();
    } catch (error) {
      console.error('Error in resume stuck campaigns:', error);
    }
  }, [fetchCampaigns]);

  useEffect(() => {
    // Initial fetch
    fetchCampaigns();
    
    // Resume any stuck campaigns on app load
    resumeStuckCampaigns();

    // Set up real-time subscriptions
    console.log('Setting up real-time subscriptions...');
    
    // Subscribe to campaign changes
    const campaignChannel = supabase
      .channel('campaign-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaigns'
        },
        (payload) => {
          console.log('Campaign change detected:', payload);
          // Refetch campaigns to get updated data with relationships
          fetchCampaigns();
        }
      )
      .subscribe();

    // Subscribe to recipient changes (for progress updates)
    const recipientChannel = supabase
      .channel('recipient-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recipients'
        },
        (payload) => {
          console.log('Recipient change detected:', payload);
          // Refetch campaigns to update progress stats
          fetchCampaigns();
        }
      )
      .subscribe();

    // Set up periodic stuck campaign check (every 5 minutes)
    const stuckCampaignInterval = setInterval(resumeStuckCampaigns, 5 * 60 * 1000);

    // Cleanup subscriptions and intervals
    return () => {
      console.log('Cleaning up real-time subscriptions...');
      supabase.removeChannel(campaignChannel);
      supabase.removeChannel(recipientChannel);
      clearInterval(stuckCampaignInterval);
    };
  }, [fetchCampaigns, resumeStuckCampaigns]);

  return {
    campaigns,
    loading,
    refetch: fetchCampaigns,
    resumeStuckCampaigns
  };
};