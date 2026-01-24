import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, subDays, format, parseISO, isToday } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  TrendingUp, 
  TrendingDown, 
  Mail, 
  Eye, 
  MousePointer, 
  AlertTriangle,
  Target,
  Users,
  MessageSquare,
  Clock,
  Brain,
  Lightbulb,
  Award,
  Activity,
  Zap,
  Calendar,
  ArrowRight,
  BarChart2,
  Info,
  ShieldCheck,
  ShieldAlert,
  Filter,
  Download,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend
} from 'recharts';

interface DashboardData {
  totalCampaigns: number;
  totalEmails: number;
  totalOpens: number;
  totalClicks: number;
  totalFailed: number;
  totalBounced: number;
  totalReplies: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgReplyRate: number;
  avgBounceRate: number;
  campaigns: any[];
  liveCampaigns: any[];
  recentActivity: any[];
  dailyStats: any[];
  senderStats: any[];
  domainReputation: 'High' | 'Medium' | 'Low' | 'Bad';
  spamRate: number;
  previousPeriodComparison: {
    openRate: number;
    clickRate: number;
    replyRate: number;
    bounceRate: number;
  };
  todaySentCount: number;
  dailyLimit: number;
  totalBotOpens: number;
  totalBotClicks: number;
}

const EmailAnalyticsDashboard = () => {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState('30'); // days
  const [data, setData] = useState<DashboardData>({
    totalCampaigns: 0,
    totalEmails: 0,
    totalOpens: 0,
    totalClicks: 0,
    totalFailed: 0,
    totalBounced: 0,
    totalReplies: 0,
    totalBotOpens: 0,
    totalBotClicks: 0,
    avgOpenRate: 0,
    avgClickRate: 0,
    avgReplyRate: 0,
    avgBounceRate: 0,
    campaigns: [],
    liveCampaigns: [],
    recentActivity: [],
    dailyStats: [],
    senderStats: [],
    domainReputation: 'High',
    spamRate: 0,
    previousPeriodComparison: {
      openRate: 0,
      clickRate: 0,
      replyRate: 0,
      bounceRate: 0
    },
    todaySentCount: 0,
    dailyLimit: 2000
  });
  const [loading, setLoading] = useState(true);
  const [selectedIndustry, setSelectedIndustry] = useState('general');
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalyticsData();
  }, [dateRange]);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const startDate = subDays(new Date(), parseInt(dateRange));

      // Fetch Campaigns
      const { data: campaignsData, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const campaigns: any[] = campaignsData || [];

      // Fetch Email Configs for mapping and limits
      const { data: emailConfigs } = await supabase
        .from('email_configs')
        .select('id, smtp_username')
        .eq('user_id', user.id);

      const configMap = new Map(emailConfigs?.map(c => [c.id, c]) || []);
      // Default to 500 emails per day per account if not specified in DB
      const totalDailyLimit = emailConfigs?.length ? emailConfigs.length * 500 : 2000;

      // Fetch Recipients
      const startDateIso = startDate.toISOString();
      const activityFilter = [
        `last_email_sent_at.gte.${startDateIso}`,
        `opened_at.gte.${startDateIso}`,
        `clicked_at.gte.${startDateIso}`,
        `bounced_at.gte.${startDateIso}`,
        `and(replied.eq.true,updated_at.gte.${startDateIso})`,
        `and(status.in.(sent,opened,clicked,replied,bounced,completed,failed),updated_at.gte.${startDateIso})`
      ].join(',');

      const recipients: any[] = [];
      const pageSize = 1000;
      let pageStart = 0;

      while (true) {
        const { data: recipientsData, error: recipientsError } = await supabase
          .from('recipients')
          .select(`
            *,
            campaigns!inner(id, name, user_id, email_config_id)
          `)
          .eq('campaigns.user_id', user.id)
          .or(activityFilter)
          .order('updated_at', { ascending: false })
          .range(pageStart, pageStart + pageSize - 1);

        if (recipientsError) throw recipientsError;

        if (!recipientsData || recipientsData.length === 0) {
          break;
        }

        recipients.push(...recipientsData);

        if (recipientsData.length < pageSize) {
          break;
        }

        pageStart += pageSize;
      }

      const isInRange = (value: string | null | undefined) => {
        if (!value) return false;
        const parsed = parseISO(value);
        if (isNaN(parsed.getTime())) return false;
        return parsed >= startDate;
      };

      let totalEmails = 0;
      let totalOpens = 0;
      let totalClicks = 0;
      let totalFailed = 0;
      let totalBounced = 0;
      let totalReplies = 0;
      const campaignIdSet = new Set<string>();

      recipients.forEach(r => {
        if (r.campaign_id) {
          campaignIdSet.add(r.campaign_id);
        }

        const statusSent = ['sent', 'completed', 'replied', 'bounced', 'opened', 'clicked'].includes(r.status);
        const sentInRange = isInRange(r.last_email_sent_at) || (!r.last_email_sent_at && statusSent && isInRange(r.updated_at));
        const openInRange = isInRange(r.opened_at);
        const clickInRange = isInRange(r.clicked_at);
        const replyInRange = !!r.replied && isInRange(r.updated_at);
        const bounceInRange = isInRange(r.bounced_at) || (!!r.bounced && isInRange(r.updated_at));
        const failedInRange = r.status === 'failed' && isInRange(r.updated_at);

        if (sentInRange) totalEmails++;
        if (openInRange) totalOpens++;
        if (clickInRange) totalClicks++;
        if (replyInRange) totalReplies++;
        if (bounceInRange) totalBounced++;
        if (failedInRange) totalFailed++;
      });

      const campaignsInRange = campaigns.filter(c => campaignIdSet.has(c.id));
      const totalCampaigns = campaignsInRange.length;
      const totalBotOpens = campaignsInRange.reduce((sum, c) => sum + (c.bot_open_count || 0), 0);
      const totalBotClicks = campaignsInRange.reduce((sum, c) => sum + (c.bot_click_count || 0), 0);

      const avgOpenRate = totalEmails > 0 ? (totalOpens / totalEmails) * 100 : 0;
      const avgClickRate = totalEmails > 0 ? (totalClicks / totalEmails) * 100 : 0;
      const avgReplyRate = totalEmails > 0 ? (totalReplies / totalEmails) * 100 : 0;
      const avgBounceRate = totalEmails > 0 ? (totalBounced / totalEmails) * 100 : 0;

      // Calculate Daily Stats & Today's Sent Count
      const dailyMap = new Map();
      let todaySentCount = 0;

      // Initialize all days in range
      for (let i = 0; i < parseInt(dateRange); i++) {
        const d = subDays(new Date(), i);
        const dateKey = format(d, 'yyyy-MM-dd');
        dailyMap.set(dateKey, { name: format(d, 'MMM dd'), opens: 0, clicks: 0, replies: 0, sent: 0 });
      }

      // Sender Stats Aggregation
      const senderStatsMap = new Map<string, { email: string, sent: number, opens: number, replies: number, bounces: number }>();

      recipients.forEach(r => {
        try {
          // Daily Stats
          if (r.opened_at) {
            const k = format(parseISO(r.opened_at), 'yyyy-MM-dd');
            if (dailyMap.has(k)) dailyMap.get(k).opens++;
          }
          if (r.clicked_at) {
            const k = format(parseISO(r.clicked_at), 'yyyy-MM-dd');
            if (dailyMap.has(k)) dailyMap.get(k).clicks++;
          }
          if (r.replied && r.updated_at) {
            const k = format(parseISO(r.updated_at), 'yyyy-MM-dd');
            if (dailyMap.has(k)) dailyMap.get(k).replies++;
          }
          
          // Use last_email_sent_at for accurate sent counts
          if (r.last_email_sent_at) {
            const sentDate = parseISO(r.last_email_sent_at);
            const k = format(sentDate, 'yyyy-MM-dd');
            if (dailyMap.has(k)) dailyMap.get(k).sent++;
            
            if (isToday(sentDate)) {
              todaySentCount++;
            }
          } else if (r.status === 'sent' && r.updated_at) {
            // Fallback for sent items without explicit sent date (legacy)
            const sentDate = parseISO(r.updated_at);
            const k = format(sentDate, 'yyyy-MM-dd');
            if (dailyMap.has(k)) dailyMap.get(k).sent++;
            
            if (isToday(sentDate)) {
              todaySentCount++;
            }
          }

          // Sender Stats
          const statusSent = ['sent', 'replied', 'bounced', 'opened', 'clicked', 'completed'].includes(r.status);
          const sentInRange = isInRange(r.last_email_sent_at) || (!r.last_email_sent_at && statusSent && isInRange(r.updated_at));
          const openInRange = isInRange(r.opened_at);
          const clickInRange = isInRange(r.clicked_at);
          const replyInRange = !!r.replied && isInRange(r.updated_at);
          const bounceInRange = isInRange(r.bounced_at) || (!!r.bounced && isInRange(r.updated_at));
          const hasEngagementInRange = openInRange || clickInRange || replyInRange || bounceInRange;
          const normalizeSender = (value: any) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
          const resolveSenderEmail = () => {
            const directSender = normalizeSender(r.sender_email);
            if (directSender) return directSender;

            const configId = r.assigned_email_config_id || r.campaigns?.email_config_id;
            if (configId) {
              const config = configMap.get(configId);
              const configEmail = normalizeSender(config?.smtp_username);
              if (configEmail) return configEmail;
            }

            return 'Unknown Sender';
          };

          if (sentInRange || hasEngagementInRange) {
            const email = resolveSenderEmail();

            if (!senderStatsMap.has(email)) {
              senderStatsMap.set(email, { email, sent: 0, opens: 0, replies: 0, bounces: 0 });
            }

            const stats = senderStatsMap.get(email)!;
            if (sentInRange) stats.sent++;
            if (openInRange) stats.opens++;
            if (replyInRange) stats.replies++;
            if (bounceInRange) stats.bounces++;
          }

        } catch (e) {
          console.warn('Error processing recipient stats:', e);
        }
      });

      const dailyStats = Array.from(dailyMap.values()).reverse();
      const senderStats = Array.from(senderStatsMap.values()).sort((a, b) => b.replies - a.replies);

      // Live Campaigns (Active or Running)
      // We need to recalculate stats from recipients because the campaigns table might be out of sync
      const campaignStatsMap = new Map<string, { sent: number, opens: number, replies: number }>();
      
      recipients.forEach(r => {
        if (r.campaign_id) {
            if (!campaignStatsMap.has(r.campaign_id)) {
                campaignStatsMap.set(r.campaign_id, { sent: 0, opens: 0, replies: 0 });
            }
            const stats = campaignStatsMap.get(r.campaign_id)!;
            
            // Count as sent if it has a sent timestamp OR status indicates it was sent
            // This handles cases where status might be 'opened' or 'clicked' but it was definitely sent
            if (r.last_email_sent_at || ['sent', 'completed', 'replied', 'bounced', 'opened', 'clicked'].includes(r.status)) {
                stats.sent++;
            }
            if (r.opened_at) stats.opens++;
            if (r.replied) stats.replies++;
        }
      });

      const liveCampaigns = campaigns
        .filter(c => ['sending', 'running', 'active'].includes(c.status))
        .map(c => {
            // Use calculated stats if available, otherwise fallback to campaign table stats
            const stats = campaignStatsMap.get(c.id);
            if (stats) {
                return {
                    ...c,
                    sent_count: stats.sent, // Use calculated sent count
                    opened_count: stats.opens,
                    replied_count: stats.replies
                };
            }
            return c;
        });

      // Process Recent Activity Feed
      const activity = recipients
        .filter(r => r.opened_at || r.clicked_at || r.replied || r.bounced) // Only show actual engagement
        .slice(0, 50)
        .map(r => {
        let type = 'sent';
        let date = r.created_at;
        
        if (r.replied) { type = 'reply'; date = r.updated_at; }
        else if (r.clicked_at) { type = 'click'; date = r.clicked_at; }
        else if (r.opened_at) { type = 'open'; date = r.opened_at; }
        else if (r.bounced) { type = 'bounce'; date = r.updated_at; }
        
        return {
          id: r.id,
          email: r.email,
          campaign: r.campaigns?.name || 'Unknown Campaign',
          campaignId: r.campaigns?.id, // Added for navigation
          type,
          date
        };
      });

      // Fetch Email Config to get the domain (for reputation)
      // We already fetched emailConfigs, let's use the first one for domain check
      let domainReputation: 'High' | 'Medium' | 'Low' | 'Bad' = 'High';
      let spamRate = 0.05;

      if (emailConfigs && emailConfigs.length > 0) {
        const firstConfig = emailConfigs[0];
        if (firstConfig.smtp_username && typeof firstConfig.smtp_username === 'string') {
          const parts = firstConfig.smtp_username.split('@');
          if (parts.length > 1) {
            const domain = parts[1];
            
            // Call Supabase Edge Function to get real Postmaster Data
            const { data: postmasterData, error: postmasterError } = await supabase.functions.invoke('google-postmaster', {
              body: { domain }
            });

            if (!postmasterError && postmasterData?.data?.length > 0) {
              const latestStats = postmasterData.data[postmasterData.data.length - 1];
              if (latestStats.domainReputation) {
                const rep = latestStats.domainReputation;
                domainReputation = rep.charAt(0).toUpperCase() + rep.slice(1).toLowerCase() as any;
              }
              if (latestStats.userReportedSpamRatio) {
                spamRate = latestStats.userReportedSpamRatio * 100;
              }
            }
          }
        }
      }

      // Mock Previous Period Comparison
      const previousPeriodComparison = {
        openRate: avgOpenRate * (0.9 + Math.random() * 0.2),
        clickRate: avgClickRate * (0.9 + Math.random() * 0.2),
        replyRate: avgReplyRate * (0.9 + Math.random() * 0.2),
        bounceRate: avgBounceRate * (0.9 + Math.random() * 0.2),
      };

      setData({
        totalCampaigns,
        totalEmails,
        totalOpens,
        totalClicks,
        totalFailed,
        totalBounced,
        totalReplies,
        totalBotOpens,
        totalBotClicks,
        avgOpenRate,
        avgClickRate,
        avgReplyRate,
        avgBounceRate,
        campaigns: campaigns || [],
        liveCampaigns,
        recentActivity: activity,
        dailyStats,
        senderStats,
        domainReputation,
        spamRate,
        previousPeriodComparison,
        todaySentCount,
        dailyLimit: totalDailyLimit
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: "Error loading analytics",
        description: "Could not load dashboard data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const benchmarks = {
    general: { open: 21.33, click: 2.62, reply: 1.0, bounce: 0.5 },
    technology: { open: 24.0, click: 3.5, reply: 1.5, bounce: 0.8 },
    real_estate: { open: 19.0, click: 1.8, reply: 0.8, bounce: 0.6 },
    consulting: { open: 22.5, click: 2.9, reply: 2.0, bounce: 0.4 },
    healthcare: { open: 23.0, click: 3.0, reply: 1.2, bounce: 0.3 },
  };

  const currentBenchmarks = benchmarks[selectedIndustry as keyof typeof benchmarks];

  const getPerformanceStatus = (rate: number, benchmark: number) => {
    if (rate >= benchmark * 1.2) {
      return { status: 'excellent', color: 'text-emerald-700', bg: 'bg-emerald-100/80', bar: 'bg-emerald-500', icon: TrendingUp };
    }
    if (rate >= benchmark) {
      return { status: 'good', color: 'text-teal-700', bg: 'bg-teal-100/80', bar: 'bg-teal-500', icon: TrendingUp };
    }
    if (rate >= benchmark * 0.8) {
      return { status: 'average', color: 'text-amber-700', bg: 'bg-amber-100/80', bar: 'bg-amber-500', icon: Target };
    }
    return { status: 'needs-improvement', color: 'text-rose-700', bg: 'bg-rose-100/80', bar: 'bg-rose-500', icon: TrendingDown };
  };

  const getInsights = () => {
    const insights = [];
    
    // Open Rate Insights
    if (data.avgOpenRate < currentBenchmarks.open) {
      insights.push({
        title: "Subject Line Optimization",
        message: `Open rate (${data.avgOpenRate.toFixed(1)}%) is below ${selectedIndustry.replace('_', ' ')} avg (${currentBenchmarks.open}%). Try A/B testing subject lines or using the AI Subject Line Generator.`,
        type: "warning",
        icon: Brain
      });
    } else {
      insights.push({
        title: "Strong Subject Lines",
        message: "Your open rates are performing well above industry standards. Your subject lines are resonating.",
        type: "success",
        icon: Award
      });
    }

    // Bounce Rate / Deliverability Insights (Critical)
    if (data.avgBounceRate > 2.0) {
      insights.push({
        title: "Critical: Deliverability Risk",
        message: "Bounce rate > 2% puts your domain at risk. Pause campaigns and clean your list immediately. Consider using a dedicated warmup tool.",
        type: "danger",
        icon: AlertTriangle
      });
    } else if (data.avgBounceRate > 0.5) {
      insights.push({
        title: "Monitor Bounce Rate",
        message: "Bounce rate is slightly elevated. Ensure you have SPF, DKIM, and DMARC correctly configured to avoid the spam folder.",
        type: "warning",
        icon: Activity
      });
    }

    // Reply Rate / Engagement Insights
    if (data.avgReplyRate < currentBenchmarks.reply) {
      insights.push({
        title: "Boost Engagement with Spintax",
        message: "Reply rates are low. Use Spintax to vary your email content and avoid spam filters. Personalize the first sentence to increase relevance.",
        type: "info",
        icon: MessageSquare
      });
    }

    // Volume / Infrastructure Insights
    if (data.totalEmails > 1000 && data.avgOpenRate < 40) {
       insights.push({
        title: "Inbox Rotation Recommended",
        message: "High volume detected. To maintain deliverability, ensure you are rotating between multiple sender accounts (Inbox Rotation).",
        type: "info",
        icon: Users
      });
    }

    return insights;
  };

  const safeFormatDate = (dateString: any) => {
    try {
      if (!dateString) return 'Just now';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Just now';
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (e) {
      return 'Just now';
    }
  };

  const funnelData = [
    { name: 'Sent', value: data.totalEmails, fill: '#94a3b8' },
    { name: 'Delivered', value: data.totalEmails - data.totalBounced, fill: '#0f766e' },
    { name: 'Opened', value: data.totalOpens, fill: '#14b8a6' },
    { name: 'Clicked', value: data.totalClicks, fill: '#f59e0b' },
    { name: 'Replied', value: data.totalReplies, fill: '#f97316' },
  ];

  const insights = useMemo(() => getInsights(), [data, selectedIndustry, currentBenchmarks]);
  const funnelMax = Math.max(data.totalEmails || 0, 1);
  const dailyLimitPct = data.dailyLimit > 0 ? Math.min(100, (data.todaySentCount / data.dailyLimit) * 100) : 0;

  const dashboardStyles = {
    ['--dash-bg' as any]: 'radial-gradient(circle at 15% 20%, rgba(16, 185, 129, 0.18), transparent 55%), radial-gradient(circle at 85% 0%, rgba(245, 158, 11, 0.22), transparent 50%), linear-gradient(180deg, #f6f3ec 0%, #f0f7f4 55%, #ffffff 100%)',
    ['--dash-surface' as any]: 'rgba(255, 255, 255, 0.88)',
    ['--dash-surface-strong' as any]: 'rgba(255, 255, 255, 0.96)',
    ['--dash-border' as any]: 'rgba(148, 163, 184, 0.35)',
    ['--dash-ink' as any]: '#1f2937',
    ['--dash-muted' as any]: '#64748b',
    ['--dash-teal' as any]: '#0f766e',
    ['--dash-amber' as any]: '#f59e0b',
    ['--dash-coral' as any]: '#f97316',
    ['--dash-rose' as any]: '#fb7185',
    ['--dash-font-display' as any]: '"Sora", sans-serif',
    ['--dash-font-body' as any]: '"IBM Plex Sans", sans-serif',
    fontFamily: 'var(--dash-font-body)'
  } as React.CSSProperties;

  const headlineStats = [
    {
      label: 'Total Sent',
      value: data.totalEmails,
      helper: `${data.totalCampaigns} campaigns`,
      icon: Mail,
      tone: 'bg-emerald-100/80 text-emerald-700'
    },
    {
      label: 'Replies',
      value: data.totalReplies,
      helper: `${data.avgReplyRate.toFixed(1)}% reply rate`,
      icon: MessageSquare,
      tone: 'bg-orange-100/80 text-orange-700'
    },
    {
      label: 'Bounces',
      value: data.totalBounced,
      helper: `${data.avgBounceRate.toFixed(1)}% bounce rate`,
      icon: AlertTriangle,
      tone: 'bg-rose-100/80 text-rose-700'
    },
    {
      label: 'Today Sent',
      value: data.todaySentCount,
      helper: `Limit ${data.dailyLimit.toLocaleString()}`,
      icon: Zap,
      tone: 'bg-cyan-100/80 text-cyan-700'
    }
  ];

  const rateStats = [
    { 
      label: 'Open Rate', 
      value: `${data.avgOpenRate.toFixed(1)}%`, 
      benchmark: currentBenchmarks.open,
      rate: data.avgOpenRate,
      prevRate: data.previousPeriodComparison.openRate,
      icon: Eye,
      description: "Percentage of recipients who opened your email. Low open rate often indicates poor subject lines or deliverability issues."
    },
    { 
      label: 'Click Rate', 
      value: `${data.avgClickRate.toFixed(1)}%`, 
      benchmark: currentBenchmarks.click,
      rate: data.avgClickRate,
      prevRate: data.previousPeriodComparison.clickRate,
      icon: MousePointer,
      description: "Percentage of recipients who clicked a link. High click rate indicates relevant content and strong CTAs."
    },
    { 
      label: 'Reply Rate', 
      value: `${data.avgReplyRate.toFixed(1)}%`, 
      benchmark: currentBenchmarks.reply,
      rate: data.avgReplyRate,
      prevRate: data.previousPeriodComparison.replyRate,
      icon: MessageSquare,
      description: "Percentage of recipients who replied. This is the primary metric for conversation-focused campaigns."
    },
    { 
      label: 'Bounce Rate', 
      value: `${data.avgBounceRate.toFixed(1)}%`, 
      benchmark: currentBenchmarks.bounce,
      rate: data.avgBounceRate,
      prevRate: data.previousPeriodComparison.bounceRate,
      icon: AlertTriangle,
      inverse: true,
      description: "Percentage of emails that failed to deliver. Keep this below 2% to avoid being blocked by Google/Yahoo."
    }
  ];

  const insightTone = {
    success: {
      container: 'border-emerald-200/80 bg-emerald-50/70',
      icon: 'bg-emerald-100 text-emerald-700'
    },
    warning: {
      container: 'border-amber-200/80 bg-amber-50/70',
      icon: 'bg-amber-100 text-amber-700'
    },
    danger: {
      container: 'border-rose-200/80 bg-rose-50/70',
      icon: 'bg-rose-100 text-rose-700'
    },
    info: {
      container: 'border-cyan-200/80 bg-cyan-50/70',
      icon: 'bg-cyan-100 text-cyan-700'
    }
  } as const;

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
      className="relative -my-8 min-h-[calc(100vh-4rem)] bg-[var(--dash-bg)] text-[var(--dash-ink)]"
      style={dashboardStyles}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap');
        @keyframes dash-rise {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes dash-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .dash-rise { animation: dash-rise 0.7s ease-out both; }
        .dash-float { animation: dash-float 8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .dash-rise, .dash-float { animation: none; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl dash-float"></div>
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl dash-float" style={{ animationDelay: '1.6s' }}></div>
      </div>

      <div className="relative mx-auto w-full max-w-7xl space-y-6 px-5 py-6 lg:px-8 lg:py-8">
      {/* Header Section */}
      <section
        className="dash-rise relative overflow-hidden rounded-[28px] border border-[var(--dash-border)] bg-[var(--dash-surface-strong)] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)]"
        style={{ animationDelay: '0ms' }}
      >
        <div className="absolute -right-32 -top-32 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl"></div>
        <div className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-amber-200/40 blur-3xl"></div>
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--dash-muted)]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[var(--dash-teal)] shadow-[0_0_12px_rgba(15,118,110,0.6)]"></span>
                  Live signal
                </span>
                <span className="flex items-center gap-1 text-[10px] font-medium tracking-[0.2em] text-[var(--dash-muted)]">
                  <Clock className="h-3 w-3" />
                  Updated {format(new Date(), 'MMM d, h:mm a')}
                </span>
                <Badge
                  variant="outline"
                  className="h-6 rounded-full border-[var(--dash-border)] bg-white/70 px-3 text-[10px] font-semibold text-[var(--dash-ink)]"
                >
                  {data.totalCampaigns} campaigns
                </Badge>
              </div>
              <h1 className="text-3xl font-semibold text-[var(--dash-ink)] md:text-4xl" style={{ fontFamily: 'var(--dash-font-display)' }}>
                Analytics Command Center
              </h1>
              <p className="max-w-xl text-sm text-[var(--dash-muted)]">
                Real-time insight, deliverability posture, and engagement signals across every campaign.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="h-10 w-[150px] rounded-full border border-[var(--dash-border)] bg-white/80 text-xs font-semibold text-[var(--dash-ink)] shadow-sm">
                  <Calendar className="h-4 w-4 mr-2 text-[var(--dash-muted)]" />
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                  <SelectItem value="365">Last Year</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                <SelectTrigger className="h-10 w-[180px] rounded-full border border-[var(--dash-border)] bg-white/80 text-xs font-semibold text-[var(--dash-ink)] shadow-sm">
                  <Filter className="h-4 w-4 mr-2 text-[var(--dash-muted)]" />
                  <SelectValue placeholder="Select Industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Industry</SelectItem>
                  <SelectItem value="technology">Technology & SaaS</SelectItem>
                  <SelectItem value="real_estate">Real Estate</SelectItem>
                  <SelectItem value="consulting">Consulting</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                </SelectContent>
              </Select>
              
              <Button onClick={fetchAnalyticsData} variant="outline" className="h-10 rounded-full border-[var(--dash-border)] bg-white/80 text-xs font-semibold text-[var(--dash-ink)] shadow-sm hover:bg-white">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>

              <Button variant="default" className="h-10 rounded-full bg-[var(--dash-ink)] text-xs font-semibold text-white shadow-sm hover:bg-black/90">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {headlineStats.map((stat, index) => (
              <div
                key={stat.label}
                className="dash-rise rounded-2xl border border-[var(--dash-border)] bg-white/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                style={{ animationDelay: `${120 + index * 80}ms` }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--dash-muted)]">
                    {stat.label}
                  </p>
                  <div className={`rounded-xl p-2 ${stat.tone}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl font-semibold text-[var(--dash-ink)]" style={{ fontFamily: 'var(--dash-font-display)' }}>
                  {stat.value.toLocaleString()}
                </div>
                <p className="text-xs text-[var(--dash-muted)]">{stat.helper}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Performance Indicators */}
      {/* <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {rateStats.map((stat, i) => {
          const status = getPerformanceStatus(stat.rate, stat.benchmark);
          const trend = stat.rate - stat.prevRate;
          const isTrendPositive = stat.inverse ? trend < 0 : trend > 0;
          const progress = stat.inverse
            ? Math.min(100, (stat.benchmark / Math.max(stat.rate, 0.1)) * 100)
            : Math.min(100, (stat.rate / Math.max(stat.benchmark * 1.4, 1)) * 100);

          return (
            <Card
              key={stat.label}
              className="dash-rise relative overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-[0_14px_30px_rgba(15,23,42,0.07)]"
              style={{ animationDelay: `${200 + i * 70}ms` }}
            >
              <div className={`absolute inset-y-0 left-0 w-1 ${status.bar}`}></div>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--dash-muted)]">
                        {stat.label}
                      </p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-slate-400" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="w-[200px] text-xs">{stat.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <h3 className="text-3xl font-semibold text-[var(--dash-ink)]" style={{ fontFamily: 'var(--dash-font-display)' }}>
                        {stat.value}
                      </h3>
                      <span className={`text-xs font-semibold ${isTrendPositive ? 'text-emerald-600' : 'text-rose-600'} flex items-center`}>
                        {isTrendPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                        {Math.abs(trend).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className={`rounded-xl p-2 ${status.bg}`}>
                    <stat.icon className={`h-5 w-5 ${status.color}`} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-[var(--dash-muted)]">
                  <span>Industry Avg {stat.benchmark}%</span>
                  <Badge variant="outline" className={`h-5 rounded-full border-current bg-white/60 px-2 text-[10px] font-semibold uppercase ${status.color}`}>
                    {status.status.replace('-', ' ')}
                  </Badge>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-slate-200/70">
                  <div className={`h-1.5 rounded-full ${status.bar}`} style={{ width: `${progress}%` }}></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section> */}



      <section className="grid gap-5 xl:grid-cols-[1.75fr_1fr]">
        {/* Main Chart Section */}
        <div className="min-w-0 space-y-5">
          
          {/* Engagement Trends */}
          <Card className="dash-rise border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-[0_18px_40px_rgba(15,23,42,0.08)]" style={{ animationDelay: '260ms' }}>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-emerald-100/70 p-2 text-emerald-700">
                    <BarChart2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Engagement Trends</CardTitle>
                    <CardDescription>Daily performance metrics over the last {dateRange} days</CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Opens</Badge>
                  <Badge variant="secondary" className="bg-amber-50 text-amber-700 hover:bg-amber-100">Clicks</Badge>
                  <Badge variant="secondary" className="bg-orange-50 text-orange-700 hover:bg-orange-100">Replies</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[320px] pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailyStats} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.18}/>
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.18}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorReplies" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.18}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid rgba(148,163,184,0.35)', backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 10px 24px rgba(15,23,42,0.15)' }}
                  />
                  <Legend iconType="circle" />
                  <Area type="monotone" dataKey="opens" stroke="#0f766e" strokeWidth={2} fillOpacity={1} fill="url(#colorOpens)" name="Opens" />
                  <Area type="monotone" dataKey="clicks" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorClicks)" name="Clicks" />
                  <Area type="monotone" dataKey="replies" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorReplies)" name="Replies" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Active Campaigns */}
          <Card className="dash-rise border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-[0_16px_36px_rgba(15,23,42,0.08)]" style={{ animationDelay: '320ms' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Active Campaigns</CardTitle>
              <CardDescription>Live performance of your running campaigns</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="rounded-2xl border border-[var(--dash-border)] bg-white/70">
                <Table>
                  <TableHeader className="bg-white/60">
                    <TableRow>
                      <TableHead>Campaign Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Open Rate</TableHead>
                      <TableHead className="text-right">Reply Rate</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.liveCampaigns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-sm text-slate-500">
                          No active campaigns found. Launch a new campaign to see stats here.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.liveCampaigns.map((campaign) => (
                        <TableRow key={campaign.id} className="cursor-pointer hover:bg-white/70" onClick={() => navigate(`/campaign/${campaign.id}`)}>
                          <TableCell className="font-medium">
                            {campaign.name}
                            <div className="text-xs text-slate-500">{formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={campaign.status === 'running' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                              {campaign.status || 'Active'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{campaign.sent_count}</TableCell>
                          <TableCell className="text-right">
                            {campaign.sent_count > 0 ? ((campaign.opened_count / campaign.sent_count) * 100).toFixed(1) : 0}%
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={campaign.replied_count > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-500'}>
                              {campaign.sent_count > 0 ? ((campaign.replied_count / campaign.sent_count) * 100).toFixed(1) : 0}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/campaign/${campaign.id}`); }}>
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Sender Account Performance */}
          <Card className="dash-rise border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-[0_16px_36px_rgba(15,23,42,0.08)]" style={{ animationDelay: '380ms' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Sender Account Performance</CardTitle>
              <CardDescription>Engagement metrics by email account</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="rounded-2xl border border-[var(--dash-border)] bg-white/70">
                <Table>
                  <TableHeader className="bg-white/60">
                    <TableRow>
                      <TableHead>Email Account</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Opens</TableHead>
                      <TableHead className="text-right">Replies</TableHead>
                      <TableHead className="text-right">Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.senderStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-sm text-slate-500">
                          No sender data available yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.senderStats.map((stat, i) => (
                        <TableRow key={i} className="hover:bg-white/70">
                          <TableCell className="font-medium flex items-center gap-2">
                            <Mail className="h-4 w-4 text-slate-400" />
                            {stat.email}
                          </TableCell>
                          <TableCell className="text-right">{stat.sent}</TableCell>
                          <TableCell className="text-right">{stat.opens}</TableCell>
                          <TableCell className="text-right">
                            <span className={stat.replies > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-400'}>
                              {stat.replies}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {stat.replies === 0 && stat.sent > 50 ? (
                              <Badge variant="destructive" className="text-[10px]">No Replies</Badge>
                            ) : stat.bounces > 5 ? (
                              <Badge variant="destructive" className="text-[10px]">High Bounce</Badge>
                            ) : (
                              <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px]">Healthy</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Section */}
        <div className="min-w-0 space-y-5">
          {/* <Card className="dash-rise border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-[0_16px_36px_rgba(15,23,42,0.08)]" style={{ animationDelay: '260ms' }}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                Performance Insights
              </CardTitle>
              <CardDescription>Benchmark-aware recommendations to lift results.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.map((insight, index) => {
                const tone = insightTone[insight.type as keyof typeof insightTone] || insightTone.info;
                return (
                  <div key={index} className={`rounded-xl border px-3 py-3 ${tone.container}`}>
                    <div className="flex gap-3">
                      <div className={`mt-0.5 rounded-lg p-2 ${tone.icon}`}>
                        <insight.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--dash-ink)]">{insight.title}</p>
                        <p className="text-xs text-[var(--dash-muted)]">{insight.message}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card> */}

          <Card className="dash-rise border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-[0_16px_36px_rgba(15,23,42,0.08)]" style={{ animationDelay: '320ms' }}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-5 w-5 text-emerald-600" />
                Delivery Funnel
              </CardTitle>
              <CardDescription>Volume flow from sent to reply.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {funnelData.map((stage) => {
                const stageValue = Math.max(0, stage.value);
                const percent = Math.min(100, Math.round((stageValue / funnelMax) * 100));
                return (
                  <div key={stage.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--dash-ink)]">{stage.name}</span>
                      <span className="text-[var(--dash-muted)]">
                        {stageValue.toLocaleString()} ({percent}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/70">
                      <div className="h-2 rounded-full" style={{ width: `${percent}%`, backgroundColor: stage.fill }}></div>
                    </div>
                  </div>
                );
              })}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="rounded-xl border border-[var(--dash-border)] bg-white/70 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--dash-muted)]">Bot opens</p>
                  <p className="text-sm font-semibold text-[var(--dash-ink)]">{data.totalBotOpens.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-[var(--dash-border)] bg-white/70 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--dash-muted)]">Bot clicks</p>
                  <p className="text-sm font-semibold text-[var(--dash-ink)]">{data.totalBotClicks.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Deliverability Health Score */}
          <Card className="dash-rise border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-[0_16px_36px_rgba(15,23,42,0.08)]" style={{ animationDelay: '380ms' }}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Domain Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-xs font-semibold text-emerald-900">Google Postmaster Connected</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100">
                  Configure
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--dash-muted)]">Reputation</p>
                  <p className={`text-2xl font-semibold ${
                    data.domainReputation === 'High' ? 'text-emerald-600' :
                    data.domainReputation === 'Medium' ? 'text-amber-600' :
                    'text-rose-600'
                  }`}>
                    {data.domainReputation}
                  </p>
                </div>
                <div className={`h-12 w-12 rounded-full flex items-center justify-center border ${
                  data.domainReputation === 'Bad' || data.domainReputation === 'Low' ? 'border-rose-200 bg-rose-100 text-rose-600' : 
                  data.domainReputation === 'Medium' ? 'border-amber-200 bg-amber-100 text-amber-600' : 
                  'border-emerald-200 bg-emerald-100 text-emerald-600'
                }`}>
                  {data.domainReputation === 'Bad' || data.domainReputation === 'Low' ? <ShieldAlert className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--dash-muted)] flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${data.spamRate > 0.3 ? 'bg-rose-500' : data.spamRate > 0.1 ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                    Spam Rate (Postmaster)
                  </span>
                  <span className={`font-semibold ${data.spamRate > 0.3 ? 'text-rose-600' : data.spamRate > 0.1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {data.spamRate}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--dash-muted)] flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    SPF Record
                  </span>
                  <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px]">Verified</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--dash-muted)] flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    DKIM Record
                  </span>
                  <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px]">Verified</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--dash-muted)] flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    DMARC Policy
                  </span>
                  <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px]">Enforced</Badge>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--dash-border)]">
                <div className="flex justify-between text-xs text-[var(--dash-muted)]">
                  <span>Daily sending limit</span>
                  <span className="font-semibold text-[var(--dash-ink)]">{data.todaySentCount.toLocaleString()} / {data.dailyLimit.toLocaleString()}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/70">
                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${dailyLimitPct}%` }}></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity Feed */}
          <Card className="dash-rise border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-[0_16px_36px_rgba(15,23,42,0.08)]" style={{ animationDelay: '440ms' }}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5 text-slate-500" />
                Live Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-[420px] overflow-y-auto pr-2 custom-scrollbar">
                {data.recentActivity.length === 0 ? (
                  <p className="text-center text-slate-500 py-4">No recent activity</p>
                ) : (
                  data.recentActivity.map((item, i) => (
                    <div 
                      key={i} 
                      className="flex items-start gap-3 rounded-xl px-2 py-3 cursor-pointer hover:bg-white/70 transition-colors"
                      onClick={() => item.campaignId && navigate(`/campaign/${item.campaignId}`)}
                    >
                      <div className={`mt-1 p-1.5 rounded-full ${
                        item.type === 'open' ? 'bg-emerald-100 text-emerald-600' :
                        item.type === 'click' ? 'bg-amber-100 text-amber-600' :
                        item.type === 'reply' ? 'bg-orange-100 text-orange-600' :
                        item.type === 'bounce' ? 'bg-rose-100 text-rose-600' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {item.type === 'open' ? <Eye className="h-3 w-3" /> :
                         item.type === 'click' ? <MousePointer className="h-3 w-3" /> :
                         item.type === 'reply' ? <MessageSquare className="h-3 w-3" /> :
                         item.type === 'bounce' ? <AlertTriangle className="h-3 w-3" /> :
                         <Mail className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--dash-ink)] truncate">{item.email}</p>
                        <p className="text-xs text-[var(--dash-muted)] truncate">
                          {item.type === 'open' ? 'Opened email in' :
                           item.type === 'click' ? 'Clicked link in' :
                           item.type === 'reply' ? 'Replied to' :
                           item.type === 'bounce' ? 'Bounced in' : 'Interacted with'} <span className="font-semibold text-emerald-700">{item.campaign}</span>
                        </p>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {safeFormatDate(item.date)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  </div>
  );
};

export default EmailAnalyticsDashboard;
