import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
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
  Award
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
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
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
  campaigns: any[];
}

const EmailAnalyticsDashboard = () => {
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
    campaigns: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    try {
      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const totalCampaigns = campaigns?.length || 0;
      const totalEmails = campaigns?.reduce((sum, c) => sum + (c.sent_count || 0), 0) || 0;
      const totalOpens = campaigns?.reduce((sum, c) => sum + (c.opened_count || 0), 0) || 0;
      const totalClicks = campaigns?.reduce((sum, c) => sum + (c.clicked_count || 0), 0) || 0;
      const totalFailed = campaigns?.reduce((sum, c) => sum + (c.failed_count || 0), 0) || 0;
      const totalBounced = campaigns?.reduce((sum, c) => sum + (c.bounced_count || 0), 0) || 0;
      const totalReplies = campaigns?.reduce((sum, c) => sum + (c.replied_count || 0), 0) || 0;

      const avgOpenRate = totalEmails > 0 ? (totalOpens / totalEmails) * 100 : 0;
      const avgClickRate = totalEmails > 0 ? (totalClicks / totalEmails) * 100 : 0;

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
        campaigns: campaigns || []
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const industryBenchmarks = {
    openRate: 21.33,
    clickRate: 2.62,
    unsubscribeRate: 0.26
  };

  const getPerformanceStatus = (rate: number, benchmark: number) => {
    if (rate >= benchmark * 1.2) return { status: 'excellent', color: 'text-green-600', icon: TrendingUp };
    if (rate >= benchmark) return { status: 'good', color: 'text-blue-600', icon: TrendingUp };
    if (rate >= benchmark * 0.8) return { status: 'average', color: 'text-yellow-600', icon: Target };
    return { status: 'needs-improvement', color: 'text-red-600', icon: TrendingDown };
  };

  const openRateStatus = getPerformanceStatus(data.avgOpenRate, industryBenchmarks.openRate);
  const clickRateStatus = getPerformanceStatus(data.avgClickRate, industryBenchmarks.clickRate);

  const campaignPerformanceData = data.campaigns.slice(0, 10).map((campaign, index) => ({
    name: campaign.name.substring(0, 20) + (campaign.name.length > 20 ? '...' : ''),
    openRate: campaign.sent_count > 0 ? (campaign.opened_count / campaign.sent_count) * 100 : 0,
    clickRate: campaign.sent_count > 0 ? (campaign.clicked_count / campaign.sent_count) * 100 : 0,
    sent: campaign.sent_count || 0
  }));

  const engagementData = [
    { name: 'Opened', value: data.totalOpens, color: '#3b82f6' },
    { name: 'Clicked', value: data.totalClicks, color: '#10b981' },
    { name: 'Bounced', value: data.totalBounced, color: '#f97316' },
    { name: 'Failed', value: data.totalFailed, color: '#ef4444' },
    { name: 'Not Opened', value: Math.max(0, data.totalEmails - data.totalOpens - data.totalBounced - data.totalFailed), color: '#6b7280' }
  ];

  const psychologyInsights = [
    {
      title: "Optimal Send Time",
      insight: "Tuesday-Thursday, 10-11 AM shows 23% higher open rates",
      recommendation: "Schedule campaigns during peak engagement hours",
      icon: Clock
    },
    {
      title: "Subject Line Psychology",
      insight: "Personalized subjects increase opens by 26%",
      recommendation: "Use recipient names and relevant context",
      icon: Brain
    },
    {
      title: "Content Psychology",
      insight: "Emails with clear CTAs see 371% more clicks",
      recommendation: "Use action-oriented language and visual emphasis",
      icon: Lightbulb
    },
    {
      title: "Frequency Psychology",
      insight: "2-3 emails per week maximizes engagement",
      recommendation: "Avoid oversaturation while maintaining presence",
      icon: Target
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Email Marketing Analytics</h1>
          <p className="text-muted-foreground mt-1">Comprehensive insights to optimize your email campaigns</p>
        </div>
        <Button onClick={fetchAnalyticsData} variant="outline">
          <TrendingUp className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-800">Total Campaigns</CardTitle>
            <Mail className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">{data.totalCampaigns}</div>
            <p className="text-xs text-blue-600 mt-1">Active email campaigns</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-800">Total Emails Sent</CardTitle>
            <Users className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">{data.totalEmails.toLocaleString()}</div>
            <p className="text-xs text-green-600 mt-1">Emails delivered</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-800">Total Bounced</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-900">{data.totalBounced}</div>
            <p className="text-xs text-red-600 mt-1">
              {data.totalEmails > 0 ? ((data.totalBounced / data.totalEmails) * 100).toFixed(1) : 0}% bounce rate
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-indigo-800">Total Replies</CardTitle>
            <MessageSquare className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-900">{data.totalReplies}</div>
            <p className="text-xs text-indigo-600 mt-1">
              {data.totalEmails > 0 ? ((data.totalReplies / data.totalEmails) * 100).toFixed(1) : 0}% reply rate
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-800">Average Open Rate</CardTitle>
            <Eye className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold text-purple-900">{data.avgOpenRate.toFixed(1)}%</div>
              <openRateStatus.icon className={`h-4 w-4 ${openRateStatus.color}`} />
            </div>
            <p className="text-xs text-purple-600 mt-1">
              Industry avg: {industryBenchmarks.openRate}%
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-orange-800">Average Click Rate</CardTitle>
            <MousePointer className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold text-orange-900">{data.avgClickRate.toFixed(1)}%</div>
              <clickRateStatus.icon className={`h-4 w-4 ${clickRateStatus.color}`} />
            </div>
            <p className="text-xs text-orange-600 mt-1">
              Industry avg: {industryBenchmarks.clickRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Campaign Performance Trends</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={campaignPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="openRate" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                <Area type="monotone" dataKey="clickRate" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="h-5 w-5" />
              <span>Email Engagement Breakdown</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={engagementData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {engagementData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-4">
              {engagementData.map((entry, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                  <span className="text-sm text-muted-foreground">{entry.name}: {entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Benchmarks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Award className="h-5 w-5" />
            <span>Industry Benchmark Comparison</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Open Rate Performance</span>
              <Badge variant={data.avgOpenRate >= industryBenchmarks.openRate ? "default" : "secondary"}>
                {data.avgOpenRate >= industryBenchmarks.openRate ? "Above Average" : "Below Average"}
              </Badge>
            </div>
            <Progress value={(data.avgOpenRate / industryBenchmarks.openRate) * 100} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Your Rate: {data.avgOpenRate.toFixed(1)}%</span>
              <span>Industry Avg: {industryBenchmarks.openRate}%</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Click Rate Performance</span>
              <Badge variant={data.avgClickRate >= industryBenchmarks.clickRate ? "default" : "secondary"}>
                {data.avgClickRate >= industryBenchmarks.clickRate ? "Above Average" : "Below Average"}
              </Badge>
            </div>
            <Progress value={(data.avgClickRate / industryBenchmarks.clickRate) * 100} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Your Rate: {data.avgClickRate.toFixed(1)}%</span>
              <span>Industry Avg: {industryBenchmarks.clickRate}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Psychology Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Brain className="h-5 w-5" />
            <span>Email Marketing Psychology & Optimization</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {psychologyInsights.map((item, index) => (
              <div key={index} className="p-4 rounded-lg border bg-card">
                <div className="flex items-start space-x-3">
                  <item.icon className="h-5 w-5 text-primary mt-1" />
                  <div className="space-y-2">
                    <h4 className="font-semibold text-foreground">{item.title}</h4>
                    <p className="text-sm text-muted-foreground">{item.insight}</p>
                    <div className="flex items-center space-x-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      <p className="text-xs font-medium text-foreground">{item.recommendation}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions & Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-auto p-4 flex flex-col items-start space-y-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div className="text-left">
                <div className="font-medium">Optimize Send Times</div>
                <div className="text-xs text-muted-foreground">Analyze when your audience is most active</div>
              </div>
            </Button>
            
            <Button variant="outline" className="h-auto p-4 flex flex-col items-start space-y-2">
              <Target className="h-5 w-5 text-blue-600" />
              <div className="text-left">
                <div className="font-medium">A/B Test Subject Lines</div>
                <div className="text-xs text-muted-foreground">Test different approaches to improve opens</div>
              </div>
            </Button>
            
            <Button variant="outline" className="h-auto p-4 flex flex-col items-start space-y-2">
              <Users className="h-5 w-5 text-purple-600" />
              <div className="text-left">
                <div className="font-medium">Segment Your Audience</div>
                <div className="text-xs text-muted-foreground">Create targeted campaigns for better results</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailAnalyticsDashboard;