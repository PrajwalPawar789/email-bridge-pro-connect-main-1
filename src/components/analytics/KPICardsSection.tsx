/**
 * KPICardsSection Component
 * Displays 4 key metric cards with trend deltas and benchmark comparisons
 * Includes loading, error, and empty states
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { KPICardsSectionProps } from '@/types/analytics';
import { TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHealthStatusColor, getHealthStatusLabel } from '@/lib/analyticsCalculations';

/**
 * Individual KPI Card Component
 */
const KPICard: React.FC<{
  label: string;
  value: number;
  unit?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    previousValue: number;
  };
  benchmark?: {
    average: number;
    performance: string;
    industry?: string;
  };
  loading?: boolean;
  onClick?: () => void;
}> = ({ label, value, unit, trend, benchmark, loading, onClick }) => {
  if (loading) {
    return (
      <Card className="cursor-wait">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">
            <Skeleton className="h-4 w-24" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-4 w-20" />
        </CardContent>
      </Card>
    );
  }

  const trendColor =
    trend?.direction === 'up'
      ? 'text-green-600'
      : trend?.direction === 'down'
        ? 'text-red-600'
        : 'text-gray-600';

  const benchmarkColor =
    benchmark?.performance === 'excellent'
      ? 'text-green-700 bg-green-50'
      : benchmark?.performance === 'good'
        ? 'text-blue-700 bg-blue-50'
        : benchmark?.performance === 'monitor'
          ? 'text-amber-700 bg-amber-50'
          : benchmark?.performance === 'risk'
            ? 'text-orange-700 bg-orange-50'
            : 'text-red-700 bg-red-50';

  return (
    <Card
      className={cn('transition-shadow', onClick && 'cursor-pointer hover:shadow-md')}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Main Value */}
        <div className="flex items-baseline gap-1">
          <span className="text-2xl lg:text-3xl font-bold text-gray-900">
            {value.toLocaleString()}
          </span>
          {unit && <span className="text-xs text-gray-500">{unit}</span>}
        </div>

        {/* Trend Delta */}
        {trend && (
          <div className={cn('flex items-center gap-1 text-sm', trendColor)}>
            {trend.direction === 'up' && <TrendingUp className="h-3.5 w-3.5" />}
            {trend.direction === 'down' && <TrendingDown className="h-3.5 w-3.5" />}
            <span className="font-medium">
              {trend.direction === 'neutral' ? 'No change' : `${trend.value}% ${trend.direction === 'up' ? 'increase' : 'decrease'}`}
            </span>
            <span className="text-xs text-gray-600">vs prev period</span>
          </div>
        )}

        {/* Benchmark Tooltip */}
        {benchmark && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn('text-xs px-2 py-1 rounded-sm flex items-center gap-1 w-fit', benchmarkColor)}>
                  <Info className="h-3 w-3" />
                  {getHealthStatusLabel(benchmark.performance as any)} vs industry
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-semibold mb-1">{benchmark.industry || 'General'} Benchmark</p>
                <p className="text-sm">
                  Average rate: {benchmark.average.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {benchmark.performance === 'excellent' && 'Excellent performance - 20% above average'}
                  {benchmark.performance === 'good' && 'Good performance - 5-20% above average'}
                  {benchmark.performance === 'monitor' && 'In line with industry average'}
                  {benchmark.performance === 'risk' && 'Below average - monitor closely'}
                  {benchmark.performance === 'critical' && 'Well below average - needs attention'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * KPI Cards Section Component
 */
export const KPICardsSection: React.FC<KPICardsSectionProps> = ({
  kpis,
  loading = false,
  error = null,
  onRetry,
}) => {
  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Unable to load metrics. {onRetry && <button onClick={onRetry} className="underline ml-2">Try again</button>}
        </AlertDescription>
      </Alert>
    );
  }

  if (!loading && kpis.length === 0) {
    return (
      <Card className="my-4">
        <CardHeader>
          <CardTitle className="text-base">No Data</CardTitle>
          <CardDescription>
            No campaigns sent in the selected time period yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {loading
        ? // Skeleton loading state: show 4 placeholder cards
          Array.from({ length: 4 }).map((_, i) => (
            <KPICard
              key={`skeleton-${i}`}
              label={`Loading...`}
              value={0}
              loading={true}
            />
          ))
        : // Render actual KPI cards
          kpis.map((kpi) => (
            <KPICard
              key={kpi.id}
              label={kpi.label}
              value={kpi.value}
              unit={kpi.unit}
              trend={kpi.trend}
              benchmark={kpi.benchmark}
              onClick={kpi.clickAction?.action}
            />
          ))}
    </div>
  );
};

KPICardsSection.displayName = 'KPICardsSection';
