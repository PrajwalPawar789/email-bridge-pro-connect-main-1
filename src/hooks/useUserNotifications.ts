import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  getUnreadNotificationCount,
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  type UserNotification
} from '@/lib/notifications';

type UseUserNotificationsOptions = {
  limit?: number;
  pollingMs?: number;
  enabled?: boolean;
};

const DEFAULT_LIMIT = 25;
const DEFAULT_POLLING_MS = 45_000;

export function useUserNotifications(
  userId?: string | null,
  options: UseUserNotificationsOptions = {}
) {
  const { limit = DEFAULT_LIMIT, pollingMs = DEFAULT_POLLING_MS, enabled = true } = options;
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [rows, unread] = await Promise.all([
        listUserNotifications(userId, limit),
        getUnreadNotificationCount(userId)
      ]);
      setNotifications(rows);
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to load user notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [enabled, limit, userId]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!userId) return;
    try {
      await markUserNotificationRead(userId, notificationId);
      await refresh();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, [refresh, userId]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    try {
      await markAllUserNotificationsRead(userId);
      await refresh();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }, [refresh, userId]);

  useEffect(() => {
    if (!enabled || !userId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, pollingMs);

    const client = supabase as any;
    const channel = client
      .channel(`user-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      clearInterval(intervalId);
      client.removeChannel(channel);
    };
  }, [enabled, pollingMs, refresh, userId]);

  const hasUnread = useMemo(() => unreadCount > 0, [unreadCount]);

  return {
    notifications,
    unreadCount,
    hasUnread,
    loading,
    refresh,
    markAsRead,
    markAllAsRead
  };
}
