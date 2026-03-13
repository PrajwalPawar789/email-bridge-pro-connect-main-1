/**
 * Pure utility functions for analytics calculations
 * These are testable, performance-optimized, and reusable
 */

import { IndustryBenchmarks, PerformanceLevel, KPICardData, FunnelStage } from '@/types/analytics';

// ============================================================================
// BENCHMARK DATA
// ============================================================================

/**
 * Industry benchmarks for email metrics
 * These should be fetched from database in production
 * For now, using sensible defaults
 */
export const INDUSTRY_BENCHMARKS: Record<string, IndustryBenchmarks> = {
  general: {
    industry: 'general',
    openRate: 21.5,
    clickRate: 2.5,
    replyRate: 0.5,
    bounceRate: 2.0,
    description: 'Average across all industries',
  },
  technology: {
    industry: 'technology',
    openRate: 24.0,
    clickRate: 3.2,
    replyRate: 0.8,
    bounceRate: 1.5,
    description: 'Tech/SaaS B2B emails',
  },
  real_estate: {
    industry: 'real_estate',
    openRate: 28.0,
    clickRate: 3.5,
    replyRate: 1.2,
    bounceRate: 2.5,
    description: 'Real estate listings and inquiries',
  },
  consulting: {
    industry: 'consulting',
    openRate: 23.0,
    clickRate: 2.8,
    replyRate: 1.0,
    bounceRate: 1.8,
    description: 'Consulting and professional services',
  },
  healthcare: {
    industry: 'healthcare',
    openRate: 26.0,
    clickRate: 2.2,
    replyRate: 0.6,
    bounceRate: 2.2,
    description: 'Healthcare provider communications',
  },
};

// ============================================================================
// TREND & DELTA CALCULATIONS
// ============================================================================

/**
 * Calculate percentage change between two values
 * @param current - Current period value
 * @param previous - Previous period value
 * @returns Object with percentage change and direction
 */
export function calculateTrendDelta(current: number, previous: number) {
  if (previous === 0) {
    return {
      value: current > 0 ? 100 : 0,
      direction: current > 0 ? ('up' as const) : 'neutral' as const,
      percentageChange: current > 0 ? 100 : 0,
    };
  }

  const percentageChange = ((current - previous) / previous) * 100;
  const direction = percentageChange > 0.5 ? ('up' as const) : percentageChange < -0.5 ? ('down' as const) : ('neutral' as const);

  return {
    value: Math.abs(Math.round(percentageChange * 10) / 10), // Round to 1 decimal
    direction,
    percentageChange,
  };
}

/**
 * Compare a metric against industry benchmarks
 * @param actualRate - Actual metric value (as percentage)
 * @param benchmarkRate - Industry benchmark (as percentage)
 * @returns Performance level and description
 */
export function getPerformanceLevel(actualRate: number, benchmarkRate: number): {
  level: PerformanceLevel;
  message: string;
  percentVsBenchmark: number;
} {
  const percentVsBenchmark = actualRate - benchmarkRate;

  // Define thresholds
  if (actualRate >= benchmarkRate * 1.2) {
    return {
      level: 'excellent',
      message: 'Excellent - well above industry average',
      percentVsBenchmark,
    };
  } else if (actualRate >= benchmarkRate * 1.05) {
    return {
      level: 'good',
      message: 'Good - above industry average',
      percentVsBenchmark,
    };
  } else if (actualRate >= benchmarkRate * 0.95) {
    return {
      level: 'monitor',
      message: 'In line with industry average',
      percentVsBenchmark,
    };
  } else if (actualRate >= benchmarkRate * 0.8) {
    return {
      level: 'risk',
      message: 'Below industry average - monitor closely',
      percentVsBenchmark,
    };
  } else {
    return {
      level: 'critical',
      message: 'Well below industry average - requires attention',
      percentVsBenchmark,
    };
  }
}

// ============================================================================
// RATE CALCULATIONS
// ============================================================================

/**
 * Calculate rate from count and total
 * @param count - Number of occurrences
 * @param total - Total number
 * @param decimals - Number of decimal places
 * @returns Rate as percentage
 */
export function calculateRate(count: number, total: number, decimals: number = 2): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 100 * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Format a rate for display with % symbol
 * @param rate - Rate as percentage
 * @param decimals - Number of decimal places
 * @returns Formatted string like "24.5%"
 */
export function formatRate(rate: number, decimals: number = 1): string {
  return `${rate.toFixed(decimals)}%`;
}

/**
 * Format a large number with K/M/B suffix
 * @param num - Number to format
 * @returns Formatted string like "2.5K", "1.2M"
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

// ============================================================================
// FUNNEL CALCULATIONS
// ============================================================================

/**
 * Calculate funnel percentages and health status
 * @param sent - Number sent
 * @param delivered - Number delivered
 * @param opens - Number opened
 * @param clicks - Number clicked
 * @param replies - Number replied
 * @returns Array of funnel stages with metrics
 */
export function calculateFunnelStages(
  sent: number,
  delivered: number,
  opens: number,
  clicks: number,
  replies: number,
  botOpens: number = 0,
  botClicks: number = 0
): FunnelStage[] {
  const calcPercentage = (count: number) => (sent > 0 ? Math.round((count / sent) * 100) : 0);

  const stages: FunnelStage[] = [
    {
      id: 'sent',
      label: 'Sent',
      count: sent,
      percentage: 100,
      health: 'excellent',
    },
    {
      id: 'delivered',
      label: 'Delivered',
      count: delivered,
      percentage: calcPercentage(delivered),
      health: getDeliveryHealth(delivered, sent),
      tooltip: `${formatRate(calculateRate(delivered, sent))} delivery rate`,
    },
    {
      id: 'opened',
      label: 'Opened',
      count: opens - botOpens,
      percentage: calcPercentage(opens - botOpens),
      health: getOpenHealth(opens - botOpens, sent),
      tooltip: `${formatRate(calculateRate(opens - botOpens, sent))} open rate`,
    },
    {
      id: 'clicked',
      label: 'Clicked',
      count: clicks - botClicks,
      percentage: calcPercentage(clicks - botClicks),
      health: getClickHealth(clicks - botClicks, sent),
      tooltip: `${formatRate(calculateRate(clicks - botClicks, opens))} click rate`,
    },
    {
      id: 'replied',
      label: 'Replied',
      count: replies,
      percentage: calcPercentage(replies),
      health: getReplyHealth(replies, sent),
      tooltip: `${formatRate(calculateRate(replies, opens))} reply rate`,
    },
  ];

  // Add bot interaction info if present
  if (botOpens > 0 || botClicks > 0) {
    stages.push({
      id: 'bot-interactions',
      label: 'Bot Activity',
      count: botOpens + botClicks,
      percentage: 0, // Not part of main funnel
      health: 'monitor',
      tooltip: `${botOpens} bot opens, ${botClicks} bot clicks detected`,
    });
  }

  return stages;
}

// ============================================================================
// HEALTH STATUS FUNCTIONS
// ============================================================================

function getDeliveryHealth(delivered: number, sent: number): PerformanceLevel {
  const rate = calculateRate(delivered, sent);
  if (rate >= 98) return 'excellent';
  if (rate >= 95) return 'good';
  if (rate >= 90) return 'monitor';
  if (rate >= 80) return 'risk';
  return 'critical';
}

function getOpenHealth(opens: number, sent: number): PerformanceLevel {
  const rate = calculateRate(opens, sent);
  const benchmark = INDUSTRY_BENCHMARKS.general.openRate;
  return getPerformanceLevel(rate, benchmark).level;
}

function getClickHealth(clicks: number, sent: number): PerformanceLevel {
  const rate = calculateRate(clicks, sent);
  const benchmark = INDUSTRY_BENCHMARKS.general.clickRate;
  return getPerformanceLevel(rate, benchmark).level;
}

function getReplyHealth(replies: number, sent: number): PerformanceLevel {
  const rate = calculateRate(replies, sent);
  const benchmark = INDUSTRY_BENCHMARKS.general.replyRate;
  return getPerformanceLevel(rate, benchmark).level;
}

// ============================================================================
// HEALTH STATUS STYLING
// ============================================================================

export function getHealthStatusColor(level: PerformanceLevel): string {
  switch (level) {
    case 'excellent':
      return 'text-green-700 bg-green-50 border-green-200';
    case 'good':
      return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'monitor':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'risk':
      return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'critical':
      return 'text-red-700 bg-red-50 border-red-200';
  }
}

export function getHealthStatusIcon(level: PerformanceLevel) {
  switch (level) {
    case 'excellent':
      return '✓';
    case 'good':
      return '→';
    case 'monitor':
      return '!';
    case 'risk':
      return '⚠';
    case 'critical':
      return '✕';
  }
}

export function getHealthStatusLabel(level: PerformanceLevel): string {
  switch (level) {
    case 'excellent':
      return 'Excellent';
    case 'good':
      return 'Good';
    case 'monitor':
      return 'Monitor';
    case 'risk':
      return 'At Risk';
    case 'critical':
      return 'Critical';
  }
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

/**
 * Format time ago string for last updated
 * @param date - Date object
 * @returns Human-readable time like "2 min ago"
 */
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

// ============================================================================
// EXPORT HELPERS
// ============================================================================

export function getIndustryBenchmark(industryKey: string): IndustryBenchmarks {
  return INDUSTRY_BENCHMARKS[industryKey] || INDUSTRY_BENCHMARKS.general;
}

export function getAvailableIndustries(): Array<{ value: string; label: string; description: string }> {
  return Object.values(INDUSTRY_BENCHMARKS).map((b) => ({
    value: b.industry,
    label: b.industry.charAt(0).toUpperCase() + b.industry.slice(1).replace('_', ' '),
    description: b.description || '',
  }));
}

/**
 * Safe division to avoid NaN
 */
export function safeDivide(numerator: number, denominator: number, defaultValue: number = 0): number {
  if (denominator === 0 || !isFinite(numerator) || !isFinite(denominator)) {
    return defaultValue;
  }
  return numerator / denominator;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
