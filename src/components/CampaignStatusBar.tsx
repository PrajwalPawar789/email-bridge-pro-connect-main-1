import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, Play, Pause, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface CampaignStatusBarProps {
  campaigns: any[];
  onResumeStuck: () => void;
}

const CampaignStatusBar: React.FC<CampaignStatusBarProps> = ({ campaigns, onResumeStuck }) => {
  const activeCampaigns = campaigns.filter(c => 
    ['sending', 'paused'].includes(c.status)
  );
  
  const sendingCampaigns = campaigns.filter(c => c.status === 'sending');
  const pausedCampaigns = campaigns.filter(c => c.status === 'paused');
  const completedCampaigns = campaigns.filter(c => c.status === 'sent');
  
  if (activeCampaigns.length === 0) {
    return null;
  }

  const getProgressPercentage = (campaign: any) => {
    const recipients = campaign.recipients || [];
    const total = recipients.length;
    const sent = recipients.filter((r: any) => r.status === 'sent').length;
    return total > 0 ? Math.round((sent / total) * 100) : 0;
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-600" />
            <span className="font-medium text-blue-900">Campaign Status</span>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            {sendingCampaigns.length > 0 && (
              <div className="flex items-center gap-1">
                <Play className="h-3 w-3 text-green-600" />
                <span className="text-green-700">{sendingCampaigns.length} Sending</span>
              </div>
            )}
            
            {pausedCampaigns.length > 0 && (
              <div className="flex items-center gap-1">
                <Pause className="h-3 w-3 text-yellow-600" />
                <span className="text-yellow-700">{pausedCampaigns.length} Paused</span>
              </div>
            )}
            
            {completedCampaigns.length > 0 && (
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-blue-600" />
                <span className="text-blue-700">{completedCampaigns.length} Completed</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onResumeStuck}
          >
            <AlertCircle className="h-3 w-3 mr-1" />
            Check Stuck
          </Button>
        </div>
      </div>
      
      {/* Active campaign details */}
      {activeCampaigns.length > 0 && (
        <div className="mt-3 space-y-2">
          {activeCampaigns.slice(0, 3).map((campaign: any) => {
            const progress = getProgressPercentage(campaign);
            const recipients = campaign.recipients || [];
            const sent = recipients.filter((r: any) => r.status === 'sent').length;
            const total = recipients.length;
            
            return (
              <div key={campaign.id} className="flex items-center justify-between bg-white rounded p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={campaign.status === 'sending' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {campaign.status}
                  </Badge>
                  <span className="font-medium">{campaign.name}</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-xs text-gray-600">
                    {sent}/{total} sent ({progress}%)
                  </div>
                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {campaign.status === 'sending' && (
                    <Clock className="h-3 w-3 text-green-600 animate-pulse" />
                  )}
                </div>
              </div>
            );
          })}
          
          {activeCampaigns.length > 3 && (
            <div className="text-xs text-gray-500 text-center">
              +{activeCampaigns.length - 3} more campaigns
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CampaignStatusBar;