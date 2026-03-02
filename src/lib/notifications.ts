import { supabase } from '@/integrations/supabase/client';

const client = supabase as any;

export type NotificationCategory = 'billing' | 'campaign' | 'system' | 'account';

export type UserNotification = {
  id: string;
  user_id: string;
  event_type: string;
  category: NotificationCategory;
  title: string;
  message: string | null;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type CreateUserNotificationInput = {
  userId: string;
  eventType: string;
  title: string;
  message?: string | null;
  category?: NotificationCategory;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export async function listUserNotifications(userId: string, limit = 25): Promise<UserNotification[]> {
  const { data, error } = await client
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as UserNotification[];
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await client
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
  return Number(count || 0);
}

export async function markUserNotificationRead(userId: string, notificationId: string): Promise<void> {
  const { error } = await client
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', notificationId)
    .is('read_at', null);

  if (error) throw error;
}

export async function markAllUserNotificationsRead(userId: string): Promise<number> {
  const { data, error } = await client.rpc('mark_all_user_notifications_read', {
    p_user_id: userId
  });

  if (error) throw error;
  return Number(data || 0);
}

export async function createUserNotification(input: CreateUserNotificationInput): Promise<string> {
  const { data, error } = await client.rpc('create_user_notification', {
    p_user_id: input.userId,
    p_event_type: input.eventType,
    p_title: input.title,
    p_message: input.message ?? null,
    p_category: input.category ?? 'system',
    p_action_url: input.actionUrl ?? null,
    p_metadata: input.metadata ?? {}
  });

  if (error) throw error;
  return String(data);
}
