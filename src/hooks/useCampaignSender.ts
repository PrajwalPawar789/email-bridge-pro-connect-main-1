import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const useCampaignSender = () => {
  const [sending, setSending] = useState<Set<string>>(new Set());

  const normalizeCampaignError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || 'Failed to start campaign');
    const lowered = message.toLowerCase();

    if (lowered.includes('approval')) {
      return 'Campaign launch is blocked until approval is granted.';
    }
    if (lowered.includes('daily send limit')) {
      return 'Daily send limit reached for this user allocation.';
    }
    if (lowered.includes('credit') || lowered.includes('quota')) {
      return message;
    }
    return message;
  };

  const resolveAuthContext = async () => {
    const authErrorMessage = 'Your session is invalid. Please sign in again.';

    const getValidUserFromToken = async (token: string) => {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        return null;
      }
      return data.user;
    };

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new Error(authErrorMessage);
    }

    const currentToken = sessionData.session?.access_token;
    if (currentToken) {
      const currentUser = await getValidUserFromToken(currentToken);
      if (currentUser) {
        return { userId: currentUser.id, accessToken: currentToken };
      }
    }

    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedToken = refreshData.session?.access_token;
    if (refreshError || !refreshedToken) {
      await supabase.auth.signOut();
      throw new Error(authErrorMessage);
    }

    const refreshedUser = await getValidUserFromToken(refreshedToken);
    if (!refreshedUser) {
      await supabase.auth.signOut();
      throw new Error(authErrorMessage);
    }

    return { userId: refreshedUser.id, accessToken: refreshedToken };
  };

  const startSending = async (campaignId: string) => {
    if (sending.has(campaignId)) {
      return;
    }

    setSending(prev => new Set(prev).add(campaignId));
    let currentUserId: string | null = null;

    try {
      const { userId, accessToken } = await resolveAuthContext();
      currentUserId = userId;

      // Update campaign status to sending
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', campaignId)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // Call the new batch edge function to start sending emails
      const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
        body: { campaignId, batchSize: 3 },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
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

    } catch (error: unknown) {
      const message = normalizeCampaignError(error);
      console.error('Error starting campaign:', error);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });

      // Revert status on error
      if (currentUserId) {
        await supabase
          .from('campaigns')
          .update({ status: 'ready' })
          .eq('id', campaignId)
          .eq('user_id', currentUserId);
      }
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
