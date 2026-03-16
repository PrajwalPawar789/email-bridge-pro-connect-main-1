/**
 * useDashboardFilters Hook
 * Manages dashboard filters with URL persistence for deep linking and sharing
 */

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardFilters, TimeRange, SortOrder, UseDashboardFiltersReturn } from '@/types/analytics';

const DEFAULT_FILTERS: DashboardFilters = {
  dateRange: '30',
  industry: 'general',
  sortBy: 'replies',
  sortOrder: 'desc',
};

export function useDashboardFilters(): UseDashboardFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFiltersState] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [isInitialized, setIsInitialized] = useState(false);

  // ============================================================================
  // INITIALIZATION - Sync from URL params
  // ============================================================================

  useEffect(() => {
    if (!isInitialized) {
      const urlFilters = {
        dateRange: (searchParams.get('dateRange') || DEFAULT_FILTERS.dateRange) as TimeRange,
        industry: searchParams.get('industry') || DEFAULT_FILTERS.industry,
        sortBy: searchParams.get('sortBy') || DEFAULT_FILTERS.sortBy,
        sortOrder: (searchParams.get('sortOrder') || DEFAULT_FILTERS.sortOrder) as SortOrder,
      };

      setFiltersState(urlFilters);
      setIsInitialized(true);
    }
  }, [searchParams, isInitialized]);

  // ============================================================================
  // FILTER SETTERS
  // ============================================================================

  /**
   * Update filters and sync to URL params
   */
  const setFilters = useCallback(
    (partialFilters: Partial<DashboardFilters>) => {
      setFiltersState((current) => {
        const updated = { ...current, ...partialFilters };

        // Validate values
        if (updated.dateRange && !['7', '30', '90', '365'].includes(updated.dateRange)) {
          updated.dateRange = DEFAULT_FILTERS.dateRange as TimeRange;
        }
        if (updated.sortOrder && !['asc', 'desc'].includes(updated.sortOrder)) {
          updated.sortOrder = DEFAULT_FILTERS.sortOrder as SortOrder;
        }

        // Update URL params
        const newParams = new URLSearchParams();
        if (updated.dateRange && updated.dateRange !== DEFAULT_FILTERS.dateRange) {
          newParams.set('dateRange', updated.dateRange);
        }
        if (updated.industry && updated.industry !== DEFAULT_FILTERS.industry) {
          newParams.set('industry', updated.industry);
        }
        if (updated.sortBy && updated.sortBy !== DEFAULT_FILTERS.sortBy) {
          newParams.set('sortBy', updated.sortBy);
        }
        if (updated.sortOrder && updated.sortOrder !== DEFAULT_FILTERS.sortOrder) {
          newParams.set('sortOrder', updated.sortOrder);
        }

        setSearchParams(newParams, { replace: false });
        return updated;
      });
    },
    [setSearchParams]
  );

  /**
   * Reset to default filters
   */
  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  /**
   * Sync current state with URL (useful for externally triggered URL changes)
   */
  const syncWithUrl = useCallback(() => {
    const urlFilters = {
      dateRange: (searchParams.get('dateRange') || DEFAULT_FILTERS.dateRange) as TimeRange,
      industry: searchParams.get('industry') || DEFAULT_FILTERS.industry,
      sortBy: searchParams.get('sortBy') || DEFAULT_FILTERS.sortBy,
      sortOrder: (searchParams.get('sortOrder') || DEFAULT_FILTERS.sortOrder) as SortOrder,
    };
    setFiltersState(urlFilters);
  }, [searchParams]);

  // ============================================================================
  // CONVENIENCE SETTERS
  // ============================================================================

  /**
   * Set specific filter fields with auto-update
   */
  const setDateRange = useCallback(
    (range: TimeRange) => setFilters({ dateRange: range }),
    [setFilters]
  );

  const setIndustry = useCallback(
    (industry: string) => setFilters({ industry }),
    [setFilters]
  );

  const setSorting = useCallback(
    (sortBy: string, sortOrder?: SortOrder) => {
      const updates: Partial<DashboardFilters> = { sortBy };
      if (sortOrder) updates.sortOrder = sortOrder;
      setFilters(updates);
    },
    [setFilters]
  );

  return {
    filters,
    setFilters,
    resetFilters,
    syncWithUrl,
  };
}

// ============================================================================
// UTILITIES FOR COMMON FILTER OPERATIONS
// ============================================================================

export function getDateRangeLabel(range: TimeRange): string {
  const labels: Record<TimeRange, string> = {
    '7': 'Last 7 days',
    '30': 'Last 30 days',
    '90': 'Last 90 days',
    '365': 'Last year',
  };
  return labels[range] || 'Last 30 days';
}

export function getSortLabel(sortBy: string): string {
  const labels: Record<string, string> = {
    sent: 'Emails Sent',
    opens: 'Opens',
    clicks: 'Clicks',
    replies: 'Replies',
    bounces: 'Bounces',
    'open-rate': 'Open Rate',
    'click-rate': 'Click Rate',
    'reply-rate': 'Reply Rate',
    'created-at': 'Created Date',
    'updated-at': 'Updated Date',
  };
  return labels[sortBy] || 'Replies';
}

export function getIndustryLabel(industry: string): string {
  const labels: Record<string, string> = {
    general: 'General',
    technology: 'Technology',
    real_estate: 'Real Estate',
    consulting: 'Consulting',
    healthcare: 'Healthcare',
  };
  return labels[industry] || 'General';
}
