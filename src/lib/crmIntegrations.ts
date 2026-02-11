export type CrmProvider = 'hubspot' | 'salesforce';

export type CrmIntegrationStatus = 'not_connected' | 'pending' | 'connected' | 'error';

export type CrmMappingRow = {
  id: string;
  source: string;
  target: string;
};

export type CrmIntegrationRecord = {
  provider: CrmProvider;
  status: CrmIntegrationStatus;
  connectedAt?: string;
  lastSyncAt?: string;
  accountLabel?: string;
  error?: string;
  mapping: CrmMappingRow[];
};

export type CrmSyncLogEntry = {
  id: string;
  provider: CrmProvider;
  createdAt: string;
  status: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: string;
};

export type CrmState = {
  integrations: Record<CrmProvider, CrmIntegrationRecord>;
  logs: CrmSyncLogEntry[];
};

const STORAGE_KEY = 'crm:integrations:v1';

const defaultMappings: Record<CrmProvider, CrmMappingRow[]> = {
  hubspot: [
    { id: 'contact.email', source: 'contact.email', target: 'contact.email' },
    { id: 'company.name', source: 'company.name', target: 'company.name' },
    { id: 'company.industry', source: 'company.industry', target: 'company.industry' },
    { id: 'campaign.name', source: 'campaign.name', target: 'campaign.name' },
    { id: 'engagement.reply_status', source: 'engagement.reply_status', target: 'engagement.reply_status' },
    { id: 'owner.email', source: 'owner.email', target: 'owner.email' }
  ],
  salesforce: [
    { id: 'contact.email', source: 'contact.email', target: 'Contact.Email' },
    { id: 'company.name', source: 'company.name', target: 'Account.Name' },
    { id: 'company.industry', source: 'company.industry', target: 'Account.Industry' },
    { id: 'campaign.name', source: 'campaign.name', target: 'Campaign.Name' },
    { id: 'engagement.reply_status', source: 'engagement.reply_status', target: 'Task.Status' },
    { id: 'owner.email', source: 'owner.email', target: 'Owner.Email' }
  ]
};

const buildDefaultState = (): CrmState => ({
  integrations: {
    hubspot: {
      provider: 'hubspot',
      status: 'not_connected',
      mapping: defaultMappings.hubspot
    },
    salesforce: {
      provider: 'salesforce',
      status: 'not_connected',
      mapping: defaultMappings.salesforce
    }
  },
  logs: []
});

const safeParse = (raw: string | null): CrmState | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CrmState;
  } catch {
    return null;
  }
};

export const loadCrmState = (): CrmState => {
  if (typeof window === 'undefined') {
    return buildDefaultState();
  }
  const stored = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (!stored) {
    return buildDefaultState();
  }
  return {
    integrations: {
      hubspot: {
        ...buildDefaultState().integrations.hubspot,
        ...stored.integrations?.hubspot,
        mapping: stored.integrations?.hubspot?.mapping || defaultMappings.hubspot
      },
      salesforce: {
        ...buildDefaultState().integrations.salesforce,
        ...stored.integrations?.salesforce,
        mapping: stored.integrations?.salesforce?.mapping || defaultMappings.salesforce
      }
    },
    logs: Array.isArray(stored.logs) ? stored.logs : []
  };
};

export const saveCrmState = (state: CrmState) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const addCrmLog = (state: CrmState, entry: Omit<CrmSyncLogEntry, 'id' | 'createdAt'>) => {
  const nextEntry: CrmSyncLogEntry = {
    ...entry,
    id: `${entry.provider}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString()
  };
  const nextState: CrmState = {
    ...state,
    logs: [nextEntry, ...state.logs].slice(0, 120)
  };
  saveCrmState(nextState);
  return nextState;
};

export const updateIntegration = (
  state: CrmState,
  provider: CrmProvider,
  updates: Partial<CrmIntegrationRecord>
) => {
  const nextState: CrmState = {
    ...state,
    integrations: {
      ...state.integrations,
      [provider]: {
        ...state.integrations[provider],
        ...updates
      }
    }
  };
  saveCrmState(nextState);
  return nextState;
};

export const updateMapping = (state: CrmState, provider: CrmProvider, mapping: CrmMappingRow[]) => {
  const nextState = updateIntegration(state, provider, { mapping });
  return nextState;
};

const normalizeBaseUrl = (value?: string) => {
  if (!value) return undefined;
  return value.replace(/\/+$/g, '');
};

const baseFromSyncUrl = (value?: string) => {
  if (!value) return undefined;
  return normalizeBaseUrl(value.replace(/\/sync-mailbox\/?$/i, ''));
};

export const CRM_API_BASE_URL =
  normalizeBaseUrl(import.meta.env.VITE_MAILBOX_API_URL) ||
  baseFromSyncUrl(import.meta.env.VITE_MAILBOX_SYNC_URL) ||
  normalizeBaseUrl(import.meta.env.VITE_CRM_API_BASE_URL) ||
  'http://localhost:8787';

export type CrmOAuthStartResponse = {
  authUrl?: string;
  mode?: 'simulate' | 'live';
  message?: string;
  simulatedCode?: string;
};

export type CrmOAuthExchangeResponse = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  accountLabel?: string;
};

export const startCrmOAuth = async (provider: CrmProvider): Promise<CrmOAuthStartResponse> => {
  const response = await fetch(`${CRM_API_BASE_URL}/crm/${provider}/oauth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to start OAuth flow');
  }
  return response.json();
};

export const exchangeCrmOAuth = async (
  provider: CrmProvider,
  code: string
): Promise<CrmOAuthExchangeResponse> => {
  const response = await fetch(`${CRM_API_BASE_URL}/crm/${provider}/oauth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to exchange OAuth code');
  }
  return response.json();
};

export const runCrmSync = async (provider: CrmProvider) => {
  const response = await fetch(`${CRM_API_BASE_URL}/crm/${provider}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to trigger sync');
  }
  return response.json() as Promise<{ synced: number; updated: number; warnings?: number }>;
};
