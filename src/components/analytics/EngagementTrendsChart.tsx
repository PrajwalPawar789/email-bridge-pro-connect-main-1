/**
 * EngagementTrendsChart Component
 * Area chart showing opens, clicks, and replies over time
 * Includes metric toggles, date presets, and hover tooltips
 * Loads Recharts dynamically to optimize performance
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { EngagementTrendsChartProps } from '@/types/analytics';
import { AlertTriangle, Eye, MousePointer, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

// Lazy load recharts to optimize bundle
const AreaChart = React.lazy(() =>
  import('recharts').then((mod) => ({ default: mod.AreaChart }))
);
const Area = React.lazy(() =>
  import('recharts').then((mod) => ({ default: mod.Area }))
);
const XAxis = React.lazy(() =>
  import('recharts').then((mod) => ({ default: mod.XAxis }))
);
const YAxis = React.lazy(() =>
  import('recharts').then((mod) => ({ default: mod.YAxis }))
);
const CartesianGrid = React.lazy(() =>
  import('recharts').then((mod) => ({ default: mod.CartesianGrid }))
);
const Tooltip = React.lazy(() =>
  import('recharts').then((mod) => ({ default: mod.Tooltip }))
);
const ResponsiveContainer = React.lazy(() =>
  import('recharts').then((mod) => ({ default: mod.ResponsiveContainer }))
);
const Legend = React.lazy(() =>
  import('recharts').then((mod) => ({ default: mod.Legend }))
);

/**
 * Custom tooltip for chart
 */
const ChartTooltip = (props: any) => {
  const { active, payload, label } = props;
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-xs">
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

/**
 * Metric Toggle Button
 */
const MetricButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  color: string;
  onClick: () => void;
}> = ({ icon, label, enabled, color, onClick }) => (
  <Button
    variant={enabled ? 'default' : 'outline'}
    size="sm"
    className={cn(
      'gap-2 h-8',
      enabled && color
    )}
    onClick={onClick}
  >
    {icon}
    <span className="hidden sm:inline text-xs">{label}</span>
  </Button>
);

/**
 * Main Chart Component
 */
export const EngagementTrendsChart: React.FC<EngagementTrendsChartProps> = ({
  data,
  loading = false,
  error = null,
  config,
  onConfigChange,
  onRetry,
}) => {
  const memoizedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Format data for chart - ensure all required fields exist
    return data.map((point) => ({
      date: point.date,
      opens: point.opens || 0,
      clicks: point.clicks || 0,
      replies: point.replies || 0,
    }));
  }, [data]);

  // Determine if chart has any data
  const hasData = memoizedData.length > 0 &&
    memoizedData.some((d) => d.opens > 0 || d.clicks > 0 || d.replies > 0);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagement Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Unable to load engagement data. {onRetry && <button onClick={onRetry} className="underline ml-2">Try again</button>}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!loading && !hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagement Trends</CardTitle>
          <CardDescription>No engagement recorded in selected period</CardDescription>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center text-gray-500">
          No data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base">Engagement Trends</CardTitle>
            <CardDescription className="text-xs mt-1">
              Daily opens, clicks, and replies over time
            </CardDescription>
          </div>

          {/* Metric Toggle Buttons */}
          <div className="flex gap-2 flex-wrap">
            <MetricButton
              icon={<Eye className="h-3.5 w-3.5" />}
              label="Opens"
              enabled={config.showOpens}
              color="bg-blue-600"
              onClick={() => onConfigChange({ showOpens: !config.showOpens })}
            />
            <MetricButton
              icon={<MousePointer className="h-3.5 w-3.5" />}
              label="Clicks"
              enabled={config.showClicks}
              color="bg-amber-600"
              onClick={() => onConfigChange({ showClicks: !config.showClicks })}
            />
            <MetricButton
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Replies"
              enabled={config.showReplies}
              color="bg-green-600"
              onClick={() => onConfigChange({ showReplies: !config.showReplies })}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-60 w-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <React.Suspense fallback={<Skeleton className="h-60 w-full" />}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={memoizedData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorReplies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  stroke="#9ca3af"
                  style={{ fontSize: '12px' }}
                  tick={{ fill: '#6b7280' }}
                />
                <YAxis
                  stroke="#9ca3af"
                  style={{ fontSize: '12px' }}
                  tick={{ fill: '#6b7280' }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="line"
                  wrapperClassName="text-xs"
                />

                {config.showOpens && (
                  <Area
                    type="monotone"
                    dataKey="opens"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorOpens)"
                    name="Opens"
                    isAnimationActive={true}
                  />
                )}
                {config.showClicks && (
                  <Area
                    type="monotone"
                    dataKey="clicks"
                    stroke="#f59e0b"
                    fillOpacity={1}
                    fill="url(#colorClicks)"
                    name="Clicks"
                    isAnimationActive={true}
                  />
                )}
                {config.showReplies && (
                  <Area
                    type="monotone"
                    dataKey="replies"
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#colorReplies)"
                    name="Replies"
                    isAnimationActive={true}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </React.Suspense>
        )}
      </CardContent>
    </Card>
  );
};

EngagementTrendsChart.displayName = 'EngagementTrendsChart';
