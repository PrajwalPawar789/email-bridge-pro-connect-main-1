/**
 * useAnalyticsData Hook
 * Core hook for fetching and aggregating all analytics dashboard data
 * Handles pagination, real-time subscriptions, and complex calculations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, parseISO } from 'date-fns';
import {
  DashboardData,
  DashboardDateRange,
  TimeRange,
  KPICardData,
  TrendData,
  ActiveCampaign,
  SenderStat,
  DomainHealthData,
  ActivityEntry,
  UseAnalyticsDataReturn,
} from '@/types/analytics';
import {
  calculateRate,
  calculateTrendDelta,
  calculateFunnelStages,
  formatRate,
  getPerformanceLevel,
  getIndustryBenchmark,
  safeDivide,
  formatTimeAgo,
} from '@/lib/analyticsCalculations';

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_DOMAIN_HEALTH: DomainHealthData = {
  domain: undefined,
  reputation: 'Not Determined',
  spamRate: 0,
  authStatus: {
    spf: 'not_checked',
    dkim: 'not_checked',
    dmarc: 'not_checked',
  },
  postmasterConnected: false,
  dailyLimit: 500,
  dailySent: 0,
};

const DEFAULT_DASHBOARD_DATA: DashboardData = {
  kpis: [],
  engagementTrends: [],
  deliveryFunnel: {
    stages: [],
    totalSent: 0,
  },
  activeCampaigns: [],
  senderStats: [],
  domainHealth: DEFAULT_DOMAIN_HEALTH,
  activities: [],
  totalEmails: 0,
  totalOpens: 0,
  totalClicks: 0,
  totalReplies: 0,
  totalBounced: 0,
  totalFailed: 0,
  dateRange: {
    start: subDays(new Date(), 30),
    end: new Date(),
  },
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface RawRecipient {
  id: string;
  email: string;
  status: string;
  sent_count: number;
  opened_at?: string;
  clicked_at?: string;
  replied: boolean;
  bounced_at?: string;
  failed_at?: string;
  last_email_sent_at?: string;
  updated_at: string;
  campaigns?: {
    id: string;
    name: string;
    user_id: string;
    email_config_id: string;
    bot_open_count?: number;
    bot_click_count?: number;
  };
}

interface RawCampaign {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  bot_open_count?: number;
  bot_click_count?: number;
}

interface RawEmailConfig {
  id: string;
  smtp_username: string;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useAnalyticsData(
  dateRange: TimeRange = '30',
  industry: string = 'general'
): UseAnalyticsDataReturn {
  const [data, setData] = useState<DashboardData>(DEFAULT_DASHBOARD_DATA);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const hasLoadedOnceRef = useRef(false);
  const subscriptionsRef = useRef<Array<() => void>>([]);
  const pollIntervalRef = useRef<number>();

  // ============================================================================
  // CALCULATIONS
  // ============================================================================

  /**
   * Calculate date range based on selected period
   */
  const getDateRange = useCallback((): DashboardDateRange => {
    const end = new Date();
    const start = subDays(end, parseInt(dateRange));
    return { start, end };
  }, [dateRange]);

  /**
   * Aggregate daily statistics from recipients
   */
  const aggregateDailyStats = useCallback((recipients: RawRecipient[], dateRange: DashboardDateRange) => {
    const dailyMap = new Map<string, any>();

    // Initialize all dates in range with zeros
    let currentDate = new Date(dateRange.start);
    while (currentDate <= dateRange.end) {
      const dateKey = format(currentDate, 'yyyy-MM-dd');
      dailyMap.set(dateKey, {
        date: dateKey,
        sent: 0,
        opens: 0,
        clicks: 0,
        replies: 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Aggregate recipient data into daily buckets
    recipients.forEach((recipient) => {
      // Count sends
      if (recipient.last_email_sent_at) {
        const sentDate = format(parseISO(recipient.last_email_sent_at), 'yyyy-MM-dd');
        const existing = dailyMap.get(sentDate);
        if (existing) {
          existing.sent += recipient.sent_count || 1;
        }
      }

      // Count opens
      if (recipient.opened_at) {
        const openDate = format(parseISO(recipient.opened_at), 'yyyy-MM-dd');
        const existing = dailyMap.get(openDate);
        if (existing) {
          existing.opens++;
        }
      }

      // Count clicks
      if (recipient.clicked_at) {
        const clickDate = format(parseISO(recipient.clicked_at), 'yyyy-MM-dd');
        const existing = dailyMap.get(clickDate);
        if (existing) {
          existing.clicks++;
        }
      }

      // Count replies
      if (recipient.replied) {
        const replyDate = format(parseISO(recipient.updated_at), 'yyyy-MM-dd');
        const existing = dailyMap.get(replyDate);
        if (existing) {
          existing.replies++;
        }
      }
    });

    // Convert map to sorted array
    return Array.from(dailyMap.values()).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, []);

  /**
   * Aggregate sender statistics
   */
  const aggregateSenderStats = useCallback(
    (recipients: RawRecipient[], configs: RawEmailConfig[]): SenderStat[] => {
      const senderMap = new Map<string, any>();

      // Initialize with config data
      configs.forEach((config) => {
        senderMap.set(config.id, {
          emailConfigId: config.id,
          senderEmail: config.smtp_username,
          sent: 0,
          opens: 0,
          clicks: 0,
          replies: 0,
          bounces: 0,
        });
      });

      // Aggregate recipient data by email config
      recipients.forEach((recipient) => {
        if (recipient.campaigns?.email_config_id) {
          const configId = recipient.campaigns.email_config_id;
          if (!senderMap.has(configId)) {
            senderMap.set(configId, {
              emailConfigId: configId,
              senderEmail: 'Unknown',
              sent: 0,
              opens: 0,
              clicks: 0,
              replies: 0,
              bounces: 0,
            });
          }

          const stats = senderMap.get(configId);
          stats.sent += recipient.sent_count || 1;
          if (recipient.opened_at) stats.opens++;
          if (recipient.clicked_at) stats.clicks++;
          if (recipient.replied) stats.replies++;
          if (recipient.bounced_at) stats.bounces++;
        }
      });

      // Calculate rates and health
      const results: SenderStat[] = Array.from(senderMap.values()).map((stats) => ({
        ...stats,
        openRate: calculateRate(stats.opens, stats.sent),
        replyRate: calculateRate(stats.replies, stats.sent),
        bounceRate: calculateRate(stats.bounces, stats.sent),
        health: calculateRate(stats.bounces, stats.sent) > 5 ? 'risk' : 'excellent',
        healthLabel: calculateRate(stats.bounces, stats.sent) > 5 ? 'High Bounce' : 'Healthy',
      }));

      return results;
    },
    []
  );

  /**
   * Fetch all analytics data
   */
  const fetchAnalyticsData = useCallback(async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('Not authenticated');
      }

      const userId = user.data.user.id;
      const dateRangeData = getDateRange();

      // ========== FETCH CAMPAIGNS ==========
      const { data: campaignsData } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      const campaigns = (campaignsData || []) as RawCampaign[];

      // ========== FETCH EMAIL CONFIGS ==========
      const { data: configsData } = await supabase
        .from('email_configs')
        .select('id, smtp_username')
        .eq('user_id', userId);

      const configs = (configsData || []) as RawEmailConfig[];

      // ========== FETCH RECIPIENTS (PAGINATED) ==========
      const allRecipients: RawRecipient[] = [];
      let pageStart = 0;
      const pageSize = 1000;

      const formattedStart = format(dateRangeData.start, "yyyy-MM-dd'T'00:00:00");
      const formattedEnd = format(dateRangeData.end, "yyyy-MM-dd'T'23:59:59");

      while (true) {
        const { data: pageData, error: pageError } = await supabase
          .from('recipients')
          .select('*, campaigns!inner(id, name, user_id, email_config_id, bot_open_count, bot_click_count)')
          .eq('campaigns.user_id', userId)
          .or(
            `last_email_sent_at.gte.${formattedStart},` +
            `opened_at.gte.${formattedStart},` +
            `clicked_at.gte.${formattedStart},` +
            `bounced_at.gte.${formattedStart},` +
            `and(replied.eq.true,updated_at.gte.${formattedStart})`
          )
          .order('updated_at', { ascending: false })
          .range(pageStart, pageStart + pageSize - 1);

        if (pageError) throw pageError;
        if (!pageData || pageData.length === 0) break;

        allRecipients.push(...(pageData as RawRecipient[]));
        pageStart += pageSize;
      }

      // ========== FETCH POSTMASTER DATA ==========
      let domainHealth = DEFAULT_DOMAIN_HEALTH;
      const { data: profileData } = await supabase
        .from('onboarding_profiles')
        .select('postmaster_domain')
        .eq('user_id', userId)
        .single();

      if (profileData?.postmaster_domain) {
        try {
          const postmasterResult = await supabase.functions.invoke('google-postmaster', {
            body: { domain: profileData.postmaster_domain },
          });

          if (postmasterResult.data) {
            domainHealth = {
              domain: profileData.postmaster_domain,
              reputation: postmasterResult.data.domainReputation || 'Not Determined',
              spamRate: postmasterResult.data.userReportedSpamRatio || 0,
              postmasterConnected: true,
              dailyLimit: configs.length > 0 ? configs.length * 500 : 500,
              dailySent: 0, // Would be calculated from today's sends
            };
          }
        } catch (err) {
          console.warn('Postmaster data fetch failed:', err);
        }
      }

      // ========== AGGREGATE METRICS ==========
      const totalEmails = allRecipients.reduce((sum, r) => sum + (r.sent_count || 1), 0);
      const totalOpens = allRecipients.filter((r) => r.opened_at).length;
      const totalClicks = allRecipients.filter((r) => r.clicked_at).length;
      const totalReplies = allRecipients.filter((r) => r.replied).length;
      const totalBounced = allRecipients.filter((r) => r.bounced_at).length;
      const totalFailed = allRecipients.filter((r) => r.status === 'failed').length;

      // ========== COMPUTE KPI CARDS ==========
      const benchmark = getIndustryBenchmark(industry);

      // Previous period for comparison
      const previousStart = subDays(dateRangeData.start, parseInt(dateRange));
      const previousEnd = subDays(dateRangeData.end, parseInt(dateRange));

      // Parse recipients for previous period (simplified - in production could paginate)
      const previousRecipients = allRecipients.filter((r) => {
        const lastSent = r.last_email_sent_at ? parseISO(r.last_email_sent_at) : null;
        return lastSent && lastSent >= previousStart && lastSent <= previousEnd;
      });

      const previousTotal = previousRecipients.reduce((sum, r) => sum + (r.sent_count || 1), 0);
      const previousOpens = previousRecipients.filter((r) => r.opened_at).length;
      const previousClicks = previousRecipients.filter((r) => r.clicked_at).length;
      const previousReplies = previousRecipients.filter((r) => r.replied).length;

      const kpis: KPICardData[] = [
        {
          id: 'total-sent',
          label: 'Total Sent',
          value: totalEmails,
          unit: 'emails',
          trend: calculateTrendDelta(totalEmails, previousTotal),
          benchmark: {
            average: benchmark.openRate,
            performance: 'good',
          },
        },
        {
          id: 'replies',
          label: 'Replies',
          value: totalReplies,
          unit: 'replies',
          trend: calculateTrendDelta(totalReplies, previousReplies),
          benchmark: {
            average: benchmark.replyRate,
            performance: getPerformanceLevel(
              calculateRate(totalReplies, totalEmails),
              benchmark.replyRate
            ).level,
          },
        },
        {
          id: 'bounces',
          label: 'Bounces',
          value: totalBounced,
          unit: `(${formatRate(calculateRate(totalBounced, totalEmails))})`,
          trend: calculateTrendDelta(totalBounced, previousRecipients.filter((r) => r.bounced_at).length),
          benchmark: {
            average: benchmark.bounceRate,
            performance: getPerformanceLevel(
              calculateRate(totalBounced, totalEmails),
              benchmark.bounceRate
            ).level,
          },
        },
        {
          id: 'today-sent',
          label: 'Today Sent',
          value: allRecipients.filter((r) => {
            const sent = r.last_email_sent_at ? parseISO(r.last_email_sent_at) : null;
            return sent && format(sent, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          }).length,
          unit: `/ ${domainHealth.dailyLimit} daily limit`,
        },
      ];

      // ========== DAILY TRENDS ==========
      const engagementTrends = aggregateDailyStats(allRecipients, dateRangeData);

      // ========== DELIVERY FUNNEL ==========
      const totalBotOpens = campaigns.reduce((sum, c) => sum + (c.bot_open_count || 0), 0);
      const totalBotClicks = campaigns.reduce((sum, c) => sum + (c.bot_click_count || 0), 0);
      const deliveryFunnel = {
        stages: calculateFunnelStages(
          totalEmails,
          totalEmails - totalBounced, // approximate delivered
          totalOpens,
          totalClicks,
          totalReplies,
          totalBotOpens,
          totalBotClicks
        ),
        totalSent: totalEmails,
      };

      // ========== ACTIVE CAMPAIGNS ==========
      const activeCampaigns: ActiveCampaign[] = campaigns
        .filter((c) => c.status === 'running' || c.status === 'scheduled')
        .slice(0, 10) // Limit display
        .map((campaign) => {
          const campaignRecipients = allRecipients.filter(
            (r) => r.campaigns?.id === campaign.id
          );
          const sent = campaignRecipients.length;
          const opens = campaignRecipients.filter((r) => r.opened_at).length;
          const clicks = campaignRecipients.filter((r) => r.clicked_at).length;
          const replies = campaignRecipients.filter((r) => r.replied).length;

          return {
            id: campaign.id,
            name: campaign.name,
            status: (campaign.status as any) || 'running',
            sent,
            opens,
            clicks,
            replies,
            openRate: calculateRate(opens, sent),
            clickRate: calculateRate(clicks, sent),
            replyRate: calculateRate(replies, sent),
            createdAt: campaign.created_at,
            updatedAt: campaign.updated_at,
          };
        });

      // ========== SENDER STATS ==========
      const senderStats = aggregateSenderStats(allRecipients, configs);

      // ========== ACTIVITY FEED ==========
      const activities: ActivityEntry[] = [];
      allRecipients.slice(0, 50).forEach((recipient) => {
        if (recipient.opened_at) {
          activities.push({
            id: `${recipient.id}-open`,
            type: 'opened',
            recipientEmail: recipient.email,
            campaignId: recipient.campaigns?.id || '',
            campaignName: recipient.campaigns?.name || 'Unknown',
            timestamp: recipient.opened_at,
          });
        }
        if (recipient.clicked_at) {
          activities.push({
            id: `${recipient.id}-click`,
            type: 'clicked',
            recipientEmail: recipient.email,
            campaignId: recipient.campaigns?.id || '',
            campaignName: recipient.campaigns?.name || 'Unknown',
            timestamp: recipient.clicked_at,
          });
        }
        if (recipient.replied) {
          activities.push({
            id: `${recipient.id}-reply`,
            type: 'replied',
            recipientEmail: recipient.email,
            campaignId: recipient.campaigns?.id || '',
            campaignName: recipient.campaigns?.name || 'Unknown',
            timestamp: recipient.updated_at,
          });
        }
        if (recipient.bounced_at) {
          activities.push({
            id: `${recipient.id}-bounce`,
            type: 'bounced',
            recipientEmail: recipient.email,
            campaignId: recipient.campaigns?.id || '',
            campaignName: recipient.campaigns?.name || 'Unknown',
            timestamp: recipient.bounced_at,
          });
        }
      });

      // Sort activities by timestamp (newest first)
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // ========== BUILD FINAL DATA ==========
      const newData: DashboardData = {
        kpis,
        engagementTrends,
        deliveryFunnel,
        activeCampaigns,
        senderStats,
        domainHealth,
        activities: activities.slice(0, 50),
        totalEmails,
        totalOpens,
        totalClicks,
        totalReplies,
        totalBounced,
        totalFailed,
        lastUpdated: new Date(),
        dateRange: dateRangeData,
      };

      setData(newData);
      setError(null);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      console.error('Analytics data fetch error:', err);
    }
  }, [dateRange, industry, getDateRange, aggregateDailyStats, aggregateSenderStats]);

  // ============================================================================
  // REAL-TIME SUBSCRIPTIONS
  // ============================================================================

  const setupRealtimeSubscriptions = useCallback(() => {
    const user = supabase.auth.getUser();
    user.then(({ data }) => {
      if (!data.user) return;

      const userId = data.user.id;
      let debounceTimer: number;

      const handleChange = () => {
        clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          setIsRefetching(true);
          fetchAnalyticsData().then(() => setIsRefetching(false));
        }, 750);
      };

      // Subscribe to campaign changes
      const campaignChannel = supabase
        .channel(`campaigns-${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'campaigns',
          filter: `user_id=eq.${userId}`,
        }, handleChange)
        .subscribe();

      // Subscribe to recipient changes
      const recipientChannel = supabase
        .channel(`recipients-${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'recipients',
        }, handleChange)
        .subscribe();

      subscriptionsRef.current.push(() => {
        supabase.removeChannel(campaignChannel);
        supabase.removeChannel(recipientChannel);
        clearTimeout(debounceTimer);
      });
    });
  }, [fetchAnalyticsData]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Initial load
  useEffect(() => {
    if (!hasLoadedOnceRef.current) {
      hasLoadedOnceRef.current = true;
      setLoading(true);
      fetchAnalyticsData().finally(() => setLoading(false));
      setupRealtimeSubscriptions();
    }
  }, []);

  // Refetch on date range change
  useEffect(() => {
    if (hasLoadedOnceRef.current) {
      setIsRefetching(true);
      fetchAnalyticsData().finally(() => setIsRefetching(false));
    }
  }, [dateRange, industry]);

  // Polling fallback (every 60 seconds)
  useEffect(() => {
    pollIntervalRef.current = window.setInterval(() => {
      setIsRefetching(true);
      fetchAnalyticsData().finally(() => setIsRefetching(false));
    }, 60000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchAnalyticsData]);

  // Cleanup subscriptions
  useEffect(() => {
    return () => {
      subscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchAnalyticsData,
    isRefetching,
  };
}
