import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, Search, RefreshCw, Mail, MousePointerClick, Eye, 
  MessageSquare, AlertCircle, CheckCircle2, Clock, Calendar, 
  TrendingUp, Users, Activity, Filter, Send, ChevronDown, ChevronUp,
  Download, PieChart, BarChart2, Share2, Lightbulb
} from 'lucide-react';
import { format, addMinutes, addHours, addDays, formatDistanceToNow, startOfDay, getDay, getHours } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, Pie, Cell, PieChart as RePieChart, Legend
} from 'recharts';
import DashboardLayout from '@/components/Layout/DashboardLayout';

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
  const [replies, setReplies] = useState<any[]>([]);
  const [expandedReply, setExpandedReply] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };
  
  const [stats, setStats] = useState({
    total: 0,
    sent: 0,
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
            // Debounce updates to prevent flickering
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              fetchCampaignData(false);
            }, 2000);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        clearTimeout(debounceTimer);
      };
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'replies' && recipients.length > 0) {
        fetchReplies();
    }
  }, [activeTab, recipients]);

  const fetchReplies = async () => {
    const repliedRecipients = recipients.filter(r => r.replied);
    if (repliedRecipients.length === 0) {
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
        } else {
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
        }
      });
      
      setReplies(repliesList);
    }
  };

  const fetchCampaignData = async (showLoading = true) => {
    // Only show loading on initial fetch
    if (showLoading && !campaign) setLoading(true);
    
    try {
      // Fetch campaign details
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('*, campaign_followups(*)')
        .eq('id', id)
        .single();

      if (campaignError) throw campaignError;
      setCampaign(campaignData);

      // Fetch recipients with their assigned config
      const { data: recipientsData, error: recipientsError } = await supabase
        .from('recipients')
        .select('*, email_configs(smtp_username)')
        .eq('campaign_id', id)
        .order('id', { ascending: true });

      if (recipientsError) throw recipientsError;
      setRecipients(recipientsData || []);

      // Calculate stats
      const currentStats = {
        total: recipientsData?.length || 0,
        sent: recipientsData?.filter(r => r.status === 'sent' || r.status === 'completed').length || 0,
        opens: recipientsData?.filter(r => r.opened_at).length || 0,
        clicks: recipientsData?.filter(r => r.clicked_at).length || 0,
        replies: recipientsData?.filter(r => r.replied).length || 0,
        bounces: recipientsData?.filter(r => r.bounced).length || 0,
        processing: recipientsData?.filter(r => r.status === 'processing').length || 0,
        queued: recipientsData?.filter(r => r.status === 'pending').length || 0,
        botOpens: (campaignData as any).bot_open_count || 0,
        botClicks: (campaignData as any).bot_click_count || 0
      };
      setStats(currentStats);

      // Generate Recent Activity Feed
      const activity: any[] = [];
      recipientsData?.forEach(r => {
        if (r.opened_at) activity.push({ type: 'open', date: new Date(r.opened_at), email: r.email, name: r.name });
        if (r.clicked_at) activity.push({ type: 'click', date: new Date(r.clicked_at), email: r.email, name: r.name });
        if (r.replied) activity.push({ type: 'reply', date: new Date(r.last_email_sent_at || new Date()), email: r.email, name: r.name }); // Approximate
        if (r.bounced) activity.push({ type: 'bounce', date: new Date(r.bounced_at || r.last_email_sent_at || new Date()), email: r.email, name: r.name });
      });
      
      // Sort by date desc and take top 20
      activity.sort((a, b) => b.date.getTime() - a.date.getTime());
      setRecentActivity(activity.slice(0, 20));

    } catch (error) {
      console.error('Error fetching campaign data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-500';
      case 'ready': return 'bg-blue-500';
      case 'sending': return 'bg-blue-600 animate-pulse';
      case 'paused': return 'bg-yellow-500';
      case 'sent': return 'bg-green-500';
      case 'completed': return 'bg-green-600';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
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

  const filteredRecipients = recipients.filter(r => {
    const matchesSearch = r.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.name && r.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
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
    const stats = Array(24).fill(0).map((_, i) => ({ hour: `${i}:00`, opens: 0, clicks: 0 }));
    recipients.forEach(r => {
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
  }, [recipients]);

  const timelineData = React.useMemo(() => {
    const days = new Map();
    // Initialize with last 7 days to ensure continuity
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = format(d, 'MMM dd');
        days.set(dateStr, { date: dateStr, opens: 0, clicks: 0, replies: 0 });
    }

    recipients.forEach(r => {
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
  }, [recipients]);

  const handleExport = () => {
    const headers = ['Email', 'Name', 'Status', 'Opened At', 'Clicked At', 'Replied', 'Bounced', 'Last Sent'];
    const csvContent = [
      headers.join(','),
      ...recipients.map(r => [
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

  if (loading) {
    return (
      <DashboardLayout 
        activeTab="campaigns" 
        onTabChange={() => navigate('/dashboard')} 
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
        onTabChange={() => navigate('/dashboard')} 
        user={user} 
        onLogout={handleLogout}
      >
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
          <h2 className="text-2xl font-bold text-gray-900">Campaign not found</h2>
          <Button onClick={() => navigate('/dashboard')} className="mt-4">
            Go Back
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      activeTab="campaigns" 
      onTabChange={() => navigate('/dashboard')} 
      user={user} 
      onLogout={handleLogout}
    >
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="rounded-full hover:bg-gray-200">
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{campaign.name}</h1>
                <Badge className={`${getStatusColor(campaign.status)} text-white px-3 py-1`}>
                  {campaign.status}
                </Badge>
              </div>
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" /> {campaign.subject}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" /> Created {format(new Date(campaign.created_at), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExport} variant="outline" className="bg-white">
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </Button>
            <Button onClick={() => fetchCampaignData(true)} variant="outline" className="bg-white">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="default" className="bg-blue-600 hover:bg-blue-700">
              Edit Campaign
            </Button>
          </div>
        </div>

        {/* Stats Overview Cards - Enhanced */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-white border-l-4 border-l-blue-500 shadow-sm">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Recipients</p>
                  <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</h3>
                  <div className="flex items-center mt-2 text-xs text-gray-500">
                    <span className="text-blue-600 font-medium mr-1">{stats.sent}</span> sent
                    <span className="mx-1">•</span>
                    <span className="text-orange-500 font-medium mr-1">{stats.queued}</span> queued
                  </div>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-l-4 border-l-green-500 shadow-sm">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Engagement Rate</p>
                  <h3 className="text-2xl font-bold text-gray-900 mt-1">
                    {stats.sent > 0 ? Math.round(((stats.opens + stats.clicks) / stats.sent) * 100) : 0}%
                  </h3>
                  <div className="flex items-center mt-2 text-xs text-gray-500">
                    <span className="text-green-600 font-medium mr-1">{stats.opens}</span> opens
                    <span className="mx-1">•</span>
                    <span className="text-purple-600 font-medium mr-1">{stats.clicks}</span> clicks
                  </div>
                  {(stats.botOpens > 0 || stats.botClicks > 0) && (
                    <div className="mt-1 text-xs text-gray-400 flex items-center" title="Filtered bot activity">
                        <span className="mr-1">🤖</span> {stats.botOpens} bot opens, {stats.botClicks} bot clicks
                    </div>
                  )}
                </div>
                <div className="p-2 bg-green-50 rounded-lg">
                  <MousePointerClick className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-l-4 border-l-yellow-500 shadow-sm">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Reply Rate</p>
                  <h3 className="text-2xl font-bold text-gray-900 mt-1">
                    {stats.sent > 0 ? ((stats.replies / stats.sent) * 100).toFixed(1) : 0}%
                  </h3>
                  <div className="flex items-center mt-2 text-xs text-gray-500">
                    <span className="text-yellow-600 font-medium mr-1">{stats.replies}</span> replies
                  </div>
                </div>
                <div className="p-2 bg-yellow-50 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-l-4 border-l-red-500 shadow-sm">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Bounce Rate</p>
                  <h3 className="text-2xl font-bold text-gray-900 mt-1">
                    {stats.sent > 0 ? ((stats.bounces / stats.sent) * 100).toFixed(1) : 0}%
                  </h3>
                  <div className="flex items-center mt-2 text-xs text-gray-500">
                    <span className="text-red-600 font-medium mr-1">{stats.bounces}</span> bounced
                  </div>
                </div>
                <div className="p-2 bg-red-50 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white p-1 border rounded-lg w-full justify-start h-auto">
            <TabsTrigger value="overview" className="px-4 py-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">Overview</TabsTrigger>
            <TabsTrigger value="analytics" className="px-4 py-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                <BarChart2 className="h-4 w-4 mr-2" />
                Analytics
            </TabsTrigger>
            <TabsTrigger value="recipients" className="px-4 py-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              Recipients <Badge variant="secondary" className="ml-2 bg-gray-100 text-gray-600">{recipients.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="replies" className="px-4 py-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              Replies <Badge variant="secondary" className="ml-2 bg-gray-100 text-gray-600">{stats.replies}</Badge>
            </TabsTrigger>
            <TabsTrigger value="sequence" className="px-4 py-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">Sequence</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Engagement Timeline */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Engagement Over Time</CardTitle>
                        <CardDescription>Daily opens, clicks, and replies for the last 7 days</CardDescription>
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
                                <Area type="monotone" dataKey="replies" stroke="#eab308" fill="none" name="Replies" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* AI Insights */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-yellow-500" />
                            Campaign Insights
                        </CardTitle>
                        <CardDescription>AI-driven recommendations</CardDescription>
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
                                <p className="text-xs text-gray-600">{insight.message}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Hourly Engagement */}
                <Card>
                    <CardHeader>
                        <CardTitle>Best Time to Email</CardTitle>
                        <CardDescription>When your recipients are most active (24h)</CardDescription>
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
                <Card>
                    <CardHeader>
                        <CardTitle>Conversion Funnel</CardTitle>
                        <CardDescription>Drop-off rates between stages</CardDescription>
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
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Campaign Funnel</CardTitle>
                  <CardDescription>Conversion rates through the email stages</CardDescription>
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
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Engagement by Hour</CardTitle>
                  <CardDescription>When do recipients open and click?</CardDescription>
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
            <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-600" />
                    Live Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[350px] pr-4">
                    <div className="space-y-4">
                      {recentActivity.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">No activity yet</div>
                      ) : (
                        recentActivity.map((item, i) => (
                          <div key={i} className="flex items-start gap-3 pb-3 border-b last:border-0">
                            <div className="mt-1 bg-gray-50 p-1.5 rounded-full">
                              {getActivityIcon(item.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {item.email}
                              </p>
                              <p className="text-xs text-gray-500 capitalize">
                                {item.type === 'open' ? 'Opened email' : 
                                 item.type === 'click' ? 'Clicked link' : 
                                 item.type === 'reply' ? 'Replied' : 'Bounced'}
                              </p>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
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
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Inbox Replies</CardTitle>
                <CardDescription>Responses from your campaign recipients</CardDescription>
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
                      <Card key={reply.id} className="border shadow-sm overflow-hidden">
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
            <Card className="border-none shadow-sm">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle>Recipient Management</CardTitle>
                  <div className="flex gap-2">
                    <div className="relative w-64">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                      <Input
                        placeholder="Search recipients..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <select 
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">All Status</option>
                      <option value="processing">Processing</option>
                      <option value="queued">Queued</option>
                      <option value="sent">Sent</option>
                      <option value="opened">Opened</option>
                      <option value="clicked">Clicked</option>
                      <option value="replied">Replied</option>
                      <option value="bounced">Bounced</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead>Recipient</TableHead>
                        <TableHead>Sender</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Engagement</TableHead>
                        <TableHead>Next Scheduled</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecipients.map((recipient) => {
                        const nextSend = calculateNextSendTime(recipient);
                        return (
                          <TableRow 
                            key={recipient.id} 
                            className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                            onClick={() => setSelectedRecipient(recipient)}
                          >
                            <TableCell>
                              <div className="font-medium text-gray-900">{recipient.email}</div>
                              {recipient.name && <div className="text-xs text-gray-500">{recipient.name}</div>}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-gray-600">
                                {recipient.email_configs?.smtp_username || '-'}
                              </div>
                            </TableCell>
                            <TableCell>
                              {recipient.bounced ? (
                                <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-200 border-none">Bounced</Badge>
                              ) : recipient.replied ? (
                                <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-none">Replied</Badge>
                              ) : recipient.status === 'processing' ? (
                                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none animate-pulse">Processing</Badge>
                              ) : recipient.status === 'sent' ? (
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-none">Sent</Badge>
                              ) : recipient.status === 'pending' ? (
                                <Badge variant="outline" className="bg-gray-100 text-gray-700 border-none">Queued</Badge>
                              ) : (
                                <Badge variant="outline" className="capitalize bg-gray-100 text-gray-700 border-none">{recipient.status}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-medium">Step {recipient.current_step ?? 0}</div>
                                <span className="text-xs text-gray-400">
                                  {recipient.last_email_sent_at ? format(new Date(recipient.last_email_sent_at), 'MMM d') : '-'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${recipient.opened_at ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                                  <Eye className="h-3 w-3" /> {recipient.opened_at ? 'Open' : 'No'}
                                </div>
                                <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${recipient.clicked_at ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-400'}`}>
                                  <MousePointerClick className="h-3 w-3" /> {recipient.clicked_at ? 'Click' : 'No'}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {nextSend ? (
                                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
                                  <Clock className="h-3 w-3" />
                                  {format(nextSend, 'MMM d, HH:mm')}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic">Completed</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredRecipients.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                            <div className="flex flex-col items-center gap-2">
                              <Search className="h-8 w-8 text-gray-300" />
                              <p>No recipients found matching your filters.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SEQUENCE TAB */}
          <TabsContent value="sequence">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Campaign Sequence</CardTitle>
                <CardDescription>Visual timeline of your email steps</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative pl-8 space-y-8 before:absolute before:left-3.5 before:top-2 before:h-full before:w-0.5 before:bg-gray-200">
                  {/* Step 0 */}
                  <div className="relative">
                    <div className="absolute -left-[29px] top-0 h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm ring-4 ring-white">
                      1
                    </div>
                    <Card className="border shadow-sm">
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

                      <Card className="border shadow-sm">
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

      {/* Recipient Details Dialog */}
      <Dialog open={!!selectedRecipient} onOpenChange={(open) => !open && setSelectedRecipient(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recipient Details</DialogTitle>
            <DialogDescription>
              Detailed history for {selectedRecipient?.email}
            </DialogDescription>
          </DialogHeader>
          
          {selectedRecipient && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="font-medium capitalize">{selectedRecipient.status}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Current Step</p>
                  <p className="font-medium">Step {selectedRecipient.current_step ?? 0}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Last Sent</p>
                  <p className="font-medium">
                    {selectedRecipient.last_email_sent_at 
                      ? format(new Date(selectedRecipient.last_email_sent_at), 'MMM d, HH:mm') 
                      : 'Never'}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Engagement</p>
                  <div className="flex gap-2 mt-1">
                    {selectedRecipient.opened_at && <Badge variant="secondary" className="bg-green-100 text-green-700">Opened</Badge>}
                    {selectedRecipient.clicked_at && <Badge variant="secondary" className="bg-purple-100 text-purple-700">Clicked</Badge>}
                    {selectedRecipient.replied && <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">Replied</Badge>}
                    {!selectedRecipient.opened_at && !selectedRecipient.clicked_at && !selectedRecipient.replied && <span className="text-sm text-gray-400">No engagement yet</span>}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">Timeline</h4>
                <div className="relative pl-4 border-l-2 border-gray-200 space-y-6">
                  {/* Timeline events would go here - for now we simulate based on fields */}
                  <div className="relative">
                    <div className="absolute -left-[21px] top-0 h-4 w-4 rounded-full bg-blue-500 border-2 border-white"></div>
                    <p className="text-sm font-medium">Added to Campaign</p>
                    <p className="text-xs text-gray-500">{format(new Date(campaign.created_at), 'MMM d, HH:mm')}</p>
                  </div>
                  
                  {selectedRecipient.last_email_sent_at && (
                    <div className="relative">
                      <div className="absolute -left-[21px] top-0 h-4 w-4 rounded-full bg-blue-500 border-2 border-white"></div>
                      <p className="text-sm font-medium">Email Sent (Step {selectedRecipient.current_step})</p>
                      <p className="text-xs text-gray-500">{format(new Date(selectedRecipient.last_email_sent_at), 'MMM d, HH:mm')}</p>
                    </div>
                  )}

                  {selectedRecipient.opened_at && (
                    <div className="relative">
                      <div className="absolute -left-[21px] top-0 h-4 w-4 rounded-full bg-green-500 border-2 border-white"></div>
                      <p className="text-sm font-medium">Email Opened</p>
                      <p className="text-xs text-gray-500">{format(new Date(selectedRecipient.opened_at), 'MMM d, HH:mm')}</p>
                    </div>
                  )}

                  {selectedRecipient.clicked_at && (
                    <div className="relative">
                      <div className="absolute -left-[21px] top-0 h-4 w-4 rounded-full bg-purple-500 border-2 border-white"></div>
                      <p className="text-sm font-medium">Link Clicked</p>
                      <p className="text-xs text-gray-500">{format(new Date(selectedRecipient.clicked_at), 'MMM d, HH:mm')}</p>
                    </div>
                  )}
                  
                  {selectedRecipient.replied && (
                    <div className="relative">
                      <div className="absolute -left-[21px] top-0 h-4 w-4 rounded-full bg-yellow-500 border-2 border-white"></div>
                      <p className="text-sm font-medium">Replied</p>
                      <p className="text-xs text-gray-500">Detected via inbox sync</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default CampaignTracker;
