/**
 * DashboardHeroSection Component
 * Sticky header with page title, time range selector, and primary CTA
 * Reduced density per redesign requirements
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Plus } from 'lucide-react';
import { DashboardHeroSectionProps } from '@/types/analytics';
import { formatTimeAgo } from '@/lib/analyticsCalculations';
import { cn } from '@/lib/utils';

export const DashboardHeroSection: React.FC<DashboardHeroSectionProps> = ({
  dateRange,
  onDateRangeChange,
  onCreateCampaign,
  lastUpdated,
  updating = false,
}) => {
  return (
    <div
      className={cn(
        'sticky top-0 z-40 bg-white border-b border-gray-200',
        'supports-backdrop-blur:bg-white/80 supports-backdrop-blur:backdrop-blur'
      )}
    >
      {/* Hero Content */}
      <div className="px-5 lg:px-8 py-4 lg:py-6 max-w-7xl mx-auto">
        {/* Title and tagline */}
        <div className="mb-4 lg:mb-6">
          <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            Analytics Command Center
          </h1>
          <p className="text-gray-600 text-sm lg:text-base">
            Real-time insights and deliverability signals across every campaign
          </p>
        </div>

        {/* Controls Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Left: Time Range + Last Updated */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="date-range" className="text-sm font-medium text-gray-700">
                Time Period:
              </label>
              <Select value={dateRange} onValueChange={onDateRangeChange}>
                <SelectTrigger className="w-[140px]" id="date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Last Updated Indicator */}
            {lastUpdated && (
              <div className="text-xs text-gray-500 hidden sm:block">
                Updated {formatTimeAgo(lastUpdated)}
              </div>
            )}
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-9"
              disabled={updating}
              title="Refresh analytics data"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', updating && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <Button
              onClick={onCreateCampaign}
              size="sm"
              className="gap-2 h-9 bg-blue-600 hover:bg-blue-700 text-white"
              title="Create and launch a new campaign"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New Campaign</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>

        {/* Mobile: Updated timestamp */}
        {lastUpdated && (
          <div className="text-xs text-gray-500 mt-3 sm:hidden">
            Updated {formatTimeAgo(lastUpdated)}
          </div>
        )}
      </div>
    </div>
  );
};

DashboardHeroSection.displayName = 'DashboardHeroSection';
