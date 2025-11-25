import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const useCampaignSender = () => {
  const [sending, setSending] = useState<Set<string>>(new Set());

  const startSending = async (campaignId: string) => {
    if (sending.has(campaignId)) {
      return;
    }

    setSending(prev => new Set(prev).add(campaignId));

    try {
      // Update campaign status to sending
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', campaignId);

      if (updateError) throw updateError;

      // Call the new batch edge function to start sending emails
      const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
        body: { campaignId, batchSize: 3 }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to start campaign');
      }

      console.log('Campaign started successfully:', data);
      
      toast({
        title: "Success",
        description: "Campaign emails are being sent with configured delays.",
      });

    } catch (error: any) {
      console.error('Error starting campaign:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to start sending campaign",
        variant: "destructive",
      });

      // Revert status on error
      await supabase
        .from('campaigns')
        .update({ status: 'ready' })
        .eq('id', campaignId);
    } finally {
      setSending(prev => {
        const newSet = new Set(prev);
        newSet.delete(campaignId);
        return newSet;
      });
    }
  };

  return {
    startSending,
    isSending: (campaignId: string) => sending.has(campaignId)
  };
};