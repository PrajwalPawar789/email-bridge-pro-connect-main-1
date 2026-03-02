import { supabase } from '@/integrations/supabase/client';

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
  contentHtml: string;
}

export interface ResolvedSiteDomain {
  host: string;
  dnsStatus: SiteDnsStatus;
  sslStatus: SiteSslStatus;
  page: ResolvedDomainPage;
}

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

const inferSubdomainHostLabel = (domain: string) => {
  const normalized = domain.trim().toLowerCase();
  const labels = normalized.split('.').filter(Boolean);
  if (labels.length <= 2) return '';
  return labels.slice(0, -2).join('.');
};

const defaultTargetA = (import.meta.env.VITE_SITE_CONNECTOR_TARGET_A || '185.158.133.1').trim();
const defaultDnsRecords = (domain: string, type: SiteDomainType) => {
  const hostLabel = type === 'subdomain' ? inferSubdomainHostLabel(domain) : '';
  const aName = type === 'subdomain' && hostLabel ? hostLabel : '@';
  const txtName = type === 'subdomain' && hostLabel ? `_verify.${hostLabel}` : '_verify';

  return [
    { type: 'A', name: aName, value: defaultTargetA, verified: false },
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
  const normalizedDomain = domain.trim().toLowerCase();
  if (!normalizedDomain) throw new Error('Domain is required');

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
  return toDomainRecord(data);
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

  const { data, error } = await supabase.functions.invoke('resolve-site-domain', {
    body: { host: normalizedHost },
  });

  if (error) {
    const status = Number((error as any)?.context?.status || (error as any)?.status || 0);
    if (status === 404) {
      return null;
    }
    throw error;
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
      contentHtml: String(data.page.contentHtml || ''),
    },
  };
};
