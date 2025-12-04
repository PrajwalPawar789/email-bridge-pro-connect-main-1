import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Eye, Edit, Trash2, Clock, Play, Pause, RotateCcw, BarChart2, Plus, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useCampaignSender } from '@/hooks/useCampaignSender';
import { useRealtimeCampaigns } from '@/hooks/useRealtimeCampaigns';
import { useCampaignManager } from '@/hooks/useCampaignManager';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CampaignStatusBar from './CampaignStatusBar';
import FollowUpStatusDialog from './FollowUpStatusDialog';

interface CampaignListProps {
  onCreateCampaign?: () => void;
}

const CampaignList = ({ onCreateCampaign }: CampaignListProps) => {
  const navigate = useNavigate();
  const { campaigns, loading, refetch, resumeStuckCampaigns } = useRealtimeCampaigns();
  const { startSending, isSending } = useCampaignSender();
  const { restartCampaign, pauseCampaign, isManaging } = useCampaignManager();
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [followUpDetailsOpen, setFollowUpDetailsOpen] = useState(false);
  const [selectedFollowUpCampaign, setSelectedFollowUpCampaign] = useState<any>(null);

  const startCampaign = async (campaignId: string) => {
    try {
      await startSending(campaignId);
      await refetch();
    } catch (error: any) {
      console.error('Error starting campaign:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Use the enhanced restart functionality from the hook
  const handleRestartCampaign = async (campaignId: string) => {
    await restartCampaign(campaignId);
    await refetch();
  };


  const deleteCampaign = async (campaignId: string) => {
    try {
      // Delete recipients first (due to foreign key constraint)
      await supabase
        .from('recipients')
        .delete()
        .eq('campaign_id', campaignId);

      // Then delete the campaign
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Campaign deleted successfully.",
      });

      await refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string, isFollowUpMode: boolean = false, isCompleted: boolean = false) => {
    if (isFollowUpMode) return 'bg-purple-500';
    if (isCompleted) return 'bg-green-600';
    switch (status) {
      case 'draft': return 'bg-gray-500';
      case 'ready': return 'bg-blue-500';
      case 'scheduled': return 'bg-indigo-500';
      case 'sending': return 'bg-orange-500';
      case 'paused': return 'bg-yellow-500';
      case 'sent': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getActualTrackingStats = (campaign: any) => {
    const recipients = campaign.recipients || [];
    const actualOpens = recipients.filter((r: any) => r.opened_at).length;
    const actualClicks = recipients.filter((r: any) => r.clicked_at).length;
    
    return {
      dbOpens: campaign.opened_count ?? 0,
      dbClicks: campaign.clicked_count ?? 0,
      actualOpens,
      actualClicks
    };
  };

  const getRecipientStats = (recipients: any[]) => {
    if (!recipients) return { total: 0, sent: 0, pending: 0, failed: 0, bounced: 0, replied: 0, processing: 0, other: 0 };
    
    return {
      total: recipients.length,
      sent: recipients.filter(r => r.status === 'sent').length,
      pending: recipients.filter(r => r.status === 'pending').length,
      failed: recipients.filter(r => r.status === 'failed').length,
      bounced: recipients.filter(r => r.bounced).length,
      replied: recipients.filter(r => r.replied).length,
      processing: recipients.filter(r => r.status === 'processing').length,
      other: recipients.filter(r => !['sent', 'pending', 'failed', 'processing'].includes(r.status)).length
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Campaigns</h2>
        <div className="flex gap-2">
          {campaigns.length > 0 && (
            <>
              <Button variant="outline" onClick={resumeStuckCampaigns}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Resume Stuck
              </Button>
              <Button variant="outline" onClick={refetch}>
                Refresh Stats
              </Button>
            </>
          )}
          <Button 
            onClick={onCreateCampaign} 
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create campaign
          </Button>
        </div>
      </div>

      {/* Real-time campaign status bar */}
      {campaigns.length > 0 && (
        <CampaignStatusBar campaigns={campaigns} onResumeStuck={resumeStuckCampaigns} />
      )}

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
          <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-blue-500 rounded-3xl flex items-center justify-center mb-6 shadow-lg relative">
            <Send className="h-10 w-10 text-white relative z-10" />
            <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-1 shadow-sm">
              <Users className="h-4 w-4 text-gray-400" />
            </div>
          </div>
          
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Send your first email campaign
          </h3>
          <p className="text-gray-500 max-w-md mb-8">
            Send beautiful emails to the right audience. Get opens, clicks, and sales.
          </p>
          
          <Button 
            variant="outline" 
            onClick={onCreateCampaign}
            className="font-medium"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create campaign
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((campaign: any) => {
            const stats = getRecipientStats(campaign.recipients);
            const delayMinutes = campaign.send_delay_minutes || 1;
            const trackingStats = getActualTrackingStats(campaign);
            
            // Check for Follow-up Mode
            const hasFollowups = campaign.campaign_followups && campaign.campaign_followups.length > 0;
            const recipients = campaign.recipients || [];
            // A campaign is in "Follow-up Mode" if:
            // 1. It has follow-up steps configured
            // 2. It's not in draft or failed state
            // 3. All recipients have received the initial email (current_step >= 0 or status is 'sent'/'bounced'/'replied')
            // 4. There are still active recipients (not replied, not bounced) who haven't finished all steps
            
            const pendingInitial = recipients.filter((r: any) => 
              r.status === 'pending' && (r.current_step === 0 || r.current_step === null)
            ).length;

            // Determine how many total steps exist (initial step 0 + configured followups)
            const totalSteps = 1 + (campaign.campaign_followups?.length || 0);

            // Count recipients that are still eligible for follow-ups:
            // - Not replied
            // - Not bounced
            // - Not failed (failed emails stop the sequence)
            // - Have not completed all steps (current_step < totalSteps - 1)
            // Note: current_step is 0-indexed. If totalSteps is 2 (0 and 1), and current_step is 1, they are done.
            const recipientsEligibleForFollowups = recipients.filter((r: any) => {
              const currentStep = typeof r.current_step === 'number' ? r.current_step : 0;
              return !r.replied && 
                     !r.bounced && 
                     r.status !== 'failed' && 
                     r.status !== 'completed' &&
                     currentStep < totalSteps - 1;
            }).length;

            // Follow-up mode should only be shown when there are configured follow-ups,
            // the campaign isn't draft/failed, initial batch is done, and there remain
            // recipients eligible to receive follow-up emails.
            const isFollowUpMode = hasFollowups &&
                                  campaign.status !== 'draft' &&
                                  campaign.status !== 'failed' &&
                                  pendingInitial === 0 &&
                                  recipients.length > 0 &&
                                  recipientsEligibleForFollowups > 0;

            const isCompleted = hasFollowups &&
                                campaign.status !== 'draft' &&
                                campaign.status !== 'failed' &&
                                pendingInitial === 0 &&
                                recipients.length > 0 &&
                                recipientsEligibleForFollowups === 0;

            let displayStatus = campaign.status;
            if (isFollowUpMode) {
              displayStatus = 'Follow-up Active';
            } else if (isCompleted) {
              displayStatus = 'Completed';
            }

            return (
              <Card key={campaign.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{campaign.name}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">{campaign.subject}</p>
                    </div>
                    <Badge className={getStatusColor(campaign.status, isFollowUpMode, isCompleted)}>
                      {displayStatus}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600">Recipients</p>
                      <p className="text-sm font-medium">{stats.total}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600">Sent / Pending</p>
                      <p className="text-sm font-medium">
                        {stats.sent} / {stats.pending}
                        {stats.processing > 0 && <span className="text-orange-500 text-xs ml-1">({stats.processing} proc)</span>}
                        {stats.other > 0 && <span className="text-gray-400 text-xs ml-1">({stats.other} other)</span>}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600">Failed</p>
                      <p className="text-sm font-medium">{stats.failed}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {campaign.status === 'scheduled' ? 'Scheduled For' : 'Delay'}
                      </p>
                      <p className="text-sm font-medium">
                        {campaign.status === 'scheduled' && campaign.scheduled_at
                          ? new Date(campaign.scheduled_at).toLocaleString()
                          : `${delayMinutes} min`}
                      </p>
                      {hasFollowups && (
                        <p className="text-xs text-purple-600">
                          {campaign.campaign_followups.length} follow-up(s)
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600">Opens / Clicks</p>
                      <p className="text-sm font-medium">
                        {trackingStats.actualOpens} / {trackingStats.actualClicks}
                      </p>
                      {(trackingStats.dbOpens !== trackingStats.actualOpens || trackingStats.dbClicks !== trackingStats.actualClicks) && (
                        <p className="text-xs text-orange-600">
                          DB: {trackingStats.dbOpens}/{trackingStats.dbClicks} (syncing...)
                        </p>
                      )}
                      <div className="flex flex-col gap-1 mt-1">
                        <div className="flex gap-2">
                          <p className="text-xs text-red-500">Bounces: {stats.bounced}</p>
                          <p className="text-xs text-indigo-500">Replies: {stats.replied}</p>
                        </div>
                        {(campaign.bot_open_count > 0 || campaign.bot_click_count > 0) && (
                          <p className="text-xs text-gray-500" title="Detected bot activity filtered from main stats">
                            🤖 Bots: {campaign.bot_open_count || 0} opens, {campaign.bot_click_count || 0} clicks
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/campaign/${campaign.id}`)}
                    >
                      <BarChart2 className="h-4 w-4 mr-1" />
                      Track
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setSelectedCampaign(campaign); setDetailsOpen(true); }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Quick View
                    </Button>

                    {hasFollowups && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setSelectedFollowUpCampaign(campaign); setFollowUpDetailsOpen(true); }}
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        Follow-up Status
                      </Button>
                    )}

                    {(campaign.status === 'draft' || campaign.status === 'ready') && (
                      <>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={() => startCampaign(campaign.id)}
                          disabled={isSending(campaign.id)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          {isSending(campaign.id) ? 'Starting...' : 'Start'}
                        </Button>
                      </>
                    )}
                    
                    {(campaign.status === 'sending' || (campaign.status === 'sent' && isFollowUpMode)) && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => pauseCampaign(campaign.id)}
                        >
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => handleRestartCampaign(campaign.id)}
                          disabled={isManaging(campaign.id)}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          {isManaging(campaign.id) ? 'Restarting...' : 'Restart'}
                        </Button>
                      </>
                    )}
                    
                    {campaign.status === 'paused' && (
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={() => handleRestartCampaign(campaign.id)}
                        disabled={isManaging(campaign.id) || isSending(campaign.id)}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        {isManaging(campaign.id) || isSending(campaign.id) ? 'Starting...' : 'Resume'}
                      </Button>
                    )}

                    
                    {(campaign.status === 'failed' && getRecipientStats(campaign.recipients).pending > 0) && (
                      <Button 
                        variant="secondary" 
                        size="sm"
                        onClick={() => handleRestartCampaign(campaign.id)}
                        disabled={isManaging(campaign.id)}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        {isManaging(campaign.id) ? 'Restarting...' : 'Restart Failed'}
                      </Button>
                    )}

                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => deleteCampaign(campaign.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>

                  {stats.failed > 0 && (
                    <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                      {stats.failed} email(s) failed to send
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {/* Campaign details modal */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedCampaign?.name} - Campaign Details
            </DialogTitle>
          </DialogHeader>
          {selectedCampaign && (
            <div className="space-y-2">
              <div><strong>Subject:</strong> {selectedCampaign.subject}</div>
              <div><strong>Status:</strong> {selectedCampaign.status}</div>
              <div><strong>Total Recipients:</strong> {selectedCampaign.recipients?.length}</div>
              
              {/* Enhanced tracking details */}
              <div className="bg-blue-50 p-3 rounded">
                <div className="font-medium text-blue-900 mb-2">Tracking Statistics</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Actual Opens: {selectedCampaign.recipients?.filter((r: any) => r.opened_at).length}</div>
                  <div>Actual Clicks: {selectedCampaign.recipients?.filter((r: any) => r.clicked_at).length}</div>
                  <div>DB Opens: {selectedCampaign.opened_count ?? 0}</div>
                  <div>DB Clicks: {selectedCampaign.clicked_count ?? 0}</div>
                </div>
              </div>
              
              <div><strong>Bounce Count:</strong> {selectedCampaign.recipients?.filter((r: any) => r.bounced).length ?? 0}</div>
              <div>
                <strong>Email Body:</strong>
                <div className="bg-gray-50 p-2 rounded mt-1 text-sm max-h-40 overflow-auto">
                  {selectedCampaign.body}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FollowUpStatusDialog 
        open={followUpDetailsOpen} 
        onOpenChange={setFollowUpDetailsOpen} 
        campaign={selectedFollowUpCampaign} 
      />
    </div>
  );
};

export default CampaignList;
