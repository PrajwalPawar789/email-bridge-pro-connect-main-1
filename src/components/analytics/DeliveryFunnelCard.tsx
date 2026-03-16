/**
 * DeliveryFunnelCard Component
 * Horizontal bar visualization of email conversion stages
 * Shows health indicators and links to affected campaigns
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DeliveryFunnelCardProps } from '@/types/analytics';
import { getHealthStatusColor, getHealthStatusIcon, getHealthStatusLabel } from '@/lib/analyticsCalculations';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

export const DeliveryFunnelCard: React.FC<DeliveryFunnelCardProps> = ({
  data,
  onStageClick,
}) => {
  const maxValue = useMemo(() => {
    return Math.max(...data.stages.map((s) => s.count), 1);
  }, [data.stages]);

  if (!data || !data.stages || data.stages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery Funnel</CardTitle>
          <CardDescription>Email conversion funnel</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>No data available for funnel visualization</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Delivery Funnel</CardTitle>
        <CardDescription>Email conversion flow from send to reply</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.stages.map((stage, index) => (
            <div key={stage.id} className="space-y-1">
              {/* Stage Header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{stage.label}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${getHealthStatusColor(
                            stage.health
                          )}`}
                        >
                          {getHealthStatusIcon(stage.health)} {getHealthStatusLabel(stage.health)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-sm font-semibold mb-1">{stage.label}</p>
                        <p className="text-xs">{stage.tooltip || `${stage.count} items`}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {stage.count.toLocaleString()} ({stage.percentage}%)
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-6 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    stage.health === 'excellent'
                      ? 'bg-green-500'
                      : stage.health === 'good'
                        ? 'bg-blue-500'
                        : stage.health === 'monitor'
                          ? 'bg-amber-500'
                          : stage.health === 'risk'
                            ? 'bg-orange-500'
                            : 'bg-red-500'
                  }`}
                  style={{
                    width: `${Math.max((stage.count / maxValue) * 100, 5)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Bot Activity Note */}
        {data.stages.some((s) => s.id === 'bot-interactions') && (
          <div className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-900">
              ⚠️ Bot activity detected - above numbers exclude bot interactions
            </p>
          </div>
        )}

        {/* Summary */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Total emails sent: <span className="font-semibold text-gray-900">{data.totalSent.toLocaleString()}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

DeliveryFunnelCard.displayName = 'DeliveryFunnelCard';
