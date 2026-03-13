/**
 * Comprehensive type definitions for the Analytics Dashboard redesign
 * Covers all dashboard sections with proper type safety
 */

// ============================================================================
// BASIC TYPES
// ============================================================================

export type TimeRange = '7' | '30' | '90' | '365';
export type SortOrder = 'asc' | 'desc';
export type PerformanceLevel = 'excellent' | 'good' | 'monitor' | 'risk' | 'critical';
export type EngagementMetricType = 'opens' | 'clicks' | 'replies';
export type ActivityEventType = 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed';

// ============================================================================
// KPI & METRIC TYPES
// ============================================================================

export interface KPICardData {
  id: string;
  label: string;
  value: number;
  unit?: string;
  trend?: {
    value: number; // percentage change
    direction: 'up' | 'down' | 'neutral';
    previousValue: number;
  };
  benchmark?: {
    average: number;
    performance: PerformanceLevel;
    industry?: string;
  };
  clickAction?: {
    label: string;
    action: () => void;
  };
  loading?: boolean;
  error?: Error | null;
}

export interface TrendData {
  date: string; // ISO date string
  opens: number;
  clicks: number;
  replies: number;
  sent?: number;
}

export interface EngagementTrendConfig {
  showOpens: boolean;
  showClicks: boolean;
  showReplies: boolean;
}

// ============================================================================
// FUNNEL & CONVERSION TYPES
// ============================================================================

export interface FunnelStage {
  id: string;
  label: string;
  count: number;
  percentage: number; // of initial sent
  health: PerformanceLevel;
  tooltip?: string;
  affectedCampaigns?: Array<{
    id: string;
    name: string;
    count: number;
  }>;
}

export interface DeliveryFunnelData {
  stages: FunnelStage[];
  totalSent: number;
  loading?: boolean;
  error?: Error | null;
}

// ============================================================================
// CAMPAIGN & SENDER TYPES
// ============================================================================

export interface ActiveCampaign {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'scheduled' | 'completed' | 'failed';
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  createdAt: string;
  updatedAt: string;
  emailConfig?: {
    id: string;
    smtpUsername: string;
  };
}

export interface SenderStat {
  emailConfigId: string;
  senderEmail: string;
  sent: number;
  opens: number;
  replies: number;
  bounces: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
  health: PerformanceLevel;
  healthLabel: string;
}

export interface ActiveCampaignsTableProps {
  campaigns: ActiveCampaign[];
  senders?: SenderStat[];
  loading?: boolean;
  error?: Error | null;
  sortBy?: string;
  sortOrder?: SortOrder;
  onSort?: (field: string) => void;
  onCampaignClick?: (campaignId: string) => void;
  onBulkAction?: (action: 'pause' | 'resume', campaignIds: string[]) => void;
}

// ============================================================================
// DOMAIN HEALTH & SENDER PERFORMANCE TYPES
// ============================================================================

export interface DomainReputationLevel = 'High' | 'Medium' | 'Low' | 'Bad' | 'Not Determined';

export interface DomainHealthData {
  domain?: string;
  reputation: DomainReputationLevel;
  spamRate: number; // 0-100
  authStatus?: {
    spf: 'pass' | 'fail' | 'not_set' | 'not_checked';
    dkim: 'pass' | 'fail' | 'not_set' | 'not_checked';
    dmarc: 'pass' | 'fail' | 'not_set' | 'not_checked';
  };
  postmasterConnected: boolean;
  dailyLimit: number;
  dailySent: number;
  lastChecked?: string;
}

export interface SenderPerformanceData {
  emailConfigId: string;
  senderEmail: string;
  reputation: 'healthy' | 'monitor' | 'risk';
  openRate: number;
  replyRate: number;
  bounceRate: number;
  sent24h: number;
  opened24h: number;
  replied24h: number;
  bounced24h: number;
}

export interface DeliverabilityMetrics {
  inboxRate: number;
  spamRate: number;
  softBounces: number;
  hardBounces: number;
  complaints: number;
}

export interface ActivityEntry {
  id: string;
  type: ActivityEventType;
  recipientEmail: string;
  campaignId: string;
  campaignName: string;
  timestamp: string; // ISO datetime
  metadata?: {
    linkUrl?: string;
    userAgent?: string;
    ipAddress?: string;
  };
}

// ============================================================================
// DASHBOARD STATE & FILTER TYPES
// ============================================================================

export interface DashboardFilters {
  dateRange: TimeRange;
  industry?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface DashboardDateRange {
  start: Date;
  end: Date;
}

// ============================================================================
// AGGREGATED DASHBOARD DATA TYPE
// ============================================================================

export interface DashboardData {
  // KPI Section
  kpis: KPICardData[];

  // Engagement Trends
  engagementTrends: TrendData[];
  engagementLoading?: boolean;
  engagementError?: Error | null;

  // Delivery Funnel
  deliveryFunnel: DeliveryFunnelData;

  // Active Campaigns
  activeCampaigns: ActiveCampaign[];
  campaignsLoading?: boolean;
  campaignsError?: Error | null;

  // Sender Performance
  senderStats: SenderStat[];
  senderPerformance?: SenderPerformanceData[];

  // Domain Health
  domainHealth: DomainHealthData;
  deliverabilityMetrics?: DeliverabilityMetrics;
  domainHealthLoading?: boolean;
  domainHealthError?: Error | null;

  // Activity Feed
  activities: ActivityEntry[];
  activitiesLoading?: boolean;
  activitiesError?: Error | null;

  // Metadata
  lastUpdated?: Date;
  dateRange: DashboardDateRange;
  totalEmails: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;
  totalBounced: number;
  totalFailed: number;
}

// ============================================================================
// COMPONENT PROP TYPES
// ============================================================================

export interface DashboardHeroSectionProps {
  dateRange: TimeRange;
  onDateRangeChange: (range: TimeRange) => void;
  onCreateCampaign: () => void;
  lastUpdated?: Date;
  updating?: boolean;
}

export interface FilterToolbarProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: Partial<DashboardFilters>) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export interface KPICardsSectionProps {
  kpis: KPICardData[];
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

export interface EngagementTrendsChartProps {
  data: TrendData[];
  loading?: boolean;
  error?: Error | null;
  config: EngagementTrendConfig;
  onConfigChange: (config: Partial<EngagementTrendConfig>) => void;
  onRetry?: () => void;
}

export interface DeliveryFunnelCardProps {
  data: DeliveryFunnelData;
  onStageClick?: (stageId: string) => void;
}

export interface DomainHealthCenterProps {
  domain?: DomainHealthData;
  senderPerformance?: SenderPerformanceData[];
  deliverabilityMetrics?: DeliverabilityMetrics;
  recentActivities?: ActivityEntry[];
  loading?: boolean;
  error?: Error | null;
  onPostmasterConnect?: (domain: string) => void;
}

export interface ActivityFeedCardProps {
  activities: ActivityEntry[];
  loading?: boolean;
  error?: Error | null;
  maxItems?: number;
}

// ============================================================================
// HOOK RETURN TYPES
// ============================================================================

export interface UseAnalyticsDataReturn {
  data: DashboardData;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  isRefetching: boolean;
}

export interface UseDashboardFiltersReturn {
  filters: DashboardFilters;
  setFilters: (filters: Partial<DashboardFilters>) => void;
  resetFilters: () => void;
  syncWithUrl: () => void;
}

// ============================================================================
// API & BENCHMARK TYPES
// ============================================================================

export interface IndustryBenchmarks {
  industry: string;
  openRate: number; // percentage
  clickRate: number; // percentage
  replyRate: number; // percentage
  bounceRate: number; // percentage
  description?: string;
}

export interface PostmasterDomainData {
  domain: string;
  domainReputation: DomainReputationLevel;
  userReportedSpamRatio: number;
  authenticatedPercentage: number;
  tlsPercentage: number;
  ipReputations?: Array<{
    ipAddress: string;
    reputation: 'high' | 'medium' | 'low' | 'bad';
    sampleSize: number;
  }>;
}

// ============================================================================
// ERROR & STATE TYPES
// ============================================================================

export interface DashboardError {
  code: string;
  message: string;
  timestamp: Date;
  retryable: boolean;
  action?: string; // CTA for user
}

export type DashboardLoadingState = 'idle' | 'loading' | 'refetching' | 'error' | 'success';
