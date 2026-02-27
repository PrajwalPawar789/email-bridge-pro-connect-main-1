import { supabase } from '@/integrations/supabase/client';

const normalizeBaseUrl = (value?: string) => (value ? value.replace(/\/+$/g, '') : '');
const baseFromSyncUrl = (value?: string) => {
  if (!value) return '';
  return normalizeBaseUrl(value.replace(/\/sync-mailbox\/?$/i, ''));
};

export const MAILBOX_OAUTH_API_BASE_URL =
  normalizeBaseUrl(import.meta.env.VITE_MAILBOX_API_URL) ||
  baseFromSyncUrl(import.meta.env.VITE_MAILBOX_SYNC_URL) ||
  normalizeBaseUrl(import.meta.env.VITE_CRM_BACKEND_URL) ||
  normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) ||
  'http://localhost:8787';

export type MailboxOAuthProvider = 'gmail' | 'outlook';

export type MailboxOAuthStartResponse = {
  mode?: 'simulate' | 'live';
  provider?: MailboxOAuthProvider;
  state?: string;
  authUrl?: string;
  simulatedCode?: string;
};

export type MailboxOAuthExchangeResponse = {
  provider: MailboxOAuthProvider;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  expiresIn?: number | null;
  expiresAt?: string | null;
  email: string;
  displayName?: string | null;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  imapPort?: number;
  security?: 'SSL' | 'TLS';
};

const getAuthHeaders = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const requestJson = async <T>(path: string, options: RequestInit): Promise<T> => {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${MAILBOX_OAUTH_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const payload = data as Record<string, unknown> | null;
    const message =
      (typeof data === 'string' && data) ||
      (payload?.error as string | undefined) ||
      (payload?.message as string | undefined) ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
};

export const buildMailboxOAuthRedirectUri = () => {
  if (typeof window === 'undefined') return '';
  const url = new URL('/dashboard', window.location.origin);
  url.searchParams.set('tab', 'settings');
  return url.toString();
};

export const startMailboxOAuth = async (
  provider: MailboxOAuthProvider,
  redirectUri: string
): Promise<MailboxOAuthStartResponse> => {
  return requestJson(`/mailbox/${provider}/oauth/start`, {
    method: 'POST',
    body: JSON.stringify({ redirectUri }),
  });
};

export const exchangeMailboxOAuth = async (
  provider: MailboxOAuthProvider,
  code: string,
  redirectUri: string
): Promise<MailboxOAuthExchangeResponse> => {
  return requestJson(`/mailbox/${provider}/oauth/exchange`, {
    method: 'POST',
    body: JSON.stringify({ code, redirectUri }),
  });
};
