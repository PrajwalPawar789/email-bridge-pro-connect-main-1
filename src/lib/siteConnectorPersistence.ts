import { supabase } from '@/integrations/supabase/client';
import { normalizeAndValidateSiteDomain } from '@/lib/siteConnectorDomain';
import type { LandingPageBlock } from '@/lib/landingPagesPersistence';
import type { LandingPageSettings } from '@/lib/landingPageSettings';
import { normalizeLandingPageSettings } from '@/lib/landingPageSettings';

export type SiteDomainType = 'root' | 'subdomain';
export type SiteSslStatus = 'pending' | 'active' | 'expired' | 'failed';
export type SiteDnsStatus = 'pending' | 'verified' | 'failed';

export interface SiteDnsRecord {
  type: string;
  name: string;
  value: string;
  verified: boolean;
}

export interface SiteDomainRecord {
  id: string;
  domain: string;
  type: SiteDomainType;
  sslStatus: SiteSslStatus;
  dnsStatus: SiteDnsStatus;
  dnsRecords: SiteDnsRecord[];
  linkedPageId?: string;
  linkedPageName?: string;
  createdAt: Date;
}

export interface ResolvedDomainPage {
  id: string;
  name: string;
  slug: string;
  blocks: LandingPageBlock[];
  settings: LandingPageSettings;
  contentHtml: string;
}

export interface ResolvedSiteDomain {
  host: string;
  dnsStatus: SiteDnsStatus;
  sslStatus: SiteSslStatus;
  page: ResolvedDomainPage;
}

const normalizeApiErrorMessage = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    return String(payload?.error || `Request failed with status ${response.status}`);
  }

  const text = await response.text().catch(() => '');
  return text || `Request failed with status ${response.status}`;
};

const resolveSiteDomainViaSameOrigin = async (host: string) => {
  const params = new URLSearchParams({
    host,
    _ts: String(Date.now()),
  });
  const response = await fetch(`/api/resolve-site-domain?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await normalizeApiErrorMessage(response));
  }

  return response.json();
};

const resolveSiteDomainViaPublicFunction = async (host: string) => {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  if (!supabaseUrl) {
    return null;
  }

  const params = new URLSearchParams({
    host,
    _ts: String(Date.now()),
  });

  const response = await fetch(`${supabaseUrl}/functions/v1/resolve-site-domain?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await normalizeApiErrorMessage(response));
  }

  return response.json();
};

const getAuthenticatedUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Not authenticated');
  return user;
};

const normalizeDnsRecords = (value: any): SiteDnsRecord[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    type: String(item?.type || 'A'),
    name: String(item?.name || '@'),
    value: String(item?.value || ''),
    verified: Boolean(item?.verified),
  }));
};

const normalizeDomainType = (value: any): SiteDomainType => (value === 'subdomain' ? 'subdomain' : 'root');

const normalizeSslStatus = (value: any): SiteSslStatus =>
  value === 'active' || value === 'expired' || value === 'failed' ? value : 'pending';

const normalizeDnsStatus = (value: any): SiteDnsStatus =>
  value === 'verified' || value === 'failed' ? value : 'pending';

const toDomainRecord = (row: any, linkedPageName?: string): SiteDomainRecord => ({
  id: String(row.id),
  domain: String(row.domain || ''),
  type: normalizeDomainType(row.type),
  sslStatus: normalizeSslStatus(row.ssl_status),
  dnsStatus: normalizeDnsStatus(row.dns_status),
  dnsRecords: normalizeDnsRecords(row.dns_records),
  linkedPageId: row.linked_page_id ? String(row.linked_page_id) : undefined,
  linkedPageName: linkedPageName || undefined,
  createdAt: row?.created_at ? new Date(row.created_at) : new Date(),
});

const normalizeDnsTargetValue = (value: string) => value.trim().toLowerCase().replace(/\.$/, '');

const defaultTargetA = (import.meta.env.VITE_SITE_CONNECTOR_TARGET_A || '76.76.21.21').trim();
const defaultTargetCname = normalizeDnsTargetValue(
  import.meta.env.VITE_SITE_CONNECTOR_TARGET_CNAME || 'cname.vercel-dns.com'
);
const defaultVerifyTxtPrefix = normalizeDnsTargetValue(
  import.meta.env.VITE_SITE_CONNECTOR_VERIFY_TXT_PREFIX || '_verify'
);

const defaultDnsRecords = (domain: string, type: SiteDomainType) => {
  const hostLabel = type === 'subdomain' ? normalizeAndValidateSiteDomain(domain, type).hostLabel : '';
  const txtName = type === 'subdomain' && hostLabel ? `${defaultVerifyTxtPrefix}.${hostLabel}` : defaultVerifyTxtPrefix;
  const routingRecord =
    type === 'subdomain' && hostLabel && defaultTargetCname
      ? { type: 'CNAME', name: hostLabel, value: defaultTargetCname, verified: false }
      : { type: 'A', name: '@', value: defaultTargetA, verified: false };

  return [
    routingRecord,
    { type: 'TXT', name: txtName, value: `verify_${crypto.randomUUID().slice(0, 8)}`, verified: false },
  ];
};

const loadLinkedPageNames = async (pageIds: string[]) => {
  if (pageIds.length === 0) return new Map<string, string>();
  const { data, error } = await (supabase as any)
      .from('landing_pages')
      .select('id, name')
    .in('id', pageIds);
  if (error) throw error;
  const map = new Map<string, string>();
  (Array.isArray(data) ? data : []).forEach((row: any) => {
    map.set(String(row.id), String(row.name || ''));
  });
  return map;
};

export const listSiteDomains = async (): Promise<SiteDomainRecord[]> => {
  const user = await getAuthenticatedUser();
  const { data, error } = await (supabase as any)
    .from('site_domains')
    .select('id, domain, type, ssl_status, dns_status, dns_records, linked_page_id, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const pageIds = rows
    .map((row: any) => (row?.linked_page_id ? String(row.linked_page_id) : ''))
    .filter(Boolean);
  const pageMap = await loadLinkedPageNames(pageIds);

  return rows.map((row: any) => toDomainRecord(row, row?.linked_page_id ? pageMap.get(String(row.linked_page_id)) : undefined));
};

export const addSiteDomain = async (domain: string, type: SiteDomainType): Promise<SiteDomainRecord> => {
  const user = await getAuthenticatedUser();
  const { normalizedDomain } = normalizeAndValidateSiteDomain(domain, type);

  const { data, error } = await (supabase as any)
    .from('site_domains')
    .insert({
      user_id: user.id,
      domain: normalizedDomain,
      type,
      ssl_status: 'pending',
      dns_status: 'pending',
      dns_records: defaultDnsRecords(normalizedDomain, type),
    })
    .select('id, domain, type, ssl_status, dns_status, dns_records, linked_page_id, created_at, updated_at')
    .single();

  if (error) throw error;

  try {
    return await verifySiteDomain(String(data.id));
  } catch {
    return toDomainRecord(data);
  }
};

export const removeSiteDomain = async (domainId: string) => {
  const user = await getAuthenticatedUser();
  const { error } = await (supabase as any)
    .from('site_domains')
    .delete()
    .eq('id', domainId)
    .eq('user_id', user.id);

  if (error) throw error;
};

export const verifySiteDomain = async (domainId: string): Promise<SiteDomainRecord> => {
  const { data, error } = await supabase.functions.invoke('verify-site-domain', {
    body: { domainId },
  });
  if (error) throw error;
  if (!data?.domain) throw new Error('Invalid verification response');

  const row = data.domain;

  const linkedPageName =
    row?.linked_page_id
      ? (await loadLinkedPageNames([String(row.linked_page_id)])).get(String(row.linked_page_id))
      : undefined;

  return toDomainRecord(row, linkedPageName);
};

export const linkDomainToLandingPage = async (
  domainId: string,
  landingPageId: string | null
): Promise<SiteDomainRecord> => {
  const user = await getAuthenticatedUser();

  const payload: Record<string, any> = {
    linked_page_id: landingPageId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase as any)
    .from('site_domains')
    .update(payload)
    .eq('id', domainId)
    .eq('user_id', user.id)
    .select('id, domain, type, ssl_status, dns_status, dns_records, linked_page_id, created_at, updated_at')
    .single();

  if (error) throw error;

  const linkedPageName =
    data?.linked_page_id
      ? (await loadLinkedPageNames([String(data.linked_page_id)])).get(String(data.linked_page_id))
      : undefined;

  return toDomainRecord(data, linkedPageName);
};

export const resolveSiteDomain = async (host: string): Promise<ResolvedSiteDomain | null> => {
  const normalizedHost = host.trim().toLowerCase();
  if (!normalizedHost) return null;

  let data: any = null;

  if (!import.meta.env.DEV && typeof window !== 'undefined') {
    try {
      data = await resolveSiteDomainViaSameOrigin(normalizedHost);
    } catch {
      data = null;
    }

    if (!data) {
      try {
        data = await resolveSiteDomainViaPublicFunction(normalizedHost);
      } catch {
        data = null;
      }
    }
  }

  if (!data) {
    const { data: functionData, error } = await supabase.functions.invoke('resolve-site-domain', {
      body: { host: normalizedHost },
    });

    if (error) {
      const status = Number((error as any)?.context?.status || (error as any)?.status || 0);
      if (status === 404) {
        return null;
      }
      throw error;
    }

    data = functionData;
  }

  if (!data?.page || !data?.domain) return null;

  return {
    host: String(data.domain.host || normalizedHost),
    dnsStatus: normalizeDnsStatus(data.domain.dnsStatus),
    sslStatus: normalizeSslStatus(data.domain.sslStatus),
    page: {
      id: String(data.page.id || ''),
      name: String(data.page.name || ''),
      slug: String(data.page.slug || ''),
      blocks: Array.isArray(data.page.blocks) ? data.page.blocks : [],
      settings: normalizeLandingPageSettings(data.page.settings),
      contentHtml: String(data.page.contentHtml || ''),
    },
  };
};
