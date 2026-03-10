const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

const ignoredHosts = new Set(
  (import.meta.env.VITE_SITE_CONNECTOR_IGNORE_HOSTS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);

export const normalizeSiteConnectorHost = (value: string) =>
  value.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');

const isLocalHost = (hostname: string) => {
  if (localHosts.has(hostname)) return true;
  return /^192\.168\.\d+\.\d+$/.test(hostname) || /^10\.\d+\.\d+\.\d+$/.test(hostname);
};

export const shouldResolveSiteDomainHost = (hostname: string) => {
  const normalizedHost = normalizeSiteConnectorHost(hostname);
  if (!normalizedHost) return false;
  if (isLocalHost(normalizedHost)) return false;
  if (normalizedHost.endsWith('.vercel.app')) return false;
  if (ignoredHosts.has(normalizedHost)) return false;
  return true;
};
