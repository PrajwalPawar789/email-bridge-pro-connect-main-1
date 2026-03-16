/**
 * ActivityFeedCard Component
 * Real-time scrollable feed of recent engagement events
 * Shows opens, clicks, replies, and bounces with timestamps
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ActivityFeedCardProps } from '@/types/analytics';
import { ActivityEventType } from '@/types/analytics';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Eye, MousePointer, MessageSquare, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Map event type to icon and color
 */
const getEventIconAndColor = (type: ActivityEventType) => {
  switch (type) {
    case 'opened':
      return {
        icon: Eye,
        color: 'text-blue-600 bg-blue-50',
        label: 'Opened',
        shortLabel: 'Open',
      };
    case 'clicked':
      return {
        icon: MousePointer,
        color: 'text-amber-600 bg-amber-50',
        label: 'Clicked',
        shortLabel: 'Click',
      };
    case 'replied':
      return {
        icon: MessageSquare,
        color: 'text-green-600 bg-green-50',
        label: 'Replied',
        shortLabel: 'Reply',
      };
    case 'bounced':
      return {
        icon: AlertCircle,
        color: 'text-red-600 bg-red-50',
        label: 'Bounced',
        shortLabel: 'Bounce',
      };
    case 'failed':
      return {
        icon: AlertCircle,
        color: 'text-red-600 bg-red-50',
        label: 'Failed',
        shortLabel: 'Failed',
      };
    default:
      return {
        icon: Eye,
        color: 'text-gray-600 bg-gray-50',
        label: type,
        shortLabel: type,
      };
  }
};

/**
 * Individual Activity Item
 */
const ActivityItem: React.FC<{
  email: string;
  campaignName: string;
  type: ActivityEventType;
  timestamp: string;
}> = ({ email, campaignName, type, timestamp }) => {
  const { icon: Icon, color, label, shortLabel } = getEventIconAndColor(type);
  const timeAgo = formatDistanceToNow(parseISO(timestamp), { addSuffix: true });

  return (
    <div className="flex gap-3 py-2 px-3 hover:bg-gray-50 rounded-lg transition-colors">
      {/* Icon */}
      <div className={cn('rounded-lg p-2 flex-shrink-0', color)}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900 truncate">{email}</p>
        <p className="text-xs text-gray-600 line-clamp-1">{campaignName}</p>
      </div>

      {/* Badge and Time */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">
          {shortLabel}
        </span>
        <span className="text-xs text-gray-500 whitespace-nowrap">{timeAgo}</span>
      </div>
    </div>
  );
};

/**
 * Activity Feed Card Component
 */
export const ActivityFeedCard: React.FC<ActivityFeedCardProps> = ({
  activities,
  loading = false,
  error = null,
  maxItems = 50,
}) => {
  const displayActivities = useMemo(() => {
    return activities.slice(0, maxItems);
  }, [activities, maxItems]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live Activity</CardTitle>
          <CardDescription>Recent engagement events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live Activity</CardTitle>
          <CardDescription className="text-red-600">Unable to load activity</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            {error.message || 'Could not load recent activities'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (displayActivities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live Activity</CardTitle>
          <CardDescription>Recent engagement events</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">No recent activity</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Live Activity</CardTitle>
            <CardDescription>Recent engagement •{' '}
              <span className="text-xs font-semibold text-green-600 inline-block">
                Live
              </span>
            </CardDescription>
          </div>
          <div className="relative h-2 w-2 bg-green-600 rounded-full animate-pulse" />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden px-0">
        <ScrollArea className="h-[420px] px-4">
          <div className="space-y-1">
            {displayActivities.map((activity) => (
              <ActivityItem
                key={activity.id}
                email={activity.recipientEmail}
                campaignName={activity.campaignName}
                type={activity.type}
                timestamp={activity.timestamp}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Footer */}
      {displayActivities.length >= maxItems && (
        <div className="px-4 py-3 border-t border-gray-200 text-center text-xs text-gray-500">
          Showing latest {maxItems} activities
        </div>
      )}
    </Card>
  );
};

ActivityFeedCard.displayName = 'ActivityFeedCard';
