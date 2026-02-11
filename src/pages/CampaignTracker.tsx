import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import { 
  ArrowLeft, Search, RefreshCw, Mail, MousePointerClick, Eye, 
  MessageSquare, AlertCircle, Clock, Calendar, 
  Users, Activity, Filter, ChevronDown, ChevronUp,
  Download, BarChart2, Lightbulb
} from 'lucide-react';
import { format, addHours, addDays, formatDistanceToNow } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, Cell, Legend
} from 'recharts';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { useAuth } from '@/providers/AuthProvider';
import PipelineBoard from '@/components/pipeline/PipelineBoard';
import { PipelineOpportunity, PipelineStage } from '@/lib/pipeline';
import { ensureDefaultPipeline, fetchOpportunities, fetchPipelineStages, updateOpportunity, deleteOpportunity } from '@/lib/pipelineStore';
import { toast } from '@/hooks/use-toast';

type TimelineFilter = 'all' | 'human' | 'bot' | 'opens' | 'clicks' | 'sent';

const CampaignTracker = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [statusFilter, setStatusFilter] = useState('all');
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<any>(null);
  const [recipientTimelineEvents, setRecipientTimelineEvents] = useState<any[]>([]);
  const [recipientTimelineLoading, setRecipientTimelineLoading] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [replies, setReplies] = useState<any[]>([]);
  const [expandedReply, setExpandedReply] = useState<string | null>(null);
  const [selectedSequenceStep, setSelectedSequenceStep] = useState<null | {
    title: string;
    stepLabel: string;
    subject: string;
    body: string;
  }>(null);
  const { user, loading: authLoading } = useAuth();
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipientPageSize, setRecipientPageSize] = useState(100);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [analyticsRecipients, setAnalyticsRecipients] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [pipelineOpportunities, setPipelineOpportunities] = useState<PipelineOpportunity[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const analyticsCacheRef = useRef<{ id?: string; total?: number }>({});
  const pageSizeOptions = [100, 500, 1000];
  const trimmedSearchTerm = searchTerm.trim();
  const normalizedSearchTerm = trimmedSearchTerm.toLowerCase();
  const hasRecipientFilters = trimmedSearchTerm.length > 0 || statusFilter !== 'all';

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, user, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'home') {
      navigate('/dashboard');
    } else if (tab === 'campaigns') {
      navigate('/campaigns');
    } else if (tab === 'inbox') {
      navigate('/inbox');
    } else if (tab === 'automations') {
      navigate('/automations');
    } else if (tab === 'pipeline') {
      navigate('/pipeline');
    } else if (
      tab === 'contacts' ||
      tab === 'segments' ||
      tab === 'templates' ||
      tab === 'connect' ||
      tab === 'settings'
    ) {
      navigate(`/dashboard?tab=${tab}`);
    } else {
      navigate(`/${tab}`);
    }
  };
  
  const [stats, setStats] = useState({
    total: 0,
    sent: 0,
    failed: 0,
    opens: 0,
    clicks: 0,
    replies: 0,
    bounces: 0,
    processing: 0,
    queued: 0,
    botOpens: 0,
    botClicks: 0
  });

  useEffect(() => {
    if (id) {
      fetchCampaignData();
      
      let debounceTimer: NodeJS.Timeout;

      // Set up realtime subscription
      const channel = supabase
        .channel('campaign-tracker')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'recipients', filter: `campaign_id=eq.${id}` },
          () => {
            // Update immediately for recipients
            fetchCampaignData(false);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'campaigns', filter: `id=eq.${id}` },
          () => {
            // Update campaign data immediately
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              fetchCampaignData(false);
            }, 500);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        clearTimeout(debounceTimer);
      };
    }
  }, [id, recipientPage, recipientPageSize]);

  useEffect(() => {
    if (activeTab === 'replies' || activeTab === 'pipeline') {
      fetchReplies();
    }
  }, [activeTab, id]);

  useEffect(() => {
    if (activeTab === 'pipeline') {
      fetchPipelineData();
    }
  }, [activeTab, id, user]);

  useEffect(() => {
    if (activeTab === 'overview' || activeTab === 'analytics') {
      fetchAnalyticsRecipients();
    }
  }, [activeTab, id, recipientTotal]);

  useEffect(() => {
    if (activeTab === 'recipients' && hasRecipientFilters) {
      fetchAnalyticsRecipients();
    }
  }, [activeTab, hasRecipientFilters, id, recipientTotal]);

  useEffect(() => {
    if (!selectedRecipient?.id) {
      setRecipientTimelineEvents([]);
      setRecipientTimelineLoading(false);
      return;
    }

    let cancelled = false;

    const loadTimeline = async () => {
      setRecipientTimelineLoading(true);
      try {
        const { data, error } = await supabase
          .from('tracking_events')
          .select('id, event_type, created_at, step_number, is_bot, bot_reasons, metadata')
          .eq('recipient_id', selectedRecipient.id)
          .order('created_at', { ascending: true });

        if (error) {
          throw error;
        }

        if (!cancelled) {
          setRecipientTimelineEvents(data || []);
        }
      } catch (error) {
        console.error('Error fetching recipient tracking events:', error);
        if (!cancelled) {
          setRecipientTimelineEvents([]);
        }
      } finally {
        if (!cancelled) {
          setRecipientTimelineLoading(false);
        }
      }
    };

    loadTimeline();

    return () => {
      cancelled = true;
    };
  }, [selectedRecipient?.id]);

  const fetchReplies = async () => {
    if (!id) return;

    const { data: repliedRecipients, error: recipientsError } = await supabase
      .from('recipients')
      .select('id, email, name, updated_at')
      .eq('campaign_id', id)
      .eq('replied', true);

    if (recipientsError) {
      console.error('Error fetching replied recipients:', recipientsError);
      setReplies([]);
      return;
    }

    if (!repliedRecipients || repliedRecipients.length === 0) {
      setReplies([]);
      return;
    }

    const emails = repliedRecipients.map(r => r.email);

    const { data, error } = await supabase
      .from('email_messages')
      .select('*')
      .in('from_email', emails)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching replies:', error);
    } else {
      // Create a map for faster lookup, normalizing email to lowercase
      const messageMap = new Map();
      data.forEach(msg => {
        if (msg.from_email) {
          const normalizedEmail = msg.from_email.toLowerCase();
          // Store the most recent message for each email
          if (!messageMap.has(normalizedEmail)) {
            messageMap.set(normalizedEmail, msg);
          }
        }
      });

      const repliesList = repliedRecipients.map(recipient => {
        const normalizedRecipientEmail = recipient.email.toLowerCase();
        const msg = messageMap.get(normalizedRecipientEmail);

        if (msg) {
          return {
            ...msg,
            recipientName: recipient.name,
            recipientId: recipient.id,
            hasContent: true
          };
        }
        // Fallback for when we know they replied but don't have the message body
        return {
          id: `placeholder-${recipient.id}`,
          from_email: recipient.email,
          recipientName: recipient.name,
          recipientId: recipient.id,
          subject: "Reply detected (Content not synced)",
          body: "<div class='text-gray-500 italic p-4 bg-gray-50 rounded border'>This reply was detected by the system scan, but the full message content has not been synced to the local database yet. <br/><br/>Please go to the <b>Mailbox</b> tab and click <b>Sync Mailbox</b> to download the latest messages.</div>",
          date: recipient.updated_at || new Date().toISOString(),
          hasContent: false
        };
      });

      setReplies(repliesList);
    }
  };

  const fetchCampaignData = async (showLoading = true) => {
    // Only show loading on initial fetch
    if (showLoading && !campaign) setLoading(true);
    let resolvedTotal = recipientTotal;
    
    try {
      // Fetch campaign details
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('*, campaign_followups(*)')
        .eq('id', id)
        .single();

      if (campaignError) throw campaignError;
      setCampaign(campaignData);

      const from = (recipientPage - 1) * recipientPageSize;
      const to = from + recipientPageSize - 1;

      // Fetch recipients for the current page with their assigned config
      const { data: recipientsData, error: recipientsError, count } = await supabase
        .from('recipients')
        .select('*, email_configs(smtp_username)', { count: 'exact' })
        .eq('campaign_id', id)
        .order('id', { ascending: true })
        .range(from, to);

      if (recipientsError) throw recipientsError;
      const pageRecipients = recipientsData || [];
      setRecipients(pageRecipients);

      const totalCount = typeof count === 'number'
        ? count
        : (campaignData?.total_recipients ?? pageRecipients.length);
      resolvedTotal = totalCount;
      setRecipientTotal(totalCount);

      const baseStats = getRecipientStats(campaignData, pageRecipients, totalCount);
      setStats({
        ...baseStats,
        botOpens: (campaignData as any).bot_open_count || 0,
        botClicks: (campaignData as any).bot_click_count || 0
      });

    } catch (error) {
      console.error('Error fetching campaign data:', error);
    } finally {
      setLoading(false);
    }
    return resolvedTotal;
  };

  const fetchAllRecipients = async (selectFields: string, totalOverride?: number) => {
    if (!id) return [];
    const total = typeof totalOverride === 'number'
      ? totalOverride
      : (recipientTotal || campaign?.total_recipients || recipients.length);
    if (!total) return [];

    const batchSize = 1000;
    const batches = Math.ceil(total / batchSize);
    const results: any[] = [];

    for (let batch = 0; batch < batches; batch += 1) {
      const from = batch * batchSize;
      const to = Math.min(total - 1, from + batchSize - 1);
      const { data, error } = await supabase
        .from('recipients')
        .select(selectFields)
        .eq('campaign_id', id)
        .order('id', { ascending: true })
        .range(from, to);

      if (error) throw error;
      results.push(...(data || []));
    }

    return results;
  };

  const fetchAnalyticsRecipients = async (force = false, totalOverride?: number) => {
    if (!id || analyticsLoading) return;
    const total = typeof totalOverride === 'number'
      ? totalOverride
      : (recipientTotal || campaign?.total_recipients || recipients.length);
    if (!total) {
      setAnalyticsRecipients([]);
      return;
    }

    const cached = analyticsCacheRef.current;
    if (!force && cached.id === id && cached.total === total && analyticsRecipients.length >= total) {
      return;
    }

    setAnalyticsLoading(true);
    try {
      const analyticsData = await fetchAllRecipients(
        'id, email, name, status, opened_at, clicked_at, replied, bounced, bounced_at, updated_at, last_email_sent_at, current_step, email_configs(smtp_username)',
        total
      );
      setAnalyticsRecipients(analyticsData);
      analyticsCacheRef.current = { id, total };
    } catch (error) {
      console.error('Error fetching analytics recipients:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'border-slate-200 bg-slate-100 text-slate-600';
      case 'ready': return 'border-emerald-200 bg-emerald-100 text-emerald-700';
      case 'sending': return 'border-blue-200 bg-blue-100 text-blue-700';
      case 'paused': return 'border-amber-200 bg-amber-100 text-amber-700';
      case 'sent': return 'border-emerald-200 bg-emerald-100 text-emerald-700';
      case 'completed': return 'border-emerald-200 bg-emerald-100 text-emerald-700';
      case 'failed': return 'border-rose-200 bg-rose-100 text-rose-700';
      default: return 'border-slate-200 bg-slate-100 text-slate-600';
    }
  };

  const formatDateTime = (value?: string | null) =>
    value ? format(new Date(value), 'MMM d, HH:mm') : '—';


  const recipientTimeline = useMemo(() => {
    if (!selectedRecipient) return [];

    const events: Array<{
      id: string;
      label: string;
      date: string;
      color: string;
      kind: 'system' | 'sent' | 'open' | 'click' | 'reply' | 'bounce';
      step?: number;
      details?: string;
      isBot?: boolean;
    }> = [];

    if (campaign?.created_at) {
      events.push({
        id: 'campaign-added',
        label: 'Added to Campaign',
        date: campaign.created_at,
        color: 'bg-blue-500',
        kind: 'system',
      });
    }

    const followups = (campaign?.campaign_followups || [])
      .slice()
      .sort((a: any, b: any) => a.step_number - b.step_number);

    const sentSteps: Array<{ step: number; date: string; time: number; isEstimated: boolean }> = [];
    if (selectedRecipient.last_email_sent_at) {
      const currentStep = selectedRecipient.current_step ?? 0;
      const sentMap = new Map<number, Date>();
      sentMap.set(currentStep, new Date(selectedRecipient.last_email_sent_at));

      for (let step = currentStep; step > 0; step -= 1) {
        const followup = followups.find((item: any) => item.step_number === step);
        if (!followup) break;
        const delayDays = Number.isFinite(followup.delay_days) ? followup.delay_days : 0;
        const delayHours = Number.isFinite(followup.delay_hours) ? followup.delay_hours : 0;
        const nextSentAt = sentMap.get(step);
        if (!nextSentAt) break;
        const deltaMs = ((delayDays * 24) + delayHours) * 60 * 60 * 1000;
        sentMap.set(step - 1, new Date(nextSentAt.getTime() - deltaMs));
      }

      Array.from(sentMap.entries())
        .sort((a, b) => a[0] - b[0])
        .forEach(([step, date]) => {
          const iso = date.toISOString();
          sentSteps.push({
            step,
            date: iso,
            time: date.getTime(),
            isEstimated: step !== currentStep,
          });
        });
    }

    sentSteps.forEach((stepEntry) => {
      events.push({
        id: `email-sent-${stepEntry.step}`,
        label: `Email Sent (Step ${stepEntry.step})`,
        date: stepEntry.date,
        color: 'bg-blue-500',
        kind: 'sent',
        step: stepEntry.step,
      });
    });

    const resolveStepFromTime = (date: string) => {
      if (sentSteps.length === 0) return null;
      const eventTime = new Date(date).getTime();
      let resolvedStep = sentSteps[0].step;
      sentSteps.forEach((stepEntry) => {
        if (eventTime >= stepEntry.time) {
          resolvedStep = stepEntry.step;
        }
      });
      return resolvedStep;
    };

    recipientTimelineEvents.forEach((event) => {
      if (!event?.created_at) return;

      const explicitStep = Number.isFinite(event.step_number) ? event.step_number : null;
      const resolvedStep = explicitStep ?? resolveStepFromTime(event.created_at);
      const stepLabel = resolvedStep !== null ? `Step ${resolvedStep}` : null;
      const isBot = !!event.is_bot;
      const baseLabel = event.event_type === 'open'
        ? (isBot ? 'Bot Opened' : 'Email Opened')
        : (isBot ? 'Bot Clicked' : 'Link Clicked');
      const label = stepLabel ? `${baseLabel} (${stepLabel})` : baseLabel;
      const color = event.event_type === 'open'
        ? (isBot ? 'bg-slate-400' : 'bg-green-500')
        : (isBot ? 'bg-slate-400' : 'bg-purple-500');
      const detailParts: string[] = [];

      if (event.event_type === 'click' && event.metadata && typeof event.metadata === 'object') {
        const targetUrl = (event.metadata as any).target_url;
        if (typeof targetUrl === 'string') {
          let displayTarget = targetUrl;
          try {
            displayTarget = new URL(targetUrl).hostname || targetUrl;
          } catch (_) {
            displayTarget = targetUrl;
          }
          detailParts.push(`Target: ${displayTarget}`);
        }
      }

      if (isBot && Array.isArray(event.bot_reasons) && event.bot_reasons.length > 0) {
        detailParts.push(`Reasons: ${event.bot_reasons.join(', ')}`);
      }

      const details = detailParts.length > 0 ? detailParts.join(' • ') : undefined;

      events.push({
        id: event.id,
        label,
        date: event.created_at,
        color,
        kind: event.event_type,
        step: resolvedStep ?? undefined,
        details,
        isBot,
      });
    });

    if (selectedRecipient.replied) {
      const replyDate = selectedRecipient.updated_at || selectedRecipient.last_email_sent_at;
      if (replyDate) {
        events.push({
          id: 'replied',
          label: 'Replied',
          date: replyDate,
          color: 'bg-yellow-500',
          kind: 'reply',
        });
      }
    }

    if (selectedRecipient.bounced) {
      const bounceDate = selectedRecipient.bounced_at || selectedRecipient.last_email_sent_at;
      if (bounceDate) {
        events.push({
          id: 'bounced',
          label: 'Bounced',
          date: bounceDate,
          color: 'bg-rose-500',
          kind: 'bounce',
        });
      }
    }

    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [campaign, recipientTimelineEvents, selectedRecipient]);

  const filteredTimeline = useMemo(() => {
    if (timelineFilter === 'all') return recipientTimeline;
    if (timelineFilter === 'human') return recipientTimeline.filter((event) => !event.isBot);
    if (timelineFilter === 'bot') return recipientTimeline.filter((event) => event.isBot);
    if (timelineFilter === 'opens') return recipientTimeline.filter((event) => event.kind === 'open');
    if (timelineFilter === 'clicks') return recipientTimeline.filter((event) => event.kind === 'click');
    if (timelineFilter === 'sent') return recipientTimeline.filter((event) => event.kind === 'sent');
    return recipientTimeline;
  }, [recipientTimeline, timelineFilter]);


  const fetchPipelineData = async () => {
    if (!user || !id) return;
    setPipelineLoading(true);
    try {
      let pipelineId: string | null = null;
      const { data: settingsData, error: settingsError } = await supabase
        .from('campaign_pipeline_settings')
        .select('pipeline_id')
        .eq('campaign_id', id)
        .limit(1);

      if (settingsError) {
        console.error('Error fetching pipeline settings:', settingsError);
      }

      if (settingsData && settingsData[0]?.pipeline_id) {
        pipelineId = settingsData[0].pipeline_id;
      } else {
        const { pipeline } = await ensureDefaultPipeline(user.id);
        pipelineId = pipeline.id;
      }

      if (!pipelineId) {
        setPipelineStages([]);
        setPipelineOpportunities([]);
        return;
      }

      const stageRows = await fetchPipelineStages(pipelineId);
      const mappedStages: PipelineStage[] = stageRows.map((stage) => ({
        id: stage.id,
        name: stage.name,
        description: stage.description || '',
        tone: (stage.tone as PipelineStage['tone']) || 'slate',
        isWon: stage.is_won,
        isLost: stage.is_lost,
      }));
      setPipelineStages(mappedStages);

      const opportunities = await fetchOpportunities({ userId: user.id, pipelineId, campaignId: id });
      const mappedOpportunities: PipelineOpportunity[] = opportunities.map((opp) => {
        const value = typeof opp.value === 'number' ? opp.value : (opp.value ? Number(opp.value) : undefined);
        return {
          id: opp.id,
          contactName: opp.contact_name || opp.contact_email || 'Unknown',
          company: opp.company || '',
          email: opp.contact_email || '',
          owner: opp.owner || 'Unassigned',
          value,
          stageId: opp.stage_id || '',
          status: (opp.status as PipelineOpportunity['status']) || 'open',
          lastActivityAt: opp.last_activity_at,
          nextStep: opp.next_step || '',
          campaignId: opp.campaign_id || id || null,
          sourceCampaign: opp.campaigns?.name || campaign?.name,
        };
      });
      setPipelineOpportunities(mappedOpportunities);
    } catch (error) {
      console.error('Error fetching pipeline data:', error);
    } finally {
      setPipelineLoading(false);
    }
  };

  const handleMovePipelineOpportunity = async (opportunityId: string, stageId: string) => {
    const stage = pipelineStages.find((item) => item.id === stageId);
    if (!stage) return;
    const previous = pipelineOpportunities.find((opp) => opp.id === opportunityId);
    if (!previous) return;

    const status = stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open';
    const optimistic: PipelineOpportunity = {
      ...previous,
      stageId,
      status: status as PipelineOpportunity['status'],
      lastActivityAt: new Date().toISOString(),
    };
    setPipelineOpportunities((prev) => prev.map((opp) => opp.id === opportunityId ? optimistic : opp));

    try {
      const updated = await updateOpportunity(opportunityId, {
        stageId,
        status,
        lastActivityAt: new Date().toISOString(),
      });
      const mapped: PipelineOpportunity = {
        ...optimistic,
        stageId: updated.stage_id || stageId,
        status: (updated.status as PipelineOpportunity['status']) || status,
        lastActivityAt: updated.last_activity_at,
        sourceCampaign: updated.campaigns?.name || optimistic.sourceCampaign,
      };
      setPipelineOpportunities((prev) => prev.map((opp) => opp.id === opportunityId ? mapped : opp));
    } catch (error) {
      console.error('Failed to move pipeline opportunity', error);
      setPipelineOpportunities((prev) => prev.map((opp) => opp.id === opportunityId ? previous : opp));
      toast({
        title: 'Move failed',
        description: 'Could not update the stage. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRemovePipelineOpportunity = async (opportunity: PipelineOpportunity) => {
    try {
      await deleteOpportunity(opportunity.id);
      setPipelineOpportunities((prev) => prev.filter((item) => item.id !== opportunity.id));
      const label = opportunity.contactName || opportunity.email || 'Opportunity';
      toast({
        title: 'Opportunity removed',
        description: `${label} removed from the pipeline.`,
      });
    } catch (error) {
      console.error('Failed to remove pipeline opportunity', error);
      toast({
        title: 'Remove failed',
        description: 'Could not remove this opportunity. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const renderEmailBody = (body?: string) => {
    if (!body) {
      return <div className="text-sm text-slate-500 italic">No email content available.</div>;
    }
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(body);
    if (looksLikeHtml) {
      return (
        <div
          className="prose prose-sm max-w-none bg-white p-4 rounded border shadow-sm"
          dangerouslySetInnerHTML={{ __html: body }}
        />
      );
    }
    return (
      <div className="whitespace-pre-wrap text-sm text-slate-700 bg-white p-4 rounded border shadow-sm">
        {body}
      </div>
    );
  };

  const getPaginationItems = (page: number, total: number) => {
    const pages = new Set<number>([1, total, page, page - 1, page + 1]);
    const sorted = Array.from(pages)
      .filter((p) => p >= 1 && p <= total)
      .sort((a, b) => a - b);

    const items: Array<number | 'ellipsis'> = [];
    let previous = 0;

    sorted.forEach((p) => {
      if (p - previous > 1) {
        if (previous !== 0) items.push('ellipsis');
      }
      items.push(p);
      previous = p;
    });

    return items;
  };

  const isSentRecipient = (recipient: any) => {
    if (recipient.last_email_sent_at) return true;
    return ['sent', 'opened', 'clicked', 'replied', 'bounced', 'completed'].includes(recipient.status);
  };

  const getRecipientStats = (campaignData: any, recipientsData: any[], totalCount: number) => {
    const totalFromCampaign = campaignData?.total_recipients || 0;
    const total = totalCount || totalFromCampaign || recipientsData.length;
    const isPartial = total > recipientsData.length;

    const sent = Math.max(campaignData?.sent_count || 0, recipientsData.filter(isSentRecipient).length);
    const failed = Math.max(campaignData?.failed_count || 0, recipientsData.filter((r) => r.status === 'failed').length);
    const opens = Math.max(campaignData?.opened_count || 0, recipientsData.filter((r) => r.opened_at).length);
    const clicks = Math.max(campaignData?.clicked_count || 0, recipientsData.filter((r) => r.clicked_at).length);
    const replies = Math.max((campaignData as any)?.replied_count || 0, recipientsData.filter((r) => r.replied).length);
    const bounces = Math.max(campaignData?.bounced_count || 0, recipientsData.filter((r) => r.bounced).length);
    const processing = isPartial ? 0 : recipientsData.filter((r) => r.status === 'processing').length;
    const queued = isPartial
      ? Math.max(0, total - sent - failed)
      : recipientsData.filter((r) => r.status === 'pending').length;

    return { total, sent, failed, opens, clicks, replies, bounces, processing, queued };
  };

  // Helper to calculate next send time (reused logic)
  const calculateNextSendTime = (recipient: any) => {
    if (!campaign?.campaign_followups) return null;
    
    const followups = campaign.campaign_followups;
    const totalSteps = 1 + followups.length;
    const currentStep = typeof recipient.current_step === 'number' ? recipient.current_step : -1;
    
    if (recipient.bounced || recipient.replied || currentStep >= totalSteps - 1) return null;
    
    const nextStep = currentStep + 1;
    const stepConfig = followups.find((f: any) => f.step_number === nextStep);
    
    if (!stepConfig || !recipient.last_email_sent_at) return null;
    
    let scheduledTime = new Date(recipient.last_email_sent_at);
    if (stepConfig.delay_days) scheduledTime = addDays(scheduledTime, stepConfig.delay_days);
    if (stepConfig.delay_hours) scheduledTime = addHours(scheduledTime, stepConfig.delay_hours);
    
    return scheduledTime;
  };

  const filterSource = hasRecipientFilters && analyticsRecipients.length > 0
    ? analyticsRecipients
    : recipients;

  const filteredRecipients = filterSource.filter(r => {
    const email = (r.email || '').toLowerCase();
    const name = typeof r.name === 'string' ? r.name.toLowerCase() : '';
    const matchesSearch = !normalizedSearchTerm
      || email.includes(normalizedSearchTerm)
      || name.includes(normalizedSearchTerm);

    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    if (statusFilter === 'replied') return r.replied;
    if (statusFilter === 'bounced') return r.bounced;
    if (statusFilter === 'opened') return r.opened_at;
    if (statusFilter === 'clicked') return r.clicked_at;
    if (statusFilter === 'processing') return r.status === 'processing';
    if (statusFilter === 'queued') return r.status === 'pending';
    if (statusFilter === 'sent') return r.status === 'sent';

    return true;
  });

  const filteredTotal = hasRecipientFilters ? filteredRecipients.length : recipientTotal;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / recipientPageSize));
  const pageStart = filteredTotal === 0 ? 0 : (recipientPage - 1) * recipientPageSize + 1;
  const pageEnd = Math.min(recipientPage * recipientPageSize, filteredTotal);
  const paginationItems = getPaginationItems(recipientPage, totalPages);
  const pagedRecipients = hasRecipientFilters
    ? filteredRecipients.slice((recipientPage - 1) * recipientPageSize, recipientPage * recipientPageSize)
    : filteredRecipients;
  const analyticsIsPartial = recipientTotal > (analyticsRecipients.length || recipients.length);
  const analyticsSampleSize = analyticsRecipients.length || recipients.length;

  useEffect(() => {
    if (recipientPage > totalPages) {
      setRecipientPage(totalPages);
    }
  }, [recipientPage, totalPages]);

  const handleRecipientPageChange = (page: number) => {
    if (page < 1 || page > totalPages || page === recipientPage) return;
    setRecipientPage(page);
  };

  const handleRecipientPageSizeChange = (value: string) => {
    const nextSize = Number(value);
    if (!Number.isFinite(nextSize)) return;
    setRecipientPageSize(nextSize);
    setRecipientPage(1);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'open': return <Eye className="h-4 w-4 text-green-500" />;
      case 'click': return <MousePointerClick className="h-4 w-4 text-purple-500" />;
      case 'reply': return <MessageSquare className="h-4 w-4 text-yellow-500" />;
      case 'bounce': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const hourlyStats = React.useMemo(() => {
    const source = analyticsRecipients.length > 0 ? analyticsRecipients : recipients;
    const stats = Array(24).fill(0).map((_, i) => ({ hour: `${i}:00`, opens: 0, clicks: 0 }));
    source.forEach(r => {
      if (r.opened_at) {
        const h = new Date(r.opened_at).getHours();
        stats[h].opens++;
      }
      if (r.clicked_at) {
        const h = new Date(r.clicked_at).getHours();
        stats[h].clicks++;
      }
    });
    return stats;
  }, [analyticsRecipients, recipients]);


  const timelineData = React.useMemo(() => {
    const source = analyticsRecipients.length > 0 ? analyticsRecipients : recipients;
    const days = new Map();
    // Initialize with last 7 days to ensure continuity
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = format(d, 'MMM dd');
      days.set(dateStr, { date: dateStr, opens: 0, clicks: 0, replies: 0 });
    }

    source.forEach(r => {
      if (r.opened_at) {
        const date = format(new Date(r.opened_at), 'MMM dd');
        if (days.has(date)) days.get(date).opens++;
      }
      if (r.clicked_at) {
        const date = format(new Date(r.clicked_at), 'MMM dd');
        if (days.has(date)) days.get(date).clicks++;
      }
      if (r.replied) {
        const date = format(new Date(r.updated_at || new Date()), 'MMM dd');
        if (days.has(date)) days.get(date).replies++;
      }
    });
    return Array.from(days.values());
  }, [analyticsRecipients, recipients]);

  useEffect(() => {
    const source = analyticsRecipients.length > 0 ? analyticsRecipients : recipients;
    const activity: any[] = [];
    source.forEach(r => {
      if (r.opened_at) activity.push({ type: 'open', date: new Date(r.opened_at), email: r.email, name: r.name });
      if (r.clicked_at) activity.push({ type: 'click', date: new Date(r.clicked_at), email: r.email, name: r.name });
      if (r.replied) activity.push({ type: 'reply', date: new Date(r.last_email_sent_at || new Date()), email: r.email, name: r.name }); // Approximate
      if (r.bounced) activity.push({ type: 'bounce', date: new Date(r.bounced_at || r.last_email_sent_at || new Date()), email: r.email, name: r.name });
    });

    activity.sort((a, b) => b.date.getTime() - a.date.getTime());
    setRecentActivity(activity.slice(0, 20));
  }, [analyticsRecipients, recipients]);

  const handleRefresh = async () => {
    const total = await fetchCampaignData(true);
    await fetchAnalyticsRecipients(true, total);
  };

  const handleExport = async () => {
    try {
      const total = recipientTotal || campaign?.total_recipients || recipients.length;
      const exportRecipients = analyticsRecipients.length >= total && total > 0
        ? analyticsRecipients
        : await fetchAllRecipients('email, name, status, opened_at, clicked_at, replied, bounced, last_email_sent_at', total);

      const rows = exportRecipients.length ? exportRecipients : recipients;
      const headers = ['Email', 'Name', 'Status', 'Opened At', 'Clicked At', 'Replied', 'Bounced', 'Last Sent'];
      const csvContent = [
        headers.join(','),
        ...rows.map(r => [
          r.email,
          `"${r.name || ''}"`,
          r.status,
          r.opened_at ? new Date(r.opened_at).toISOString() : '',
          r.clicked_at ? new Date(r.clicked_at).toISOString() : '',
          r.replied ? 'Yes' : 'No',
          r.bounced ? 'Yes' : 'No',
          r.last_email_sent_at ? new Date(r.last_email_sent_at).toISOString() : ''
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign-export-${campaign?.name || 'data'}.csv`;
      a.click();
    } catch (error) {
      console.error('Error exporting recipients:', error);
    }
  };

  const getInsights = () => {
    const insights = [];
    const openRate = stats.sent > 0 ? (stats.opens / stats.sent) * 100 : 0;
    const replyRate = stats.sent > 0 ? (stats.replies / stats.sent) * 100 : 0;
    const bounceRate = stats.sent > 0 ? (stats.bounces / stats.sent) * 100 : 0;

    if (openRate < 20 && stats.sent > 10) {
        insights.push({
            type: 'warning',
            title: 'Low Open Rate',
            message: 'Your open rate is below 20%. Consider A/B testing your subject lines to improve engagement.'
        });
    } else if (openRate > 50) {
        insights.push({
            type: 'success',
            title: 'Excellent Open Rate',
            message: 'Great job! Your subject lines are performing very well.'
        });
    }

    if (bounceRate > 5) {
        insights.push({
            type: 'danger',
            title: 'High Bounce Rate',
            message: 'Your bounce rate is above 5%. Check your prospect list quality to protect your sender reputation.'
        });
    }

    if (replyRate > 5) {
        insights.push({
            type: 'success',
            title: 'High Engagement',
            message: 'Your reply rate is exceptional. Your content is resonating well with the audience.'
        });
    }

    if (stats.botOpens > 0 || stats.botClicks > 0) {
        insights.push({
            type: 'info',
            title: 'Bot Activity Detected',
            message: `We filtered out ${stats.botOpens} bot opens and ${stats.botClicks} bot clicks to keep your metrics accurate.`
        });
    }

    if (insights.length === 0) {
        insights.push({
            type: 'info',
            title: 'Gathering Data',
            message: 'Keep sending! We need more data to generate specific insights for this campaign.'
        });
    }

    return insights;
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <DashboardLayout 
        activeTab="campaigns" 
        onTabChange={handleTabChange} 
        user={user} 
        onLogout={handleLogout}
      >
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout 
        activeTab="campaigns" 
        onTabChange={handleTabChange} 
        user={user} 
        onLogout={handleLogout}
      >
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
          <h2 className="text-2xl font-bold text-gray-900">Campaign not found</h2>
          <Button onClick={() => navigate('/campaigns')} className="mt-4">
            Go Back
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      activeTab="campaigns" 
      onTabChange={handleTabChange} 
      user={user} 
      onLogout={handleLogout}
    >
      <div className="space-y-8">
        {/* Header */}
        <div className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/campaigns')}
                className="rounded-full border border-[var(--shell-border)] bg-white/80 hover:bg-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h1
                    className="text-3xl font-semibold tracking-tight text-[var(--shell-ink)]"
                    style={{ fontFamily: 'var(--shell-font-display)' }}
                  >
                    {campaign.name}
                  </h1>
                  <Badge variant="outline" className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusColor(campaign.status)}`}>
                    {campaign.status}
                  </Badge>
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">
                    ID {campaign.id}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--shell-muted)]">
                  <span className="flex items-center gap-2">
                    <Mail className="h-4 w-4" /> {campaign.subject}
                  </span>
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> Created {format(new Date(campaign.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleExport}
                variant="outline"
                className="rounded-full border-[var(--shell-border)] bg-white/80 font-semibold text-[var(--shell-ink)] hover:bg-white"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
              <Button
                onClick={handleRefresh}
                variant="outline"
                className="rounded-full border-[var(--shell-border)] bg-white/80 font-semibold text-[var(--shell-ink)] hover:bg-white"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="default" className="rounded-full bg-blue-600 hover:bg-blue-700">
                Edit Campaign
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="relative overflow-hidden border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Total Recipients</p>
                  <h3 className="mt-2 text-3xl font-semibold text-[var(--shell-ink)]">{stats.total.toLocaleString()}</h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--shell-muted)]">
                    <span className="text-blue-700 font-semibold">{stats.sent.toLocaleString()}</span>
                    <span>sent</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-amber-600 font-semibold">{stats.queued.toLocaleString()}</span>
                    <span>queued</span>
                    {stats.failed > 0 && (
                      <>
                        <span className="text-slate-300">|</span>
                        <span className="text-rose-600 font-semibold">{stats.failed.toLocaleString()}</span>
                        <span>failed</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 shadow-sm">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Engagement Rate</p>
                  <h3 className="mt-2 text-3xl font-semibold text-[var(--shell-ink)]">
                    {stats.sent > 0 ? Math.round(((stats.opens + stats.clicks) / stats.sent) * 100) : 0}%
                  </h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--shell-muted)]">
                    <span className="text-emerald-600 font-semibold">{stats.opens.toLocaleString()}</span>
                    <span>opens</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-violet-600 font-semibold">{stats.clicks.toLocaleString()}</span>
                    <span>clicks</span>
                  </div>
                  {(stats.botOpens > 0 || stats.botClicks > 0) && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-slate-500" title="Filtered bot activity">
                      <Filter className="h-3 w-3" />
                      {stats.botOpens.toLocaleString()} bot opens, {stats.botClicks.toLocaleString()} bot clicks
                    </div>
                  )}
                </div>
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600 shadow-sm">
                  <MousePointerClick className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Reply Rate</p>
                  <h3 className="mt-2 text-3xl font-semibold text-[var(--shell-ink)]">
                    {stats.sent > 0 ? ((stats.replies / stats.sent) * 100).toFixed(1) : 0}%
                  </h3>
                  <div className="mt-3 flex items-center gap-2 text-xs text-[var(--shell-muted)]">
                    <span className="text-amber-600 font-semibold">{stats.replies.toLocaleString()}</span>
                    <span>replies</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3 text-amber-600 shadow-sm">
                  <MessageSquare className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Bounce Rate</p>
                  <h3 className="mt-2 text-3xl font-semibold text-[var(--shell-ink)]">
                    {stats.sent > 0 ? ((stats.bounces / stats.sent) * 100).toFixed(1) : 0}%
                  </h3>
                  <div className="mt-3 flex items-center gap-2 text-xs text-[var(--shell-muted)]">
                    <span className="text-rose-600 font-semibold">{stats.bounces.toLocaleString()}</span>
                    <span>bounced</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-rose-50 p-3 text-rose-600 shadow-sm">
                  <AlertCircle className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full justify-start gap-2 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 p-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
            <TabsTrigger value="overview" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow">Overview</TabsTrigger>
            <TabsTrigger value="analytics" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow">
                <BarChart2 className="h-4 w-4 mr-2" />
                Analytics
            </TabsTrigger>
            <TabsTrigger value="recipients" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow">
              Recipients <Badge variant="secondary" className="ml-2 bg-white/70 text-slate-600">{stats.total.toLocaleString()}</Badge>
            </TabsTrigger>
            <TabsTrigger value="replies" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow">
              Replies <Badge variant="secondary" className="ml-2 bg-white/70 text-slate-600">{stats.replies.toLocaleString()}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow">
              Pipeline <Badge variant="secondary" className="ml-2 bg-white/70 text-slate-600">{pipelineOpportunities.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="sequence" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow">Sequence</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Engagement Timeline */}
                <Card className="lg:col-span-2 border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                    <CardHeader>
                        <CardTitle className="text-base font-semibold text-[var(--shell-ink)]">Engagement Over Time</CardTitle>
                        <CardDescription className="text-sm text-[var(--shell-muted)]">Daily opens, clicks, and replies for the last 7 days</CardDescription>
                        {analyticsIsPartial && analyticsSampleSize > 0 && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            Showing activity for {analyticsSampleSize.toLocaleString()} recipients. Refresh for full history.
                          </div>
                        )}
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timelineData}>
                                <defs>
                                    <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Area type="monotone" dataKey="opens" stroke="#22c55e" fillOpacity={1} fill="url(#colorOpens)" name="Opens" />
                                <Area type="monotone" dataKey="clicks" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorClicks)" name="Clicks" />
                                <Area
                                  type="monotone"
                                  dataKey="replies"
                                  stroke="#eab308"
                                  strokeWidth={2}
                                  fill="none"
                                  name="Replies"
                                  dot={{ r: 3 }}
                                  activeDot={{ r: 4 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* AI Insights */}
                <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--shell-ink)]">
                            <Lightbulb className="h-5 w-5 text-yellow-500" />
                            Campaign Insights
                        </CardTitle>
                        <CardDescription className="text-sm text-[var(--shell-muted)]">AI-driven recommendations</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {getInsights().map((insight, i) => (
                            <div key={i} className={`p-4 rounded-lg border ${
                                insight.type === 'warning' ? 'bg-orange-50 border-orange-100' :
                                insight.type === 'success' ? 'bg-green-50 border-green-100' :
                                insight.type === 'danger' ? 'bg-red-50 border-red-100' :
                                'bg-blue-50 border-blue-100'
                            }`}>
                                <h4 className={`font-semibold text-sm mb-1 ${
                                    insight.type === 'warning' ? 'text-orange-800' :
                                    insight.type === 'success' ? 'text-green-800' :
                                    insight.type === 'danger' ? 'text-red-800' :
                                    'text-blue-800'
                                }`}>{insight.title}</h4>
                                <p className="text-xs text-slate-600">{insight.message}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Hourly Engagement */}
                <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                    <CardHeader>
                        <CardTitle className="text-base font-semibold text-[var(--shell-ink)]">Best Time to Email</CardTitle>
                        <CardDescription className="text-sm text-[var(--shell-muted)]">When your recipients are most active (24h)</CardDescription>
                        {analyticsIsPartial && analyticsSampleSize > 0 && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            Showing activity for {analyticsSampleSize.toLocaleString()} recipients. Refresh for full history.
                          </div>
                        )}
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={hourlyStats}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="hour" fontSize={12} interval={3} />
                                <YAxis fontSize={12} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    cursor={{ fill: '#f3f4f6' }}
                                />
                                <Bar dataKey="opens" fill="#22c55e" radius={[4, 4, 0, 0]} name="Opens" />
                                <Bar dataKey="clicks" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Clicks" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Funnel */}
                <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                    <CardHeader>
                        <CardTitle className="text-base font-semibold text-[var(--shell-ink)]">Conversion Funnel</CardTitle>
                        <CardDescription className="text-sm text-[var(--shell-muted)]">Drop-off rates between stages</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                layout="vertical" 
                                data={[
                                    { stage: 'Sent', count: stats.sent, fill: '#3b82f6' },
                                    { stage: 'Opened', count: stats.opens, fill: '#22c55e' },
                                    { stage: 'Clicked', count: stats.clicks, fill: '#8b5cf6' },
                                    { stage: 'Replied', count: stats.replies, fill: '#eab308' },
                                ]} 
                                margin={{ left: 20 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="stage" type="category" width={60} />
                                <Tooltip />
                                <Bar dataKey="count" barSize={30} radius={[0, 4, 4, 0]}>
                                    {
                                        [
                                            { stage: 'Sent', count: stats.sent, fill: '#3b82f6' },
                                            { stage: 'Opened', count: stats.opens, fill: '#22c55e' },
                                            { stage: 'Clicked', count: stats.clicks, fill: '#8b5cf6' },
                                            { stage: 'Replied', count: stats.replies, fill: '#eab308' },
                                        ].map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))
                                    }
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
          </TabsContent>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Funnel Chart */}
              <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-[var(--shell-ink)]">Campaign Funnel</CardTitle>
                  <CardDescription className="text-sm text-[var(--shell-muted)]">Conversion rates through the email stages</CardDescription>
                </CardHeader>
                <CardContent className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[
                      { name: 'Sent', value: stats.sent },
                      { name: 'Opened', value: stats.opens },
                      { name: 'Clicked', value: stats.clicks },
                      { name: 'Replied', value: stats.replies },
                    ]}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorValue)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Hourly Engagement Chart */}
              <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-[var(--shell-ink)]">Engagement by Hour</CardTitle>
                  <CardDescription className="text-sm text-[var(--shell-muted)]">When do recipients open and click?</CardDescription>
                  {analyticsIsPartial && analyticsSampleSize > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                      <AlertCircle className="h-3 w-3" />
                      Showing activity for {analyticsSampleSize.toLocaleString()} recipients. Refresh for full history.
                    </div>
                  )}
                </CardHeader>
                <CardContent className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyStats}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="hour" axisLine={false} tickLine={false} fontSize={12} interval={3} />
                      <YAxis axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="opens" fill="#22c55e" radius={[4, 4, 0, 0]} name="Opens" />
                      <Bar dataKey="clicks" fill="#a855f7" radius={[4, 4, 0, 0]} name="Clicks" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity Feed */}
            <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--shell-ink)]">
                    <Activity className="h-5 w-5 text-blue-600" />
                    Live Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[350px] pr-4">
                    <div className="space-y-4">
                      {analyticsLoading ? (
                        <div className="text-center text-slate-500 py-8">Loading activity...</div>
                      ) : recentActivity.length === 0 ? (
                        <div className="text-center text-slate-500 py-8">No activity yet</div>
                      ) : (
                        recentActivity.map((item, i) => (
                          <div key={i} className="flex items-start gap-3 pb-3 border-b last:border-0">
                            <div className="mt-1 bg-gray-50 p-1.5 rounded-full">
                              {getActivityIcon(item.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900">
                                {item.email}
                              </p>
                              <p className="text-xs text-slate-500 capitalize">
                                {item.type === 'open' ? 'Opened email' : 
                                 item.type === 'click' ? 'Clicked link' : 
                                 item.type === 'reply' ? 'Replied' : 'Bounced'}
                              </p>
                            </div>
                            <span className="text-xs text-slate-400 whitespace-nowrap">
                              {formatDistanceToNow(item.date, { addSuffix: true })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
          </TabsContent>

          {/* REPLIES TAB */}
          <TabsContent value="replies">
            <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-[var(--shell-ink)]">Inbox Replies</CardTitle>
                <CardDescription className="text-sm text-[var(--shell-muted)]">Responses from your campaign recipients</CardDescription>
              </CardHeader>
              <CardContent>
                {replies.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-lg font-medium">No replies yet</p>
                    <p className="text-sm">Replies will appear here when recipients respond to your emails.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {replies.map((reply) => (
                      <Card key={reply.id} className="border border-[var(--shell-border)] bg-white/95 shadow-sm overflow-hidden">
                        <div 
                          className="p-4 cursor-pointer hover:bg-gray-50 transition-colors flex items-start gap-4"
                          onClick={() => setExpandedReply(expandedReply === reply.id ? null : reply.id)}
                        >
                          <div className="mt-1 bg-yellow-100 p-2 rounded-full text-yellow-600">
                            <MessageSquare className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-semibold text-gray-900">{reply.recipientName || reply.from_email}</h4>
                                <p className="text-sm text-gray-500">{reply.from_email}</p>
                              </div>
                              <span className="text-xs text-gray-400 whitespace-nowrap">
                                {formatDistanceToNow(new Date(reply.date), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-gray-800 mt-2">{reply.subject}</p>
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                              {reply.body?.replace(/<[^>]*>/g, '').substring(0, 150)}...
                            </p>
                          </div>
                          <div className="text-gray-400">
                            {expandedReply === reply.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </div>
                        </div>
                        
                        {expandedReply === reply.id && (
                          <div className="bg-gray-50 p-6 border-t">
                            <div className="prose prose-sm max-w-none bg-white p-4 rounded border shadow-sm" dangerouslySetInnerHTML={{ __html: reply.body || '' }} />
                            <div className="mt-4 flex justify-end">
                                <Button size="sm" variant="outline" onClick={() => window.open(`mailto:${reply.from_email}`)}>
                                    Reply via Email Client
                                </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RECIPIENTS TAB */}
          <TabsContent value="recipients">
            <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <CardHeader className="pb-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-semibold text-[var(--shell-ink)]">Recipients</CardTitle>
                    <CardDescription className="text-sm text-[var(--shell-muted)]">Delivery status and engagement details by recipient.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative w-64">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search recipients..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-10 w-[180px]">
                        <SelectValue placeholder="All status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="queued">Queued</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="opened">Opened</SelectItem>
                        <SelectItem value="clicked">Clicked</SelectItem>
                        <SelectItem value="replied">Replied</SelectItem>
                        <SelectItem value="bounced">Bounced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="rounded-md border-t border-[var(--shell-border)]">
                  <div className="relative max-h-[60vh] w-full overflow-auto">
                    <table className="w-full min-w-[1200px] caption-bottom text-sm text-left">
                      <thead className="bg-white/95">
                        <tr className="border-b border-slate-200/70">
                          <th className="sticky top-0 z-30 h-11 min-w-[180px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Name</th>
                          <th className="sticky top-0 z-30 h-11 min-w-[240px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Email</th>
                          <th className="sticky top-0 z-30 h-11 min-w-[200px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Sender</th>
                          <th className="sticky top-0 z-30 h-11 min-w-[140px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Status</th>
                          <th className="sticky top-0 z-30 h-11 min-w-[120px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Step</th>
                          <th className="sticky top-0 z-30 h-11 min-w-[220px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Engagement</th>
                          <th className="sticky top-0 z-30 h-11 min-w-[200px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Next Scheduled</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredRecipients.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="h-24 text-center text-muted-foreground">
                              No recipients found matching your filters.
                            </td>
                          </tr>
                        ) : (
                          pagedRecipients.map((recipient) => {
                            const nextSend = calculateNextSendTime(recipient);
                            return (
                              <tr
                                key={recipient.id}
                                className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                                onClick={() => setSelectedRecipient(recipient)}
                              >
                                <td className="px-4 py-3 align-middle font-medium text-slate-800">
                                  {recipient.name || '-'}
                                </td>
                                <td className="px-4 py-3 align-middle text-blue-600 whitespace-nowrap truncate max-w-[240px]" title={recipient.email}>
                                  {recipient.email}
                                </td>
                                <td className="px-4 py-3 align-middle text-slate-600">
                                  {recipient.email_configs?.smtp_username || '-'}
                                </td>
                                <td className="px-4 py-3 align-middle">
                                  {recipient.bounced ? (
                                    <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-none">Bounced</Badge>
                                  ) : recipient.replied ? (
                                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-none">Replied</Badge>
                                  ) : recipient.status === 'processing' ? (
                                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none animate-pulse">Processing</Badge>
                                  ) : recipient.status === 'sent' ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none">Sent</Badge>
                                  ) : recipient.status === 'pending' ? (
                                    <Badge variant="outline" className="bg-slate-100 text-slate-700 border-none">Queued</Badge>
                                  ) : (
                                    <Badge variant="outline" className="capitalize bg-slate-100 text-slate-700 border-none">{recipient.status}</Badge>
                                  )}
                                </td>
                                <td className="px-4 py-3 align-middle text-slate-600">
                                  <div className="text-sm font-medium text-slate-700">Step {recipient.current_step ?? 0}</div>
                                  <div className="text-xs text-slate-500">
                                    {recipient.last_email_sent_at ? format(new Date(recipient.last_email_sent_at), 'MMM d') : 'Not sent yet'}
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-middle">
                                  <div className="flex flex-wrap gap-2">
                                    <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs ${recipient.opened_at ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}>
                                      <Eye className="h-3 w-3" /> {recipient.opened_at ? 'Opened' : 'No open'}
                                    </div>
                                    <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs ${recipient.clicked_at ? 'bg-violet-50 text-violet-700' : 'bg-slate-50 text-slate-400'}`}>
                                      <MousePointerClick className="h-3 w-3" /> {recipient.clicked_at ? 'Clicked' : 'No click'}
                                    </div>
                                    {recipient.replied && (
                                      <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                                        <MessageSquare className="h-3 w-3" /> Replied
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-middle text-slate-600">
                                  {nextSend ? (
                                    <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                                      <Clock className="h-3 w-3" />
                                      {format(nextSend, 'MMM d, HH:mm')}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">Completed</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-slate-200/70 bg-white/95 px-4 py-3 shadow-[0_-10px_18px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-semibold uppercase tracking-wide text-slate-500">Items per page</span>
                        <Select value={String(recipientPageSize)} onValueChange={handleRecipientPageSizeChange}>
                          <SelectTrigger className="h-8 w-[120px]">
                            <SelectValue placeholder="Per page" />
                          </SelectTrigger>
                          <SelectContent>
                            {pageSizeOptions.map((size) => (
                              <SelectItem key={size} value={String(size)}>
                                {size} / page
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-slate-500">
                          Showing {pageStart}-{pageEnd} of {filteredTotal.toLocaleString()}
                        </span>
                      </div>
                      <Pagination className="w-auto justify-end">
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              href="#"
                              onClick={(event) => {
                                event.preventDefault();
                                handleRecipientPageChange(recipientPage - 1);
                              }}
                              className={recipientPage === 1 ? "pointer-events-none opacity-50" : ""}
                            />
                          </PaginationItem>
                          {paginationItems.map((item, index) =>
                            item === "ellipsis" ? (
                              <PaginationItem key={`ellipsis-${index}`}>
                                <PaginationEllipsis />
                              </PaginationItem>
                            ) : (
                              <PaginationItem key={item}>
                                <PaginationLink
                                  href="#"
                                  isActive={item === recipientPage}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    handleRecipientPageChange(item);
                                  }}
                                >
                                  {item}
                                </PaginationLink>
                              </PaginationItem>
                            )
                          )}
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              onClick={(event) => {
                                event.preventDefault();
                                handleRecipientPageChange(recipientPage + 1);
                              }}
                              className={recipientPage === totalPages ? "pointer-events-none opacity-50" : ""}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* PIPELINE TAB */}
          <TabsContent value="pipeline" className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--shell-ink)]">Pipeline from campaign replies</h3>
                <p className="text-sm text-[var(--shell-muted)]">
                  Replies that signal intent should move into qualified stages.
                </p>
              </div>
              <Button
                variant="outline"
                className="border-[var(--shell-border)] bg-white/80"
                onClick={() => navigate('/pipeline')}
              >
                View full pipeline
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Replies captured</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--shell-ink)]">{pipelineOpportunities.length}</p>
                  <p className="mt-1 text-xs text-[var(--shell-muted)]">Ready for qualification</p>
                </CardContent>
              </Card>
              <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Next steps set</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--shell-ink)]">
                    {pipelineOpportunities.filter((opp) => !!opp.nextStep).length}
                  </p>
                  <p className="mt-1 text-xs text-[var(--shell-muted)]">Keep momentum with tasks</p>
                </CardContent>
              </Card>
              <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Meetings booked</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--shell-ink)]">0</p>
                  <p className="mt-1 text-xs text-[var(--shell-muted)]">Sync calendar in V2</p>
                </CardContent>
              </Card>
            </div>

            <PipelineBoard
              stages={pipelineStages}
              opportunities={pipelineOpportunities}
              emptyLabel={pipelineLoading
                ? "Loading pipeline..."
                : "No opportunities yet. Use the Inbox to classify replies into pipeline stages."}
              onMoveOpportunity={handleMovePipelineOpportunity}
              onRemoveOpportunity={handleRemovePipelineOpportunity}
            />
          </TabsContent>
          {/* SEQUENCE TAB */}
          <TabsContent value="sequence">
            <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-[var(--shell-ink)]">Campaign Sequence</CardTitle>
                <CardDescription className="text-sm text-[var(--shell-muted)]">Visual timeline of your email steps</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative pl-8 space-y-8 before:absolute before:left-3.5 before:top-2 before:h-full before:w-0.5 before:bg-gray-200">
                  {/* Step 0 */}
                  <div className="relative">
                    <div className="absolute -left-[29px] top-0 h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm ring-4 ring-white">
                      1
                    </div>
                    <Card
                      className="border border-[var(--shell-border)] bg-white/95 shadow-sm transition hover:shadow-md cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedSequenceStep({
                        title: 'Initial Email',
                        stepLabel: 'Step 0',
                        subject: campaign.subject,
                        body: campaign.body
                      })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedSequenceStep({
                            title: 'Initial Email',
                            stepLabel: 'Step 0',
                            subject: campaign.subject,
                            body: campaign.body
                          });
                        }
                      }}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex justify-between">
                          <CardTitle className="text-base">Initial Email</CardTitle>
                          <Badge variant="outline">Step 0</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-600 font-medium mb-1">Subject: {campaign.subject}</p>
                        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded border max-h-20 overflow-hidden">
                          {campaign.body?.substring(0, 150)}...
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Follow-ups */}
                  {campaign.campaign_followups?.sort((a: any, b: any) => a.step_number - b.step_number).map((step: any, index: number) => (
                    <div key={step.id} className="relative">
                      <div className="absolute -left-[29px] top-0 h-8 w-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-sm ring-4 ring-white">
                        {index + 2}
                      </div>
                      
                      <div className="flex items-center gap-2 mb-4 text-sm text-gray-500 ml-1">
                        <Clock className="h-4 w-4" />
                        <span>Wait {step.delay_days} days, {step.delay_hours} hours</span>
                      </div>

                      <Card
                        className="border border-[var(--shell-border)] bg-white/95 shadow-sm transition hover:shadow-md cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedSequenceStep({
                          title: `Follow-up ${index + 1}`,
                          stepLabel: `Step ${step.step_number}`,
                          subject: step.subject || `Re: ${campaign.subject}`,
                          body: step.body
                        })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedSequenceStep({
                              title: `Follow-up ${index + 1}`,
                              stepLabel: `Step ${step.step_number}`,
                              subject: step.subject || `Re: ${campaign.subject}`,
                              body: step.body
                            });
                          }
                        }}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex justify-between">
                            <CardTitle className="text-base">Follow-up {index + 1}</CardTitle>
                            <Badge variant="outline">Step {step.step_number}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600 font-medium mb-1">
                            Subject: {step.subject || `Re: ${campaign.subject}`}
                          </p>
                          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded border max-h-20 overflow-hidden">
                            {step.body?.substring(0, 150)}...
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sequence Step Details Dialog */}
      <Dialog open={!!selectedSequenceStep} onOpenChange={(open) => !open && setSelectedSequenceStep(null)}>
        <DialogContent className="max-w-3xl border border-[var(--shell-border)] bg-white/95">
          <DialogHeader>
            <DialogTitle>{selectedSequenceStep?.title}</DialogTitle>
            <DialogDescription>{selectedSequenceStep?.stepLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm font-medium text-slate-700">
              Subject: {selectedSequenceStep?.subject || 'No subject'}
            </div>
            <ScrollArea className="h-[60vh] pr-4">
              {renderEmailBody(selectedSequenceStep?.body)}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recipient Details Dialog */}
      <Dialog open={!!selectedRecipient} onOpenChange={(open) => !open && setSelectedRecipient(null)}>
      <DialogContent className="max-w-4xl border border-[var(--shell-border)] bg-white/95">
          <DialogHeader className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <DialogTitle>Recipient Details</DialogTitle>
                <DialogDescription>
                  Detailed history for {selectedRecipient?.email}
                </DialogDescription>
              </div>
              {selectedRecipient && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={`border ${getStatusColor(selectedRecipient.status || 'sent')}`}>
                    {selectedRecipient.status || 'sent'}
                  </Badge>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    Step {selectedRecipient.current_step ?? 0}
                  </Badge>
                </div>
              )}
            </div>
          </DialogHeader>
          
          {selectedRecipient && (
            <Card className="border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold text-[var(--shell-ink)]">Timeline</CardTitle>
                    <CardDescription className="text-sm text-[var(--shell-muted)]">
                      Chronological activity with step context and bot labels.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: 'all', label: 'All' },
                      { id: 'human', label: 'Human' },
                      { id: 'bot', label: 'Bots' },
                      { id: 'opens', label: 'Opens' },
                      { id: 'clicks', label: 'Clicks' },
                      { id: 'sent', label: 'Sent' },
                    ] as const).map((option) => (
                      <Button
                        key={option.id}
                        size="sm"
                        variant={timelineFilter === option.id ? 'default' : 'outline'}
                        className="h-8 px-3 text-xs"
                        onClick={() => setTimelineFilter(option.id)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <Activity className="h-3 w-3" />
                  {filteredTimeline.length} events shown
                </div>
              </CardHeader>
              <CardContent>
                {recipientTimelineLoading ? (
                  <div className="text-sm text-slate-500">Loading timeline...</div>
                ) : filteredTimeline.length === 0 ? (
                  <div className="text-sm text-slate-400">No activity for this filter.</div>
                ) : (
                  <ScrollArea className="h-[520px] pr-4">
                    <div className="relative space-y-6 border-l-2 border-gray-200 pl-4">
                      {filteredTimeline.map((event) => (
                        <div key={event.id} className="relative">
                          <div className={`absolute -left-[21px] top-0 h-4 w-4 rounded-full ${event.color} border-2 border-white`}></div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{event.label}</p>
                            {event.isBot && (
                              <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                                Bot
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{formatDateTime(event.date)}</p>
                          {event.details && (
                            <p className="mt-1 text-xs text-slate-500">{event.details}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default CampaignTracker;




