/**
 * Analytics Dashboard - Redesigned Parent Component
 * Orchestrates all sub-components with proper data flow
 * Handles filters, state management, and real-time updates
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';

// Sub-components
import { DashboardHeroSection } from './DashboardHeroSection';
import { FilterToolbar } from './FilterToolbar';
import { KPICardsSection } from './KPICardsSection';
import { EngagementTrendsChart } from './EngagementTrendsChart';
import { DeliveryFunnelCard } from './DeliveryFunnelCard';
import { ActiveCampaignsTable } from './ActiveCampaignsTable';
import { ActivityFeedCard } from './ActivityFeedCard';

// UI Components
import { AppLoader } from '@/components/ui/app-loader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

// Types
import { EngagementTrendConfig } from '@/types/analytics';

/**
 * Main Analytics Dashboard Component
 */
export const AnalyticsDashboard: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Filter state management
  const { filters, setFilters } = useDashboardFilters();

  // Chart configuration
  const [engagementConfig, setEngagementConfig] = useState<EngagementTrendConfig>({
    showOpens: true,
    showClicks: true,
    showReplies: true,
  });

  // Analytics data fetching
  const {
    data,
    loading,
    error: dataError,
    refetch,
    isRefetching,
  } = useAnalyticsData(filters.dateRange, filters.industry);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleDateRangeChange = useCallback((range: string) => {
    setFilters({ dateRange: range as any });
  }, [setFilters]);

  const handleFilterChange = useCallback((updatedFilters: Partial<typeof filters>) => {
    setFilters(updatedFilters);
  }, [setFilters]);

  const handleCreateCampaign = useCallback(() => {
    navigate('/campaigns?action=new');
  }, [navigate]);

  const handleRefresh = useCallback(async () => {
    try {
      await refetch();
      toast({
        title: 'Refreshed',
        description: 'Analytics data updated',
        duration: 2000,
      });
    } catch (err) {
      toast({
        title: 'Refresh failed',
        description: 'Unable to update analytics data',
        variant: 'destructive',
      });
    }
  }, [refetch, toast]);

  const handleEngagementConfigChange = useCallback((config: Partial<EngagementTrendConfig>) => {
    setEngagementConfig((current) => ({ ...current, ...config }));
  }, []);

  // ============================================================================
  // AUTHENTICATION CHECK
  // ============================================================================

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <AppLoader size="lg" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Hero Header */}
      <DashboardHeroSection
        dateRange={filters.dateRange as any}
        onDateRangeChange={handleDateRangeChange}
        onCreateCampaign={handleCreateCampaign}
        lastUpdated={data.lastUpdated}
        updating={isRefetching}
      />

      {/* Filter Toolbar */}
      <FilterToolbar
        filters={filters}
        onFiltersChange={handleFilterChange}
        refreshing={isRefetching}
        onRefresh={handleRefresh}
      />

      {/* Main Content */}
      <div className="px-5 lg:px-8 py-6 max-w-7xl mx-auto space-y-6">
        {/* Error Alert */}
        {dataError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {dataError.message || 'Unable to load analytics data'}
              <button
                onClick={handleRefresh}
                className="ml-2 underline hover:text-red-800"
              >
                Try again
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <AppLoader size="lg" />
          </div>
        ) : (
          <>
            {/* KPI Cards Section */}
            <div>
              <KPICardsSection
                kpis={data.kpis}
                loading={loading}
                error={dataError}
                onRetry={handleRefresh}
              />
            </div>

            {/* Engagement Trends Chart */}
            <div className="lg:col-span-2">
              <EngagementTrendsChart
                data={data.engagementTrends}
                loading={loading}
                error={dataError}
                config={engagementConfig}
                onConfigChange={handleEngagementConfigChange}
                onRetry={handleRefresh}
              />
            </div>

            {/* Grid for remaining sections */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Main content (2/3 width) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Delivery Funnel */}
                <DeliveryFunnelCard
                  data={data.deliveryFunnel}
                  onStageClick={(stageId) => {
                    toast({
                      title: 'Feature coming soon',
                      description: `Stage filter: ${stageId}`,
                    });
                  }}
                />

                {/* Active Campaigns Table */}
                <ActiveCampaignsTable
                  campaigns={data.activeCampaigns}
                  loading={loading}
                  error={dataError}
                  sortBy={filters.sortBy}
                  sortOrder={filters.sortOrder as any}
                  onSort={(field) => {
                    const newOrder =
                      filters.sortBy === field && filters.sortOrder === 'desc'
                        ? 'asc'
                        : 'desc';
                    setFilters({ sortBy: field, sortOrder: newOrder });
                  }}
                  onCampaignClick={(campaignId) => {
                    navigate(`/campaigns/${campaignId}`);
                  }}
                  onBulkAction={(action, campaignIds) => {
                    toast({
                      title: `Campaign ${action}`,
                      description: `${campaignIds.length} campaign(s) ${action}d`,
                    });
                  }}
                />
              </div>

              {/* Right: Sidebar (1/3 width) */}
              <div className="space-y-6">
                {/* Domain Health Placeholder */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Domain Health</CardTitle>
                    <CardDescription>Sender reputation & verification</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Reputation</p>
                      <p className="font-semibold text-sm">{data.domainHealth.reputation}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Spam Rate</p>
                      <p className="font-semibold text-sm">{data.domainHealth.spamRate?.toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Postmaster Status</p>
                      <p className="font-semibold text-sm">{data.domainHealth.postmasterConnected ? '✓ Connected' : '○ Not Connected'}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Activity Feed */}
                <ActivityFeedCard
                  activities={data.activities}
                  loading={loading}
                  error={dataError}
                  maxItems={50}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

AnalyticsDashboard.displayName = 'AnalyticsDashboard';

export default AnalyticsDashboard;
