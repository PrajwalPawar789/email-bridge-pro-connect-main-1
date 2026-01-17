import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  Send,
  Eye,
  Trash2,
  Clock,
  Play,
  Pause,
  RotateCcw,
  BarChart2,
  Plus,
  Users,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Sparkles,
  Activity,
  MessageSquare,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useCampaignSender } from '@/hooks/useCampaignSender';
import { useRealtimeCampaigns } from '@/hooks/useRealtimeCampaigns';
import { useCampaignManager } from '@/hooks/useCampaignManager';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FollowUpStatusDialog from './FollowUpStatusDialog';

interface CampaignListProps {
  onCreateCampaign?: () => void;
}

const CampaignList = ({ onCreateCampaign }: CampaignListProps) => {
  const navigate = useNavigate();
  const { campaigns, loading, refetch, resumeStuckCampaigns } = useRealtimeCampaigns();
  const { startSending, isSending } = useCampaignSender();
  const { restartCampaign, pauseCampaign, isManaging } = useCampaignManager();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
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

  const getActualTrackingStats = (campaign: any) => {
    const recipients = campaign.recipients || [];
    const totalFromCampaign = campaign.total_recipients || 0;
    const isPartial = totalFromCampaign > 0 && recipients.length < totalFromCampaign;
    const actualOpens = isPartial
      ? (campaign.opened_count ?? 0)
      : recipients.filter((r: any) => r.opened_at).length;
    const actualClicks = isPartial
      ? (campaign.clicked_count ?? 0)
      : recipients.filter((r: any) => r.clicked_at).length;
    
    return {
      dbOpens: campaign.opened_count ?? 0,
      dbClicks: campaign.clicked_count ?? 0,
      actualOpens,
      actualClicks,
      isPartial
    };
  };

  const isSentRecipient = (recipient: any) => {
    if (recipient.last_email_sent_at) return true;
    return ['sent', 'opened', 'clicked', 'replied', 'bounced', 'completed'].includes(recipient.status);
  };

  const getRecipientStats = (recipients: any[], campaign?: any) => {
    const totalFromCampaign = campaign?.total_recipients || 0;
    const hasRecipients = recipients && recipients.length > 0;
    const isPartial = hasRecipients && totalFromCampaign > recipients.length;

    if (!hasRecipients) {
      const total = totalFromCampaign;
      const sent = campaign?.sent_count || 0;
      const failed = campaign?.failed_count || 0;
      const bounced = campaign?.bounced_count || 0;
      const replied = campaign?.replied_count || 0;
      const pending = Math.max(0, total - sent - failed);

      return { total, sent, pending, failed, bounced, replied, processing: 0, other: 0 };
    }

    const status = campaign?.status;
    const actualSent = recipients.filter(isSentRecipient).length;
    const actualFailed = recipients.filter((r: any) => r.status === 'failed').length;
    const actualPending = recipients.filter((r: any) => r.status === 'pending').length;
    const processing = recipients.filter((r: any) => r.status === 'processing').length;
    const sent = Math.max(actualSent, campaign?.sent_count || 0);
    const failed = Math.max(actualFailed, campaign?.failed_count || 0);
    const bounced = Math.max(recipients.filter((r: any) => r.bounced).length, campaign?.bounced_count || 0);
    const replied = Math.max(recipients.filter((r: any) => r.replied).length, campaign?.replied_count || 0);
    const total = isPartial ? totalFromCampaign : recipients.length;
    const pending = isPartial ? Math.max(0, total - sent - failed - processing) : actualPending;

    if (status === 'sending' || status === 'paused') {
      return {
        total,
        sent,
        pending,
        failed,
        bounced,
        replied,
        processing,
        other: isPartial
          ? 0
          : recipients.filter((r: any) => !['sent', 'pending', 'failed', 'processing'].includes(r.status)).length
      };
    }

    return {
      total,
      sent,
      pending,
      failed,
      bounced,
      replied,
      processing,
      other: isPartial
        ? 0
        : recipients.filter((r: any) => !['sent', 'pending', 'failed', 'processing'].includes(r.status)).length
    };
  };

  const getStatusMeta = (statusKey: string, label: string) => {
    switch (statusKey) {
      case 'draft':
        return { label, className: 'border-slate-200 bg-slate-100 text-slate-700' };
      case 'ready':
        return { label, className: 'border-emerald-200 bg-emerald-100 text-emerald-700' };
      case 'scheduled':
        return { label, className: 'border-sky-200 bg-sky-100 text-sky-700' };
      case 'sending':
        return { label, className: 'border-amber-200 bg-amber-100 text-amber-700' };
      case 'paused':
        return { label, className: 'border-yellow-200 bg-yellow-100 text-yellow-700' };
      case 'sent':
      case 'completed':
        return { label: 'Completed', className: 'border-emerald-200 bg-emerald-100 text-emerald-700' };
      case 'failed':
        return { label, className: 'border-rose-200 bg-rose-100 text-rose-700' };
      case 'followup':
        return { label, className: 'border-orange-200 bg-orange-100 text-orange-700' };
      default:
        return { label, className: 'border-slate-200 bg-slate-100 text-slate-700' };
    }
  };

  const campaignStyles = {
    ['--camp-bg' as any]: 'radial-gradient(circle at 15% 15%, rgba(16, 185, 129, 0.18), transparent 55%), radial-gradient(circle at 85% 10%, rgba(245, 158, 11, 0.18), transparent 52%), linear-gradient(180deg, #f7f5ef 0%, #f2f7f4 60%, #ffffff 100%)',
    ['--camp-surface' as any]: 'rgba(255, 255, 255, 0.88)',
    ['--camp-surface-strong' as any]: 'rgba(255, 255, 255, 0.96)',
    ['--camp-border' as any]: 'rgba(148, 163, 184, 0.35)',
    ['--camp-ink' as any]: '#1f2937',
    ['--camp-muted' as any]: '#64748b',
    ['--camp-accent' as any]: '#0f766e',
    ['--camp-warm' as any]: '#f59e0b',
    ['--camp-font-display' as any]: '"Sora", sans-serif',
    ['--camp-font-body' as any]: '"IBM Plex Sans", sans-serif',
    fontFamily: 'var(--camp-font-body)'
  } as React.CSSProperties;

  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'draft', label: 'Draft' },
    { value: 'ready', label: 'Ready' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'sending', label: 'Sending' },
    { value: 'paused', label: 'Paused' },
    { value: 'followup', label: 'Follow-up active' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' }
  ];

  const sortOptions = [
    { value: 'recent', label: 'Most recent' },
    { value: 'name', label: 'Name' },
    { value: 'sent', label: 'Most sent' },
    { value: 'openRate', label: 'Highest open rate' },
    { value: 'replyRate', label: 'Highest reply rate' }
  ];

  const enrichedCampaigns = useMemo(() => {
    return campaigns.map((campaign) => {
      const recipients = campaign.recipients || [];
      const stats = getRecipientStats(recipients, campaign);
      const trackingStats = getActualTrackingStats(campaign);

      const delayMinutes = campaign.send_delay_minutes || 1;
      const hasFollowups = campaign.campaign_followups && campaign.campaign_followups.length > 0;
      const totalSteps = 1 + (campaign.campaign_followups?.length || 0);

      const pendingInitial = recipients.filter((r: any) =>
        r.status === 'pending' && (r.current_step === 0 || r.current_step === null)
      ).length;

      const recipientsEligibleForFollowups = recipients.filter((r: any) => {
        const currentStep = typeof r.current_step === 'number' ? r.current_step : 0;
        return !r.replied &&
               !r.bounced &&
               r.status !== 'failed' &&
               r.status !== 'completed' &&
               currentStep < totalSteps - 1;
      }).length;

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
      let statusKey = campaign.status;
      if (isFollowUpMode) {
        displayStatus = 'Follow-up Active';
        statusKey = 'followup';
      } else if (isCompleted) {
        displayStatus = 'Completed';
        statusKey = 'completed';
      }

      const sentCount = stats.sent || 0;
      const openRate = sentCount > 0 ? (trackingStats.actualOpens / sentCount) * 100 : 0;
      const clickRate = sentCount > 0 ? (trackingStats.actualClicks / sentCount) * 100 : 0;
      const replyRate = sentCount > 0 ? (stats.replied / sentCount) * 100 : 0;
      const bounceRate = sentCount > 0 ? (stats.bounced / sentCount) * 100 : 0;
      const sentRate = stats.total > 0 ? Math.min(100, Math.round((stats.sent / stats.total) * 100)) : 0;

      const trackingMismatch = !trackingStats.isPartial &&
        (trackingStats.dbOpens !== trackingStats.actualOpens ||
        trackingStats.dbClicks !== trackingStats.actualClicks);

      return {
        campaign,
        stats,
        trackingStats,
        delayMinutes,
        hasFollowups,
        totalSteps,
        recipientsEligibleForFollowups,
        isFollowUpMode,
        isCompleted,
        displayStatus,
        statusKey,
        openRate,
        clickRate,
        replyRate,
        bounceRate,
        sentRate,
        trackingMismatch
      };
    });
  }, [campaigns]);

  const summaryStats = useMemo(() => {
    const totalCampaigns = enrichedCampaigns.length;
    const activeCampaigns = enrichedCampaigns.filter((item) =>
      ['sending', 'paused', 'scheduled', 'ready', 'followup'].includes(item.statusKey)
    ).length;
    const draftCampaigns = enrichedCampaigns.filter((item) => item.statusKey === 'draft').length;
    const pausedCampaigns = enrichedCampaigns.filter((item) => item.statusKey === 'paused').length;

    const totalRecipients = enrichedCampaigns.reduce((sum, item) => sum + (item.stats.total || 0), 0);
    const totalSent = enrichedCampaigns.reduce((sum, item) => sum + (item.stats.sent || 0), 0);
    const totalOpens = enrichedCampaigns.reduce((sum, item) => sum + (item.trackingStats.actualOpens || 0), 0);
    const totalReplies = enrichedCampaigns.reduce((sum, item) => sum + (item.stats.replied || 0), 0);

    const openRate = totalSent > 0 ? (totalOpens / totalSent) * 100 : 0;
    const replyRate = totalSent > 0 ? (totalReplies / totalSent) * 100 : 0;

    return {
      totalCampaigns,
      activeCampaigns,
      draftCampaigns,
      pausedCampaigns,
      totalRecipients,
      totalSent,
      totalOpens,
      totalReplies,
      openRate,
      replyRate
    };
  }, [enrichedCampaigns]);

  const summaryCards = [
    {
      label: 'Total campaigns',
      value: summaryStats.totalCampaigns,
      helper: `${summaryStats.draftCampaigns} drafts`,
      icon: Send,
      tone: 'bg-emerald-100/80 text-emerald-700'
    },
    {
      label: 'Active runs',
      value: summaryStats.activeCampaigns,
      helper: `${summaryStats.pausedCampaigns} paused`,
      icon: Activity,
      tone: 'bg-amber-100/80 text-amber-700'
    },
    {
      label: 'Recipients',
      value: summaryStats.totalRecipients,
      helper: `${summaryStats.totalSent} sent`,
      icon: Users,
      tone: 'bg-sky-100/80 text-sky-700'
    },
    {
      label: 'Open rate',
      value: `${summaryStats.openRate.toFixed(1)}%`,
      helper: `${summaryStats.totalOpens} opens`,
      icon: Eye,
      tone: 'bg-teal-100/80 text-teal-700'
    },
    {
      label: 'Reply rate',
      value: `${summaryStats.replyRate.toFixed(1)}%`,
      helper: `${summaryStats.totalReplies} replies`,
      icon: MessageSquare,
      tone: 'bg-rose-100/80 text-rose-700'
    }
  ];

  const filteredCampaigns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = enrichedCampaigns.filter((item) => {
      const name = item.campaign.name?.toLowerCase() || '';
      const subject = item.campaign.subject?.toLowerCase() || '';
      const id = item.campaign.id?.toLowerCase() || '';
      const matchesQuery = !query || name.includes(query) || subject.includes(query) || id.includes(query);

      if (statusFilter === 'all') return matchesQuery;
      if (statusFilter === 'active') {
        return matchesQuery && ['sending', 'paused', 'scheduled', 'ready', 'followup'].includes(item.statusKey);
      }
      if (statusFilter === 'completed') {
        return matchesQuery && ['sent', 'completed'].includes(item.statusKey);
      }
      return matchesQuery && item.statusKey === statusFilter;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        return (a.campaign.name || '').localeCompare(b.campaign.name || '');
      }
      if (sortBy === 'sent') {
        return (b.stats.sent || 0) - (a.stats.sent || 0);
      }
      if (sortBy === 'openRate') {
        return b.openRate - a.openRate;
      }
      if (sortBy === 'replyRate') {
        return b.replyRate - a.replyRate;
      }

      const aDate = new Date(a.campaign.updated_at || a.campaign.created_at || 0).getTime();
      const bDate = new Date(b.campaign.updated_at || b.campaign.created_at || 0).getTime();
      return bDate - aDate;
    });

    return sorted;
  }, [enrichedCampaigns, searchQuery, statusFilter, sortBy]);

  const hasActiveFilters = searchQuery.trim().length > 0 || statusFilter !== 'all' || sortBy !== 'recent';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-slate-200"></div>
          <div className="absolute inset-0 rounded-full border-2 border-t-emerald-500 animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative -my-8 min-h-[calc(100vh-4rem)] bg-[var(--camp-bg)] text-[var(--camp-ink)]"
      style={campaignStyles}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap');
        @keyframes camp-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes camp-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .camp-rise { animation: camp-rise 0.6s ease-out both; }
        .camp-float { animation: camp-float 8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .camp-rise, .camp-float { animation: none; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl camp-float"></div>
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl camp-float" style={{ animationDelay: '1.4s' }}></div>
      </div>

      <div className="relative mx-auto w-full max-w-7xl space-y-5 px-5 py-6 lg:px-8 lg:py-8">
        <section
          className="camp-rise relative overflow-hidden rounded-[28px] border border-[var(--camp-border)] bg-[var(--camp-surface-strong)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
          style={{ animationDelay: '0ms' }}
        >
          <div className="absolute -right-28 -top-32 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl"></div>
          <div className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-amber-200/40 blur-3xl"></div>
          <div className="relative z-10 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--camp-muted)]">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[var(--camp-accent)] shadow-[0_0_12px_rgba(15,118,110,0.6)]"></span>
                    Live sync
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-medium tracking-[0.2em] text-[var(--camp-muted)]">
                    <Sparkles className="h-3 w-3" />
                    Campaigns workspace
                  </span>
                  <Badge
                    variant="outline"
                    className="h-6 rounded-full border-[var(--camp-border)] bg-white/70 px-3 text-[10px] font-semibold text-[var(--camp-ink)]"
                  >
                    {filteredCampaigns.length} shown
                  </Badge>
                </div>
                <h2 className="text-3xl font-semibold text-[var(--camp-ink)] md:text-4xl" style={{ fontFamily: 'var(--camp-font-display)' }}>
                  Campaign Mission Control
                </h2>
                <p className="max-w-xl text-sm text-[var(--camp-muted)]">
                  Plan, launch, and monitor every outreach wave with accurate delivery and engagement signals.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 lg:max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--camp-muted)]" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by name, subject, or ID"
                    className="h-10 rounded-full border border-[var(--camp-border)] bg-white/80 pl-9 text-xs font-semibold text-[var(--camp-ink)] placeholder:text-[var(--camp-muted)]"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10 rounded-full border border-[var(--camp-border)] bg-white/80 text-xs font-semibold text-[var(--camp-ink)]">
                      <SlidersHorizontal className="h-4 w-4 mr-2 text-[var(--camp-muted)]" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-10 rounded-full border border-[var(--camp-border)] bg-white/80 text-xs font-semibold text-[var(--camp-ink)]">
                      <ArrowUpDown className="h-4 w-4 mr-2 text-[var(--camp-muted)]" />
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {campaigns.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        onClick={resumeStuckCampaigns}
                        className="h-9 rounded-full border-[var(--camp-border)] bg-white/80 text-xs font-semibold text-[var(--camp-ink)]"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Resume stuck
                      </Button>
                      <Button
                        variant="outline"
                        onClick={refetch}
                        className="h-9 rounded-full border-[var(--camp-border)] bg-white/80 text-xs font-semibold text-[var(--camp-ink)]"
                      >
                        Refresh stats
                      </Button>
                    </>
                  )}
                  <Button
                    onClick={onCreateCampaign}
                    className="h-9 rounded-full bg-[var(--camp-ink)] text-xs font-semibold text-white hover:bg-black/90"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create campaign
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {summaryCards.map((stat, index) => (
                <div
                  key={stat.label}
                  className="camp-rise rounded-2xl border border-[var(--camp-border)] bg-white/80 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.06)]"
                  style={{ animationDelay: `${120 + index * 70}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--camp-muted)]">
                      {stat.label}
                    </p>
                    <div className={`rounded-xl p-2 ${stat.tone}`}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--camp-ink)]" style={{ fontFamily: 'var(--camp-font-display)' }}>
                    {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                  </div>
                  <p className="text-xs text-[var(--camp-muted)]">{stat.helper}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      <section className="space-y-4">
        {filteredCampaigns.length === 0 ? (
          <div className="camp-rise rounded-[26px] border border-[var(--camp-border)] bg-white/90 p-10 text-center shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--camp-ink)] text-white shadow-[0_12px_24px_rgba(15,23,42,0.2)]">
              <Send className="h-6 w-6" />
            </div>
            <h3
              className="mt-4 text-xl font-semibold text-[var(--camp-ink)]"
              style={{ fontFamily: 'var(--camp-font-display)' }}
            >
              {campaigns.length === 0 ? 'Launch your first campaign' : 'No campaigns match your filters'}
            </h3>
            <p className="mt-2 text-sm text-[var(--camp-muted)]">
              {campaigns.length === 0
                ? 'Create a campaign to start sending and tracking engagement.'
                : 'Try adjusting your search, status, or sort settings.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {campaigns.length === 0 ? (
                <Button
                  onClick={onCreateCampaign}
                  className="h-9 rounded-full bg-[var(--camp-ink)] text-xs font-semibold text-white hover:bg-black/90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create campaign
                </Button>
              ) : (
                <>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchQuery('');
                        setStatusFilter('all');
                        setSortBy('recent');
                      }}
                      className="h-9 rounded-full border-[var(--camp-border)] bg-white/80 text-xs font-semibold text-[var(--camp-ink)]"
                    >
                      Reset filters
                    </Button>
                  )}
                  <Button
                    onClick={onCreateCampaign}
                    className="h-9 rounded-full bg-[var(--camp-ink)] text-xs font-semibold text-white hover:bg-black/90"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create campaign
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredCampaigns.map((item, index) => {
              const {
                campaign,
                stats,
                trackingStats,
                delayMinutes,
                hasFollowups,
                totalSteps,
                recipientsEligibleForFollowups,
                isFollowUpMode,
                displayStatus,
                statusKey,
                openRate,
                clickRate,
                replyRate,
                bounceRate,
                sentRate,
                trackingMismatch
              } = item;

              const statusLabel = displayStatus
                ? displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)
                : 'Unknown';
              const statusMeta = getStatusMeta(statusKey, statusLabel);
              const createdAt = campaign.created_at ? new Date(campaign.created_at) : null;
              const updatedAt = campaign.updated_at ? new Date(campaign.updated_at) : null;
              const lastActivity = updatedAt || createdAt;
              const scheduledAt = campaign.scheduled_at ? new Date(campaign.scheduled_at) : null;
              const showSchedule = campaign.status === 'scheduled' && scheduledAt;
              const FailureIcon = stats.failed > 0 ? AlertTriangle : CheckCircle2;

              return (
                <div
                  key={campaign.id}
                  className="camp-rise group rounded-[26px] border border-[var(--camp-border)] bg-[var(--camp-surface)] p-5 shadow-[0_16px_32px_rgba(15,23,42,0.08)]"
                  style={{ animationDelay: `${160 + index * 60}ms` }}
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`h-6 rounded-full border px-3 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusMeta.className}`}
                          >
                            {statusMeta.label}
                          </Badge>
                          {isFollowUpMode && (
                            <Badge
                              variant="outline"
                              className="h-6 rounded-full border-orange-200 bg-orange-50 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-700"
                            >
                              Follow-ups running
                            </Badge>
                          )}
                          {showSchedule && scheduledAt && (
                            <span className="text-[11px] font-semibold text-[var(--camp-muted)]">
                              Scheduled {format(scheduledAt, 'MMM d, yyyy h:mm a')}
                            </span>
                          )}
                        </div>
                        <h3
                          className="text-xl font-semibold text-[var(--camp-ink)]"
                          style={{ fontFamily: 'var(--camp-font-display)' }}
                        >
                          {campaign.name || 'Untitled campaign'}
                        </h3>
                        <p className="text-sm text-[var(--camp-muted)]">
                          {campaign.subject || 'No subject'}
                        </p>
                        <p className="text-[11px] text-[var(--camp-muted)]">ID: {campaign.id}</p>
                      </div>

                      <div className="min-w-[200px] rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3 text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                          Sent rate
                        </p>
                        <div
                          className="mt-1 text-2xl font-semibold text-[var(--camp-ink)]"
                          style={{ fontFamily: 'var(--camp-font-display)' }}
                        >
                          {sentRate}%
                        </div>
                        <p className="text-xs text-[var(--camp-muted)]">
                          {stats.sent.toLocaleString()} sent of {stats.total.toLocaleString()}
                        </p>
                        <div className="mt-2 h-2 w-full rounded-full bg-slate-200/70">
                          <div
                            className="h-full rounded-full bg-[var(--camp-accent)]"
                            style={{ width: `${sentRate}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                            Recipients
                          </p>
                          <Users className="h-4 w-4 text-[var(--camp-muted)]" />
                        </div>
                        <p className="mt-1 text-lg font-semibold text-[var(--camp-ink)]">
                          {stats.total.toLocaleString()}
                        </p>
                        <p className="text-xs text-[var(--camp-muted)]">
                          {stats.sent.toLocaleString()} sent, {stats.pending} pending
                          {stats.processing > 0 ? `, ${stats.processing} processing` : ''}
                          {stats.other > 0 ? `, ${stats.other} other` : ''}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                            Opens
                          </p>
                          <Eye className="h-4 w-4 text-[var(--camp-muted)]" />
                        </div>
                        <p className="mt-1 text-lg font-semibold text-[var(--camp-ink)]">
                          {openRate.toFixed(1)}%
                        </p>
                        <p className="text-xs text-[var(--camp-muted)]">
                          {trackingStats.actualOpens} opens, {trackingStats.actualClicks} clicks ({clickRate.toFixed(1)}%)
                        </p>
                      </div>

                      <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                            Replies
                          </p>
                          <MessageSquare className="h-4 w-4 text-[var(--camp-muted)]" />
                        </div>
                        <p className="mt-1 text-lg font-semibold text-[var(--camp-ink)]">
                          {replyRate.toFixed(1)}%
                        </p>
                        <p className="text-xs text-[var(--camp-muted)]">
                          {stats.replied} replies, {stats.bounced} bounces ({bounceRate.toFixed(1)}% bounce)
                        </p>
                      </div>

                      <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                            Failures
                          </p>
                          <FailureIcon
                            className={`h-4 w-4 ${stats.failed > 0 ? 'text-rose-500' : 'text-emerald-500'}`}
                          />
                        </div>
                        <p className="mt-1 text-lg font-semibold text-[var(--camp-ink)]">
                          {stats.failed.toLocaleString()}
                        </p>
                        <p className="text-xs text-[var(--camp-muted)]">
                          {stats.failed > 0 ? 'Review failed sends' : 'No failures detected'}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="flex items-center gap-3 rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3">
                        <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                            {showSchedule ? 'Scheduled for' : 'Send cadence'}
                          </p>
                          <p className="text-sm font-semibold text-[var(--camp-ink)]">
                            {showSchedule && scheduledAt
                              ? format(scheduledAt, 'MMM d, yyyy h:mm a')
                              : `${delayMinutes} min delay`}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                          Follow-ups
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--camp-ink)]">
                          {hasFollowups ? `${campaign.campaign_followups?.length || 0} steps` : 'No follow-ups'}
                        </p>
                        <p className="text-xs text-[var(--camp-muted)]">
                          {hasFollowups
                            ? `${recipientsEligibleForFollowups} recipients queued, ${totalSteps} total steps`
                            : 'Add follow-ups to lift reply rate'}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                          Activity
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--camp-ink)]">
                          {lastActivity ? formatDistanceToNow(lastActivity, { addSuffix: true }) : 'Unknown'}
                        </p>
                        <p className="text-xs text-[var(--camp-muted)]">
                          Created {createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : 'Unknown'}
                        </p>
                      </div>
                    </div>

                    {trackingMismatch && (
                      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-700">
                        <AlertTriangle className="mt-0.5 h-4 w-4" />
                        <div>
                          <p className="font-semibold">Tracking sync in progress</p>
                          <p>
                            Live opens and clicks differ from DB counts. DB opens: {trackingStats.dbOpens}, DB clicks: {trackingStats.dbClicks}.
                          </p>
                        </div>
                      </div>
                    )}

                    {(campaign.bot_open_count > 0 || campaign.bot_click_count > 0) && (
                      <div className="text-xs text-[var(--camp-muted)]">
                        Bots filtered: {campaign.bot_open_count || 0} opens, {campaign.bot_click_count || 0} clicks
                      </div>
                    )}

                    {stats.failed > 0 && (
                      <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-700">
                        <AlertTriangle className="h-4 w-4" />
                        {stats.failed} email(s) failed to send.
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/campaign/${campaign.id}`)}
                        className="h-9 rounded-full border-[var(--camp-border)] bg-white/80 text-xs font-semibold text-[var(--camp-ink)]"
                      >
                        <BarChart2 className="h-4 w-4 mr-2" />
                        Track
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedCampaign(campaign);
                          setDetailsOpen(true);
                        }}
                        className="h-9 rounded-full border-[var(--camp-border)] bg-white/80 text-xs font-semibold text-[var(--camp-ink)]"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Quick view
                      </Button>

                      {hasFollowups && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedFollowUpCampaign(campaign);
                            setFollowUpDetailsOpen(true);
                          }}
                          className="h-9 rounded-full border-[var(--camp-border)] bg-white/80 text-xs font-semibold text-[var(--camp-ink)]"
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Follow-up status
                        </Button>
                      )}

                      {(campaign.status === 'draft' || campaign.status === 'ready') && (
                        <Button
                          size="sm"
                          onClick={() => startCampaign(campaign.id)}
                          disabled={isSending(campaign.id)}
                          className="h-9 rounded-full bg-[var(--camp-accent)] text-xs font-semibold text-white hover:bg-emerald-900/90 disabled:opacity-60"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          {isSending(campaign.id) ? 'Starting...' : 'Start'}
                        </Button>
                      )}

                      {(campaign.status === 'sending' || (campaign.status === 'sent' && isFollowUpMode)) && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => pauseCampaign(campaign.id)}
                            className="h-9 rounded-full border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                          >
                            <Pause className="h-4 w-4 mr-2" />
                            Pause
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestartCampaign(campaign.id)}
                            disabled={isManaging(campaign.id)}
                            className="h-9 rounded-full border-[var(--camp-border)] bg-white/80 text-xs font-semibold text-[var(--camp-ink)] disabled:opacity-60"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            {isManaging(campaign.id) ? 'Restarting...' : 'Restart'}
                          </Button>
                        </>
                      )}

                      {campaign.status === 'paused' && (
                        <Button
                          size="sm"
                          onClick={() => handleRestartCampaign(campaign.id)}
                          disabled={isManaging(campaign.id) || isSending(campaign.id)}
                          className="h-9 rounded-full bg-[var(--camp-accent)] text-xs font-semibold text-white hover:bg-emerald-900/90 disabled:opacity-60"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          {isManaging(campaign.id) || isSending(campaign.id) ? 'Starting...' : 'Resume'}
                        </Button>
                      )}

                      {campaign.status === 'failed' && stats.pending > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestartCampaign(campaign.id)}
                          disabled={isManaging(campaign.id)}
                          className="h-9 rounded-full border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          {isManaging(campaign.id) ? 'Restarting...' : 'Restart failed'}
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteCampaign(campaign.id)}
                        className="h-9 rounded-full border-rose-200 bg-white/80 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      </div>
      {/* Campaign details modal */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent
          className="max-w-2xl rounded-[28px] border border-[var(--camp-border)] bg-[var(--camp-surface-strong)] text-[var(--camp-ink)] shadow-[0_24px_48px_rgba(15,23,42,0.18)]"
          style={campaignStyles}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle
              className="text-2xl font-semibold text-[var(--camp-ink)]"
              style={{ fontFamily: 'var(--camp-font-display)' }}
            >
              {selectedCampaign?.name || 'Campaign details'}
            </DialogTitle>
            {selectedCampaign && (
              <p className="text-xs text-[var(--camp-muted)]">ID: {selectedCampaign.id}</p>
            )}
          </DialogHeader>
          {selectedCampaign && (() => {
            const stats = getRecipientStats(selectedCampaign.recipients || [], selectedCampaign);
            const trackingStats = getActualTrackingStats(selectedCampaign);
            const sentCount = stats.sent || 0;
            const openRate = sentCount > 0 ? (trackingStats.actualOpens / sentCount) * 100 : 0;
            const replyRate = sentCount > 0 ? (stats.replied / sentCount) * 100 : 0;
            const scheduledAt = selectedCampaign.scheduled_at ? new Date(selectedCampaign.scheduled_at) : null;
            const statusLabel = selectedCampaign.status
              ? selectedCampaign.status.charAt(0).toUpperCase() + selectedCampaign.status.slice(1)
              : 'Unknown';
            const statusMeta = getStatusMeta(selectedCampaign.status, statusLabel);
            const trackingMismatch = !trackingStats.isPartial && (
              (selectedCampaign.opened_count ?? 0) !== trackingStats.actualOpens ||
              (selectedCampaign.clicked_count ?? 0) !== trackingStats.actualClicks
            );

            return (
              <div className="space-y-4 text-sm">
                <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`h-6 rounded-full border px-3 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusMeta.className}`}
                    >
                      {statusMeta.label}
                    </Badge>
                    {selectedCampaign.status === 'scheduled' && scheduledAt && (
                      <span className="text-xs text-[var(--camp-muted)]">
                        Scheduled {format(scheduledAt, 'MMM d, yyyy h:mm a')}
                      </span>
                    )}
                    {selectedCampaign.campaign_followups?.length > 0 && (
                      <span className="text-xs text-[var(--camp-muted)]">
                        {selectedCampaign.campaign_followups.length} follow-up steps
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-[var(--camp-muted)]">
                    {selectedCampaign.subject || 'No subject'}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                      Recipients
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--camp-ink)]">
                      {stats.total.toLocaleString()}
                    </p>
                    <p className="text-xs text-[var(--camp-muted)]">
                      {stats.sent} sent, {stats.pending} pending
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                      Open rate
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--camp-ink)]">
                      {openRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-[var(--camp-muted)]">
                      {trackingStats.actualOpens} opens, {trackingStats.actualClicks} clicks
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                      Reply rate
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--camp-ink)]">
                      {replyRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-[var(--camp-muted)]">
                      {stats.replied} replies, {stats.bounced} bounces
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3 text-xs text-[var(--camp-muted)]">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>
                      {selectedCampaign.status === 'scheduled' && scheduledAt
                        ? `Scheduled ${format(scheduledAt, 'MMM d, yyyy h:mm a')}`
                        : `Delay ${selectedCampaign.send_delay_minutes || 1} min`}
                    </span>
                  </div>
                </div>

                {trackingMismatch && (
                  <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <div>
                      <p className="font-semibold">Tracking sync in progress</p>
                      <p>
                        DB opens: {selectedCampaign.opened_count ?? 0}, DB clicks: {selectedCampaign.clicked_count ?? 0}.
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--camp-muted)]">
                    Email body
                  </p>
                  <div className="mt-2 max-h-48 overflow-auto rounded-2xl border border-[var(--camp-border)] bg-white/80 p-3 text-xs text-[var(--camp-ink)]">
                    {selectedCampaign.body || 'No content'}
                  </div>
                </div>
              </div>
            );
          })()}
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
