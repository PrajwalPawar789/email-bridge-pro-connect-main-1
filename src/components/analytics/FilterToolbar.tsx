/**
 * FilterToolbar Component
 * Desktop: Sticky inline filter bar
 * Mobile: Drawer-based filter panel
 * Includes industry selector, sort controls, and refresh
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { FilterToolbarProps } from '@/types/analytics';
import { Filter, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getIndustryLabel, getSortLabel } from '@/hooks/useDashboardFilters';

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
  filters,
  onFiltersChange,
  refreshing = false,
  onRefresh,
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handleChangeFilter = (key: string, value: string) => {
    onFiltersChange({ [key]: value });
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    }
  };

  // ============================================================================
  // FILTER CONTROLS SHARED BETWEEN DESKTOP AND MOBILE
  // ============================================================================

  const FilterControls = () => (
    <div className="space-y-4">
      {/* Industry Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Industry Benchmark</label>
        <Select value={filters.industry || 'general'} onValueChange={(value) => handleChangeFilter('industry', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="technology">Technology</SelectItem>
            <SelectItem value="real_estate">Real Estate</SelectItem>
            <SelectItem value="consulting">Consulting</SelectItem>
            <SelectItem value="healthcare">Healthcare</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">Used for performance benchmarks and KPI comparison</p>
      </div>

      <Separator className="my-4" />

      {/* Sorting Controls */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Sort Campaigns By</label>
        <Select value={filters.sortBy || 'replies'} onValueChange={(value) => handleChangeFilter('sortBy', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sent">Emails Sent</SelectItem>
            <SelectItem value="opens">Opens</SelectItem>
            <SelectItem value="clicks">Clicks</SelectItem>
            <SelectItem value="replies">Replies</SelectItem>
            <SelectItem value="bounces">Bounces</SelectItem>
            <SelectItem value="open-rate">Open Rate</SelectItem>
            <SelectItem value="click-rate">Click Rate</SelectItem>
            <SelectItem value="reply-rate">Reply Rate</SelectItem>
            <SelectItem value="created-at">Created Date</SelectItem>
            <SelectItem value="updated-at">Updated Date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sort Order */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Order</label>
        <Select value={filters.sortOrder || 'desc'} onValueChange={(value) => handleChangeFilter('sortOrder', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Highest to Lowest</SelectItem>
            <SelectItem value="asc">Lowest to Highest</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <>
      {/* DESKTOP FILTER BAR (sticky, inline) */}
      <div className="hidden md:block sticky top-20 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-5 lg:px-8 py-3 max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Filter labels */}
            <div className="flex items-center gap-4 flex-1 overflow-x-auto pb-2 md:pb-0">
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                Benchmark: <span className="text-gray-900 font-semibold">{getIndustryLabel(filters.industry || 'general')}</span>
              </span>
              <div className="h-4 border-l border-gray-200" />
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                Sort: <span className="text-gray-900 font-semibold">{getSortLabel(filters.sortBy || 'replies')}</span>
              </span>
              {filters.sortOrder === 'asc' && (
                <>
                  <div className="h-4 border-l border-gray-200" />
                  <span className="text-xs font-medium text-gray-600">
                    <span className="text-gray-900 font-semibold">(Ascending)</span>
                  </span>
                </>
              )}
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh filters"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              </Button>

              {/* Edit Filters Button */}
              <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-2">
                    <Filter className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:w-[400px]">
                  <SheetHeader className="mb-6">
                    <SheetTitle>Filter & Sort</SheetTitle>
                  </SheetHeader>
                  <FilterControls />
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE FILTER DRAWER */}
      <div className="md:hidden px-5 py-3 border-b border-gray-100">
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="w-full gap-2 h-9">
              <Filter className="h-4 w-4" />
              Filters & Sort
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[90vh]">
            <SheetHeader className="mb-6">
              <SheetTitle>Filter & Sort Analytics</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto pr-4">
              <FilterControls />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};

FilterToolbar.displayName = 'FilterToolbar';
