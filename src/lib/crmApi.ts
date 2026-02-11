import { supabase } from '@/integrations/supabase/client';

type HubSpotCredentialPayload = {
  owner_id: string;
  access_token: string;
  display_name: string;
};

type SalesforceOAuthPayload = {
  code: string;
  SF_CLIENT_ID: string;
  SF_CLIENT_SECRET: string;
  SF_REDIRECT_URI: string;
  display_name?: string;
};

const normalizeBaseUrl = (value?: string) => (value ? value.replace(/\/+$/g, '') : '');
const baseFromSyncUrl = (value?: string) => {
  if (!value) return '';
  return normalizeBaseUrl(value.replace(/\/sync-mailbox\/?$/i, ''));
};

export const CRM_BACKEND_BASE_URL =
  normalizeBaseUrl(import.meta.env.VITE_CRM_BACKEND_URL) ||
  normalizeBaseUrl(import.meta.env.VITE_MAILBOX_API_URL) ||
  baseFromSyncUrl(import.meta.env.VITE_MAILBOX_SYNC_URL) ||
  normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

const buildUrl = (path: string) => `${CRM_BACKEND_BASE_URL}${path}`;

const getAuthHeaders = async () => {
  if (typeof window === 'undefined') return {};
  try {
    const { data } = await supabase.auth.getSession();
    const supaToken = data?.session?.access_token;
    if (supaToken) return { Authorization: `Bearer ${supaToken}` };
  } catch {
    // ignore
  }
  const token = window.localStorage.getItem('valasys_auth_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

const requestJson = async <T>(path: string, options: RequestInit): Promise<T> => {
  if (!CRM_BACKEND_BASE_URL) {
    throw new Error(
      'CRM API base URL is not configured. Set VITE_CRM_BACKEND_URL, VITE_MAILBOX_API_URL, or VITE_MAILBOX_SYNC_URL.'
    );
  }
  const authHeaders = await getAuthHeaders();
  const response = await fetch(buildUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message =
      (typeof data === 'string' && data) ||
      data?.error ||
      data?.message ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return data as T;
};

export const addHubSpotCredential = async (payload: HubSpotCredentialPayload) => {
  return requestJson('/credentials/hubspot/add/', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};

export const exchangeSalesforceOAuth = async (payload: SalesforceOAuthPayload) => {
  return requestJson('/salesforce/callback/', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};
