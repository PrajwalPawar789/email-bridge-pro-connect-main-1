import { normalizeSiteConnectorHost } from '@/lib/siteConnectorHost';
import { normalizeLandingPageSettings, type LandingPageSettings } from '@/lib/landingPageSettings';
import type { LandingPageBlock } from '@/lib/landingPagesPersistence';

export interface PublicSitePage {
  id: string;
  name: string;
  slug: string;
  blocks: LandingPageBlock[];
  settings: LandingPageSettings;
  contentHtml: string;
}

export interface ResolvedPublicSitePage {
  host: string;
  dnsStatus: 'pending' | 'verified' | 'failed';
  sslStatus: 'pending' | 'active' | 'expired' | 'failed';
  page: PublicSitePage;
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

const normalizeDnsStatus = (value: unknown): ResolvedPublicSitePage['dnsStatus'] =>
  value === 'verified' || value === 'failed' ? value : 'pending';

const normalizeSslStatus = (value: unknown): ResolvedPublicSitePage['sslStatus'] =>
  value === 'active' || value === 'expired' || value === 'failed' ? value : 'pending';

const normalizePathname = (value: string) => {
  const stripped = value.split('?')[0]?.split('#')[0] || '';
  return `/${stripped.replace(/^\/+/, '').replace(/\/+$/, '')}`;
};

const toResolvedPage = (payload: any, fallbackHost: string): ResolvedPublicSitePage | null => {
  if (!payload?.page || !payload?.domain) return null;

  return {
    host: String(payload.domain.host || fallbackHost),
    dnsStatus: normalizeDnsStatus(payload.domain.dnsStatus),
    sslStatus: normalizeSslStatus(payload.domain.sslStatus),
    page: {
      id: String(payload.page.id || ''),
      name: String(payload.page.name || ''),
      slug: String(payload.page.slug || ''),
      blocks: Array.isArray(payload.page.blocks) ? payload.page.blocks : [],
      settings: normalizeLandingPageSettings(payload.page.settings),
      contentHtml: String(payload.page.contentHtml || ''),
    },
  };
};

const resolveViaSameOrigin = async (host: string, pathname: string) => {
  const params = new URLSearchParams({
    host,
    path: pathname,
    _ts: String(Date.now()),
  });
  const response = await fetch(`/api/resolve-site-page?${params.toString()}`, {
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

const resolveViaPublicFunction = async (host: string, pathname: string) => {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  if (!supabaseUrl) {
    return null;
  }

  const params = new URLSearchParams({
    host,
    path: pathname,
    _ts: String(Date.now()),
  });
  const response = await fetch(`${supabaseUrl}/functions/v1/resolve-site-page?${params.toString()}`, {
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

export const resolvePublicSitePage = async (host: string, pathname: string): Promise<ResolvedPublicSitePage | null> => {
  const normalizedHost = normalizeSiteConnectorHost(host || '');
  if (!normalizedHost) return null;

  const normalizedPath = normalizePathname(pathname || '/');
  let payload: any = null;

  try {
    payload = await resolveViaSameOrigin(normalizedHost, normalizedPath);
  } catch {
    payload = null;
  }

  if (!payload) {
    try {
      payload = await resolveViaPublicFunction(normalizedHost, normalizedPath);
    } catch {
      payload = null;
    }
  }

  return toResolvedPage(payload, normalizedHost);
};
