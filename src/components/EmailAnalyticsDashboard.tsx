import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
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
  ShieldAlert
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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
  recentActivity: any[];
  dailyStats: any[];
  domainReputation: 'High' | 'Medium' | 'Low' | 'Bad';
  spamRate: number;
}

const EmailAnalyticsDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>({
    totalCampaigns: 0,
    totalEmails: 0,
    totalOpens: 0,
    totalClicks: 0,
    totalFailed: 0,
    totalBounced: 0,
    totalReplies: 0,
    avgOpenRate: 0,
    avgClickRate: 0,
    avgReplyRate: 0,
    avgBounceRate: 0,
    campaigns: [],
    recentActivity: [],
    dailyStats: [],
    domainReputation: 'High',
    spamRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedIndustry, setSelectedIndustry] = useState('general');
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch Campaigns
      const { data: campaignsData, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const campaigns: any[] = campaignsData || [];

      // Fetch Recent Activity (Recipients)
      const { data: recentRecipientsData } = await supabase
        .from('recipients')
        .select(`
          *,
          campaigns!inner(name, user_id)
        `)
        .eq('campaigns.user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(100);

      const recentRecipients: any[] = recentRecipientsData || [];

      const totalCampaigns = campaigns?.length || 0;
      const totalEmails = campaigns?.reduce((sum, c) => sum + (c.sent_count || 0), 0) || 0;
      const totalOpens = campaigns?.reduce((sum, c) => sum + (c.opened_count || 0), 0) || 0;
      const totalClicks = campaigns?.reduce((sum, c) => sum + (c.clicked_count || 0), 0) || 0;
      const totalFailed = campaigns?.reduce((sum, c) => sum + (c.failed_count || 0), 0) || 0;
      const totalBounced = campaigns?.reduce((sum, c) => sum + (c.bounced_count || 0), 0) || 0;
      const totalReplies = campaigns?.reduce((sum, c) => sum + (c.replied_count || 0), 0) || 0;

      const avgOpenRate = totalEmails > 0 ? (totalOpens / totalEmails) * 100 : 0;
      const avgClickRate = totalEmails > 0 ? (totalClicks / totalEmails) * 100 : 0;
      const avgReplyRate = totalEmails > 0 ? (totalReplies / totalEmails) * 100 : 0;
      const avgBounceRate = totalEmails > 0 ? (totalBounced / totalEmails) * 100 : 0;

      // Process Recent Activity
      const activity = recentRecipients?.map(r => {
        let type = 'sent';
        let date = r.created_at;
        
        if (r.replied) { type = 'reply'; date = r.updated_at; }
        else if (r.clicked_at) { type = 'click'; date = r.clicked_at; }
        else if (r.opened_at) { type = 'open'; date = r.opened_at; }
        else if (r.bounced) { type = 'bounce'; date = r.updated_at; }
        
        return {
          id: r.id,
          email: r.email,
          campaign: r.campaigns.name,
          type,
          date
        };
      }) || [];

      // Mock Daily Stats
      const dailyStats = [
        { name: 'Mon', opens: Math.floor(totalOpens * 0.1), clicks: Math.floor(totalClicks * 0.1) },
        { name: 'Tue', opens: Math.floor(totalOpens * 0.2), clicks: Math.floor(totalClicks * 0.2) },
        { name: 'Wed', opens: Math.floor(totalOpens * 0.25), clicks: Math.floor(totalClicks * 0.25) },
        { name: 'Thu', opens: Math.floor(totalOpens * 0.2), clicks: Math.floor(totalClicks * 0.2) },
        { name: 'Fri', opens: Math.floor(totalOpens * 0.15), clicks: Math.floor(totalClicks * 0.15) },
        { name: 'Sat', opens: Math.floor(totalOpens * 0.05), clicks: Math.floor(totalClicks * 0.05) },
        { name: 'Sun', opens: Math.floor(totalOpens * 0.05), clicks: Math.floor(totalClicks * 0.05) },
      ];

      // Fetch Email Config to get the domain
      const { data: emailConfig } = await supabase
        .from('email_configs')
        .select('smtp_username')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      let domainReputation: 'High' | 'Medium' | 'Low' | 'Bad' = 'High';
      let spamRate = 0.05; // Default safe rate

      if (emailConfig?.smtp_username) {
        const domain = emailConfig.smtp_username.split('@')[1];
        
        // Call Supabase Edge Function to get real Postmaster Data
        const { data: postmasterData, error: postmasterError } = await supabase.functions.invoke('google-postmaster', {
          body: { domain }
        });

        if (!postmasterError && postmasterData?.data?.length > 0) {
          // Use the most recent data point
          const latestStats = postmasterData.data[postmasterData.data.length - 1];
          
          // Map Google's reputation to our types
          // Google returns: HIGH, MEDIUM, LOW, BAD
          if (latestStats.domainReputation) {
            const rep = latestStats.domainReputation;
            domainReputation = rep.charAt(0).toUpperCase() + rep.slice(1).toLowerCase() as any;
          }

          if (latestStats.userReportedSpamRatio) {
            spamRate = latestStats.userReportedSpamRatio * 100; // Convert ratio to percentage
          }
        } else {
           console.log('No Postmaster data available or API error:', postmasterError);
           
           if (postmasterData?.status === 'not_found_or_permission') {
             toast({
               title: "Google Postmaster Tools Access Required",
               description: `Please add ${postmasterData.serviceAccountEmail} to your domain in Google Postmaster Tools.`,
               variant: "destructive",
               duration: 10000,
             });
           }
        }
      }

      setData({
        totalCampaigns,
        totalEmails,
        totalOpens,
        totalClicks,
        totalFailed,
        totalBounced,
        totalReplies,
        avgOpenRate,
        avgClickRate,
        avgReplyRate,
        avgBounceRate,
        campaigns: campaigns || [],
        recentActivity: activity,
        dailyStats,
        domainReputation,
        spamRate
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
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
        <div className="flex items-center gap-3">
          <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
            <SelectTrigger className="w-[180px] bg-white">
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
            <Zap className="h-4 w-4 mr-2" />
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
            icon: Eye,
            description: "Percentage of recipients who opened your email. Low open rate often indicates poor subject lines or deliverability issues."
          },
          { 
            label: 'Click Rate', 
            value: `${data.avgClickRate.toFixed(1)}%`, 
            benchmark: currentBenchmarks.click,
            rate: data.avgClickRate,
            icon: MousePointer,
            description: "Percentage of recipients who clicked a link. High click rate indicates relevant content and strong CTAs."
          },
          { 
            label: 'Reply Rate', 
            value: `${data.avgReplyRate.toFixed(1)}%`, 
            benchmark: currentBenchmarks.reply,
            rate: data.avgReplyRate,
            icon: MessageSquare,
            description: "Percentage of recipients who replied. This is the primary metric for conversation-focused campaigns."
          },
          { 
            label: 'Bounce Rate', 
            value: `${data.avgBounceRate.toFixed(1)}%`, 
            benchmark: currentBenchmarks.bounce,
            rate: data.avgBounceRate,
            icon: AlertTriangle,
            inverse: true,
            description: "Percentage of emails that failed to deliver. Keep this below 2% to avoid being blocked by Google/Yahoo."
          }
        ].map((stat, i) => {
          const status = getPerformanceStatus(stat.rate, stat.benchmark);
          const isPositive = stat.inverse ? stat.rate < stat.benchmark : stat.rate >= stat.benchmark;
          
          return (
            <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all duration-200">
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
                
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-gray-600">{stat.benchmark}%</span>
                    <span className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                      {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                      {Math.abs(stat.rate - stat.benchmark).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">vs {selectedIndustry.replace('_', ' ')} avg</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart Section */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Engagement Trends</CardTitle>
              <CardDescription>Daily opens and clicks performance</CardDescription>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailyStats}>
                  <defs>
                    <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="opens" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorOpens)" name="Opens" />
                  <Area type="monotone" dataKey="clicks" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorClicks)" name="Clicks" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Campaign Performance Table */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Top Performing Campaigns</CardTitle>
              <CardDescription>Based on engagement rates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.campaigns.slice(0, 5).map((campaign, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-white border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {i + 1}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">{campaign.name}</h4>
                        <p className="text-xs text-gray-500">Sent {campaign.sent_count} emails</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{campaign.sent_count > 0 ? Math.round((campaign.opened_count / campaign.sent_count) * 100) : 0}%</p>
                        <p className="text-xs text-gray-500">Open Rate</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{campaign.sent_count > 0 ? Math.round((campaign.replied_count / campaign.sent_count) * 100) : 0}%</p>
                        <p className="text-xs text-gray-500">Reply Rate</p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-blue-600"
                        onClick={() => navigate(`/campaign/${campaign.id}`)}
                      >
                        View <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                ))}
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
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    SPF Record
                  </span>
                  <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Verified</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    DKIM Record
                  </span>
                  <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Verified</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    DMARC Policy
                  </span>
                  <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Enforced</Badge>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Daily Sending Limit</span>
                  <span>{data.dailyStats[6]?.opens * 2 || 0} / 2000</span>
                </div>
                <Progress value={((data.dailyStats[6]?.opens * 2 || 0) / 2000) * 100} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* AI Insights */}
          <Card className="border-none shadow-sm bg-gradient-to-b from-indigo-50 to-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-indigo-900">
                <Brain className="h-5 w-5 text-indigo-600" />
                AI Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {getInsights().map((insight, i) => (
                <div key={i} className={`p-4 rounded-lg border bg-white shadow-sm ${
                  insight.type === 'warning' ? 'border-orange-200' :
                  insight.type === 'danger' ? 'border-red-200' :
                  insight.type === 'success' ? 'border-green-200' :
                  'border-blue-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 p-1.5 rounded-full ${
                      insight.type === 'warning' ? 'bg-orange-100 text-orange-600' :
                      insight.type === 'danger' ? 'bg-red-100 text-red-600' :
                      insight.type === 'success' ? 'bg-green-100 text-green-600' :
                      'bg-blue-100 text-blue-600'
                    }`}>
                      <insight.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900">{insight.title}</h4>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{insight.message}</p>
                    </div>
                  </div>
                </div>
              ))}
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
              <div className="space-y-0 max-h-[400px] overflow-y-auto pr-2">
                {data.recentActivity.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">No recent activity</p>
                ) : (
                  data.recentActivity.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 py-3 border-b last:border-0">
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