import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const useCampaignManager = () => {
  const [managingCampaigns, setManagingCampaigns] = useState<Set<string>>(new Set());

  const restartCampaign = useCallback(async (campaignId: string) => {
    if (managingCampaigns.has(campaignId)) {
      return;
    }

    setManagingCampaigns(prev => new Set(prev).add(campaignId));

    try {
      console.log(`Manual restart initiated for campaign: ${campaignId}`);
      
      // First fix statistics
      const { error: fixError } = await supabase.rpc('fix_campaign_statistics');
      if (fixError) {
        console.error('Error fixing statistics:', fixError);
      }
      
      // Auto restart failed campaigns
      const { error: restartError } = await supabase.rpc('auto_restart_failed_campaigns');
      if (restartError) {
        console.error('Error auto-restarting failed campaigns:', restartError);
      }
      
      // Force restart this specific campaign using new batch system
      // Process batches automatically until all emails are sent
      let batchNumber = 1;
      let hasMore = true;
      
      while (hasMore) {
        console.log(`Processing batch ${batchNumber} for campaign: ${campaignId}`);
        
        const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
          body: { campaignId, batchSize: 3 }
        });

        if (error) {
          console.error('Edge function error:', error);
          throw new Error(error.message || 'Failed to restart campaign');
        }

        console.log(`Batch ${batchNumber} response:`, data);
        
        // Check if there are more batches to process
        hasMore = data?.hasMore ?? false;
        
        if (hasMore) {
          // Wait 1 minute before next batch (respecting send_delay_minutes)
          console.log('Waiting 1 minute before next batch...');
          await new Promise(resolve => setTimeout(resolve, 60 * 1000));
          batchNumber++;
        }
      }
      
      toast({
        title: "Success",
        description: "Campaign has been completed successfully. All emails sent!",
      });

    } catch (error: any) {
      console.error('Error restarting campaign:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to restart campaign",
        variant: "destructive",
      });
    } finally {
      setManagingCampaigns(prev => {
        const newSet = new Set(prev);
        newSet.delete(campaignId);
        return newSet;
      });
    }
  }, [managingCampaigns]);

  const pauseCampaign = useCallback(async (campaignId: string) => {
    if (managingCampaigns.has(campaignId)) {
      return;
    }

    setManagingCampaigns(prev => new Set(prev).add(campaignId));

    try {
      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'paused' })
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Campaign has been paused.",
      });

    } catch (error: any) {
      console.error('Error pausing campaign:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to pause campaign",
        variant: "destructive",
      });
    } finally {
      setManagingCampaigns(prev => {
        const newSet = new Set(prev);
        newSet.delete(campaignId);
        return newSet;
      });
    }
  }, [managingCampaigns]);

  return {
    restartCampaign,
    pauseCampaign,
    isManaging: (campaignId: string) => managingCampaigns.has(campaignId)
  };
};