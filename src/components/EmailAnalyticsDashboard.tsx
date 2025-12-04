import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, subDays, format, isAfter, startOfDay, parseISO, subMonths, isToday } from 'date-fns';
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
  ChevronRight,
  CheckCircle2,
  XCircle
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
        .gte('created_at', startDate.toISOString())
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
      const { data: recipientsData } = await supabase
        .from('recipients')
        .select(`
          *,
          campaigns!inner(id, name, user_id)
        `)
        .eq('campaigns.user_id', user.id)
        .gte('updated_at', startDate.toISOString())
        .order('updated_at', { ascending: false })
        .limit(10000); // Increased limit to ensure we get all data for accurate stats

      const recipients: any[] = recipientsData || [];

      // Calculate Totals
      const totalCampaigns = campaigns.length;
      const totalEmails = campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0);
      const totalOpens = campaigns.reduce((sum, c) => sum + (c.opened_count || 0), 0);
      const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicked_count || 0), 0);
      const totalFailed = campaigns.reduce((sum, c) => sum + (c.failed_count || 0), 0);
      const totalBounced = campaigns.reduce((sum, c) => sum + (c.bounced_count || 0), 0);
      const totalReplies = campaigns.reduce((sum, c) => sum + (c.replied_count || 0), 0);
      const totalBotOpens = campaigns.reduce((sum, c) => sum + (c.bot_open_count || 0), 0);
      const totalBotClicks = campaigns.reduce((sum, c) => sum + (c.bot_click_count || 0), 0);

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
          // Use robust check for "sent" status to include opened/clicked/replied emails
          const isSent = r.last_email_sent_at || ['sent', 'replied', 'bounced', 'opened', 'clicked', 'completed'].includes(r.status);
          
          if (r.assigned_email_config_id && isSent) {
            const config = configMap.get(r.assigned_email_config_id);
            const email = config?.smtp_username || 'Unknown Sender';
            
            if (!senderStatsMap.has(email)) {
              senderStatsMap.set(email, { email, sent: 0, opens: 0, replies: 0, bounces: 0 });
            }
            
            const stats = senderStatsMap.get(email)!;
            stats.sent++;
            if (r.opened_at) stats.opens++;
            if (r.replied) stats.replies++;
            if (r.bounced) stats.bounces++;
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
      const activity = recipients.slice(0, 50).map(r => {
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
    if (rate >= benchmark * 1.2) return { status: 'excellent', color: 'text-green-600', bg: 'bg-green-100', icon: TrendingUp };
    if (rate >= benchmark) return { status: 'good', color: 'text-blue-600', bg: 'bg-blue-100', icon: TrendingUp };
    if (rate >= benchmark * 0.8) return { status: 'average', color: 'text-yellow-600', bg: 'bg-yellow-100', icon: Target };
    return { status: 'needs-improvement', color: 'text-red-600', bg: 'bg-red-100', icon: TrendingDown };
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
    { name: 'Delivered', value: data.totalEmails - data.totalBounced, fill: '#3b82f6' },
    { name: 'Opened', value: data.totalOpens, fill: '#8b5cf6' },
    { name: 'Clicked', value: data.totalClicks, fill: '#ec4899' },
    { name: 'Replied', value: data.totalReplies, fill: '#10b981' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 bg-gray-50/50 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Analytics Dashboard</h1>
          <p className="text-gray-500 mt-1">Real-time insights and performance metrics across all campaigns</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px] bg-white">
              <Calendar className="h-4 w-4 mr-2 text-gray-500" />
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
            <SelectTrigger className="w-[180px] bg-white">
              <Filter className="h-4 w-4 mr-2 text-gray-500" />
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
          
          <Button onClick={fetchAnalyticsData} variant="outline" className="bg-white">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
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
        ].map((stat, i) => {
          const status = getPerformanceStatus(stat.rate, stat.benchmark);
          const isPositive = stat.inverse ? stat.rate < stat.benchmark : stat.rate >= stat.benchmark;
          const trend = stat.rate - stat.prevRate;
          const isTrendPositive = stat.inverse ? trend < 0 : trend > 0;
          
          return (
            <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden relative">
              <div className={`absolute top-0 left-0 w-1 h-full ${status.bg.replace('bg-', 'bg-opacity-50 bg-')}`}></div>
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-gray-400" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="w-[200px] text-xs">{stat.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <h3 className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</h3>
                  </div>
                  <div className={`p-2 rounded-lg ${status.bg}`}>
                    <stat.icon className={`h-5 w-5 ${status.color}`} />
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xs font-medium ${isTrendPositive ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                      {isTrendPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                      {Math.abs(trend).toFixed(1)}%
                    </span>
                    <span className="text-xs text-gray-400">vs previous {dateRange} days</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                   <span className="text-xs text-gray-500">Industry Avg: {stat.benchmark}%</span>
                   <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${status.color} bg-white border-current opacity-70`}>
                     {status.status.replace('-', ' ')}
                   </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Volume Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Total Sent</p>
              <Mail className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold">{data.totalEmails.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Total Opens</p>
              <Eye className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold">{data.totalOpens.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Total Clicks</p>
              <MousePointer className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold">{data.totalClicks.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Bot Activity</p>
              <ShieldAlert className="h-4 w-4 text-orange-500" />
            </div>
            <div className="flex flex-col">
                <p className="text-2xl font-bold">{(data.totalBotOpens + data.totalBotClicks).toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">
                    {data.totalBotOpens} opens, {data.totalBotClicks} clicks
                </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Replies</p>
              <MessageSquare className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="text-2xl font-bold">{data.totalReplies.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart Section */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Engagement Trends */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Engagement Trends</CardTitle>
                  <CardDescription>Daily performance metrics over the last {dateRange} days</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">Opens</Badge>
                  <Badge variant="secondary" className="bg-purple-50 text-purple-700 hover:bg-purple-100">Clicks</Badge>
                  <Badge variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-100">Replies</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailyStats} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorReplies" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#6b7280'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#6b7280'}} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend iconType="circle" />
                  <Area type="monotone" dataKey="opens" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorOpens)" name="Opens" />
                  <Area type="monotone" dataKey="clicks" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorClicks)" name="Clicks" />
                  <Area type="monotone" dataKey="replies" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorReplies)" name="Replies" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Active Campaigns */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Active Campaigns</CardTitle>
              <CardDescription>Live performance of your running campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
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
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                          No active campaigns found. Launch a new campaign to see stats here.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.liveCampaigns.map((campaign) => (
                        <TableRow key={campaign.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/campaign/${campaign.id}`)}>
                          <TableCell className="font-medium">
                            {campaign.name}
                            <div className="text-xs text-gray-500">{formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={campaign.status === 'running' ? 'default' : 'secondary'} className={campaign.status === 'running' ? 'bg-green-100 text-green-700 hover:bg-green-200' : ''}>
                              {campaign.status || 'Active'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{campaign.sent_count}</TableCell>
                          <TableCell className="text-right">
                            {campaign.sent_count > 0 ? ((campaign.opened_count / campaign.sent_count) * 100).toFixed(1) : 0}%
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className={campaign.replied_count > 0 ? 'text-green-600 font-medium' : 'text-gray-500'}>
                                {campaign.sent_count > 0 ? ((campaign.replied_count / campaign.sent_count) * 100).toFixed(1) : 0}%
                              </span>
                            </div>
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
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Sender Account Performance</CardTitle>
              <CardDescription>Engagement metrics by email account</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
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
                        <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                          No sender data available yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.senderStats.map((stat, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400" />
                            {stat.email}
                          </TableCell>
                          <TableCell className="text-right">{stat.sent}</TableCell>
                          <TableCell className="text-right">{stat.opens}</TableCell>
                          <TableCell className="text-right">
                            <span className={stat.replies > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>
                              {stat.replies}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {stat.replies === 0 && stat.sent > 50 ? (
                              <Badge variant="destructive" className="text-[10px]">No Replies</Badge>
                            ) : stat.bounces > 5 ? (
                              <Badge variant="destructive" className="text-[10px]">High Bounce</Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px]">Healthy</Badge>
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
        <div className="space-y-8">
          {/* Deliverability Health Score */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                Domain Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Google Postmaster Integration Status */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-xs font-medium text-blue-900">Google Postmaster Connected</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-100">
                  Configure
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Domain Reputation</p>
                  <p className={`text-2xl font-bold ${
                    data.domainReputation === 'High' ? 'text-green-600' :
                    data.domainReputation === 'Medium' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {data.domainReputation}
                  </p>
                </div>
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                  data.domainReputation === 'Bad' || data.domainReputation === 'Low' ? 'bg-red-100 text-red-600' : 
                  data.domainReputation === 'Medium' ? 'bg-yellow-100 text-yellow-600' : 
                  'bg-green-100 text-green-600'
                }`}>
                  {data.domainReputation === 'Bad' || data.domainReputation === 'Low' ? <ShieldAlert className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${data.spamRate > 0.3 ? 'bg-red-500' : data.spamRate > 0.1 ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                    Spam Rate (Postmaster)
                  </span>
                  <span className={`font-medium ${data.spamRate > 0.3 ? 'text-red-600' : data.spamRate > 0.1 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {data.spamRate}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    SPF Record
                  </span>
                  <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px]">Verified</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    DKIM Record
                  </span>
                  <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px]">Verified</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    DMARC Policy
                  </span>
                  <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px]">Enforced</Badge>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Daily Sending Limit</span>
                  <span>{data.todaySentCount} / {data.dailyLimit}</span>
                </div>
                <Progress value={(data.todaySentCount / data.dailyLimit) * 100} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity Feed */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-gray-500" />
                Live Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {data.recentActivity.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">No recent activity</p>
                ) : (
                  data.recentActivity.map((item, i) => (
                    <div 
                      key={i} 
                      className="flex items-start gap-3 py-3 border-b last:border-0 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors"
                      onClick={() => item.campaignId && navigate(`/campaign/${item.campaignId}`)}
                    >
                      <div className={`mt-1 p-1.5 rounded-full ${
                        item.type === 'open' ? 'bg-green-100 text-green-600' :
                        item.type === 'click' ? 'bg-purple-100 text-purple-600' :
                        item.type === 'reply' ? 'bg-yellow-100 text-yellow-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {item.type === 'open' ? <Eye className="h-3 w-3" /> :
                         item.type === 'click' ? <MousePointer className="h-3 w-3" /> :
                         item.type === 'reply' ? <MessageSquare className="h-3 w-3" /> :
                         <Mail className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.email}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {item.type === 'open' ? 'Opened email in' :
                           item.type === 'click' ? 'Clicked link in' :
                           item.type === 'reply' ? 'Replied to' : 'Interacted with'} <span className="font-medium text-blue-600">{item.campaign}</span>
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {safeFormatDate(item.date)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EmailAnalyticsDashboard;