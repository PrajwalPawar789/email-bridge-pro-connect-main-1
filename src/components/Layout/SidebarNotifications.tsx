import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bell, BellRing, CheckCheck, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserNotifications } from '@/hooks/useUserNotifications';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type SidebarNotificationsProps = {
  userId?: string | null;
  isCollapsed: boolean;
};

type NotificationTab = 'notifications' | 'alerts';

const alertCategories = new Set(['billing', 'account', 'system']);

const categoryBadgeClass: Record<string, string> = {
  billing: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  campaign: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  account: 'bg-amber-50 text-amber-700 border-amber-100',
  system: 'bg-slate-100 text-slate-700 border-slate-200'
};

const SidebarNotifications = ({ userId, isCollapsed }: SidebarNotificationsProps) => {
  const [activeTab, setActiveTab] = useState<NotificationTab>('notifications');
  const {
    notifications,
    unreadCount,
    hasUnread,
    loading,
    markAsRead,
    markAllAsRead,
    refresh
  } = useUserNotifications(userId, { limit: 30, enabled: Boolean(userId) });

  const tabbedNotifications = useMemo(() => {
    const alerts = notifications.filter((notification) => (
      alertCategories.has((notification.category || '').toLowerCase())
    ));
    const updates = notifications.filter((notification) => (
      !alertCategories.has((notification.category || '').toLowerCase())
    ));

    return {
      notifications: updates,
      alerts
    };
  }, [notifications]);

  const activeNotifications = activeTab === 'alerts'
    ? tabbedNotifications.alerts
    : tabbedNotifications.notifications;

  const emptyTitle = activeTab === 'alerts' ? 'No new Alerts yet' : 'No new Notifications yet';
  const emptyMessage = activeTab === 'alerts'
    ? "When alerts are generated, they'll show up here"
    : "When you get notifications, they'll show up here";

  return (
    <Popover onOpenChange={(open) => {
      if (open) {
        setActiveTab('notifications');
        void refresh();
      }
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            isCollapsed
              ? 'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--shell-border)] bg-white/80 text-slate-600 transition-colors hover:bg-white hover:text-slate-900'
              : 'relative flex w-full items-center gap-2 rounded-lg bg-slate-200/80 px-3 py-2 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-200'
          )}
          title={isCollapsed ? 'Notifications' : undefined}
          aria-label="Notifications"
        >
          {hasUnread ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {!isCollapsed && <span className="truncate">Notifications</span>}
          {unreadCount > 0 && (
            <span
              className={cn(
                'inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white',
                isCollapsed ? 'absolute -right-1 -top-1' : 'ml-auto'
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align={isCollapsed ? 'center' : 'start'}
        sideOffset={10}
        className="w-[400px] max-w-[calc(100vw-1.5rem)] border border-slate-300 bg-white p-0 shadow-[0_24px_65px_-28px_rgba(15,23,42,0.5)]"
      >
        <div className="border-b border-slate-200">
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setActiveTab('notifications');
              }}
              className={cn(
                'relative px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800',
                activeTab === 'notifications' && 'text-slate-900'
              )}
            >
              Notifications
              <span
                className={cn(
                  'absolute inset-x-0 bottom-0 h-0.5 bg-slate-900 transition-opacity',
                  activeTab === 'notifications' ? 'opacity-100' : 'opacity-0'
                )}
              />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('alerts');
              }}
              className={cn(
                'relative px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800',
                activeTab === 'alerts' && 'text-slate-900'
              )}
            >
              Alerts
              <span
                className={cn(
                  'absolute inset-x-0 bottom-0 h-0.5 bg-slate-900 transition-opacity',
                  activeTab === 'alerts' ? 'opacity-100' : 'opacity-0'
                )}
              />
            </button>
          </div>
        </div>

        <div className="flex h-[460px] flex-col">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading notifications...
            </div>
          ) : activeNotifications.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-slate-100">
                <Bell className="h-9 w-9 text-slate-800" />
              </div>
              <p className="text-3xl font-medium text-slate-900">{emptyTitle}</p>
              <p className="mt-2 text-base text-slate-600">{emptyMessage}</p>
              <button
                type="button"
                onClick={() => {
                  void refresh();
                }}
                className="mt-6 inline-flex items-center rounded-md border border-slate-400 px-4 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 text-xs text-slate-600">
                <span>
                  {activeNotifications.length} {activeTab === 'alerts' ? 'alerts' : 'notifications'}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void refresh();
                    }}
                    className="inline-flex items-center gap-1 font-medium hover:text-slate-900"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void markAllAsRead();
                    }}
                    disabled={!hasUnread || loading}
                    className="inline-flex items-center gap-1 font-medium hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-1 p-2.5">
                  {activeNotifications.map((notification) => {
                    const categoryClass = categoryBadgeClass[notification.category] || categoryBadgeClass.system;
                    const createdAt = notification.created_at ? new Date(notification.created_at) : null;
                    const relativeTime = createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : 'just now';

                    return (
                      <div
                        key={notification.id}
                        className={cn(
                          'rounded-lg border px-3 py-2.5',
                          notification.read_at
                            ? 'border-slate-200 bg-white'
                            : 'border-emerald-200 bg-emerald-50/50'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]', categoryClass)}>
                                {notification.category}
                              </span>
                              <span className="text-[11px] text-slate-500">{relativeTime}</span>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                            {notification.message && (
                              <p className="mt-1 text-xs leading-relaxed text-slate-600">{notification.message}</p>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-3 text-xs">
                          {notification.action_url && (
                            <Link
                              to={notification.action_url}
                              onClick={() => {
                                if (!notification.read_at) {
                                  void markAsRead(notification.id);
                                }
                              }}
                              className="font-semibold text-emerald-700 hover:text-emerald-800"
                            >
                              Open
                            </Link>
                          )}
                          {!notification.read_at && (
                            <button
                              type="button"
                              onClick={() => {
                                void markAsRead(notification.id);
                              }}
                              className="font-medium text-slate-500 hover:text-slate-700"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}

          <div className="border-t border-slate-200 py-3 text-center">
            <button
              type="button"
              onClick={() => {
                void refresh();
              }}
              className="text-sm font-medium text-slate-900 transition-colors hover:text-slate-700"
            >
              View All
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default SidebarNotifications;
