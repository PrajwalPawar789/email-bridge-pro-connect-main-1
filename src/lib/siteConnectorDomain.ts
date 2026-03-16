import { parse } from 'tldts';

import type { SiteDomainType } from '@/lib/siteConnectorPersistence';

export interface SiteConnectorDomainDetails {
  normalizedDomain: string;
  zoneRoot: string;
  hostLabel: string;
}

const DOMAIN_LABEL_PATTERN = /^[a-z0-9-]+$/;

const normalizeDomainInput = (value: string) => value.trim().toLowerCase().replace(/\.+$/, '');

const hasUrlOnlyCharacters = (value: string) => /:\/\//.test(value) || /[/?#]/.test(value);

const hasInvalidLabel = (label: string) =>
  !label ||
  label.length > 63 ||
  label.startsWith('-') ||
  label.endsWith('-') ||
  !DOMAIN_LABEL_PATTERN.test(label);

export const normalizeAndValidateSiteDomain = (
  value: string,
  type: SiteDomainType
): SiteConnectorDomainDetails => {
  const normalizedDomain = normalizeDomainInput(value);

  if (!normalizedDomain) {
    throw new Error('Domain is required.');
  }

  if (hasUrlOnlyCharacters(value)) {
    throw new Error('Enter only the hostname, without http://, https://, paths, or query strings.');
  }

  if (/\s/.test(normalizedDomain)) {
    throw new Error('Domain cannot contain spaces.');
  }

  if (normalizedDomain.startsWith('*.')) {
    throw new Error('Wildcard domains are not supported here.');
  }

  if (normalizedDomain === 'localhost' || normalizedDomain.endsWith('.localhost')) {
    throw new Error('Use a public domain instead of localhost.');
  }

  if (normalizedDomain.includes(':')) {
    throw new Error('Ports and IP-style hostnames are not supported.');
  }

  const parsed = parse(normalizedDomain, {
    allowPrivateDomains: true,
    extractHostname: true,
  });

  if (parsed.isIp) {
    throw new Error('Use a domain name, not an IP address.');
  }

  const zoneRoot = String(parsed.domain || '').trim().toLowerCase();
  const publicSuffix = String(parsed.publicSuffix || '').trim().toLowerCase();
  const hostLabel = String(parsed.subdomain || '').trim().toLowerCase();

  if (!zoneRoot || !publicSuffix) {
    throw new Error('Enter a valid public domain like example.com or lp.example.co.uk.');
  }

  const labels = normalizedDomain.split('.').filter(Boolean);
  if (labels.length < 2 || labels.some(hasInvalidLabel)) {
    throw new Error('Enter a valid hostname using letters, numbers, or hyphens.');
  }

  if (type === 'root' && hostLabel) {
    throw new Error('Root domains cannot include a subdomain. Use example.com instead.');
  }

  if (type === 'subdomain' && !hostLabel) {
    throw new Error('Subdomains must include a host label like lp.example.com.');
  }

  return {
    normalizedDomain,
    zoneRoot,
    hostLabel,
  };
};

export const getSiteConnectorDnsRecordDisplayName = (
  domain: string,
  domainType: SiteDomainType,
  record: { type: string; name: string }
) => {
  const details = normalizeAndValidateSiteDomain(domain, domainType);
  const normalizedType = String(record.type || '').trim().toUpperCase();
  const normalizedName = normalizeDomainInput(String(record.name || ''));

  if (!normalizedName || normalizedName === '@') {
    return domainType === 'subdomain' ? details.hostLabel || '@' : '@';
  }

  if (normalizedName === details.normalizedDomain) {
    return domainType === 'subdomain' ? details.hostLabel || '@' : '@';
  }

  if (normalizedName === details.zoneRoot) {
    return '@';
  }

  if (normalizedName.endsWith(`.${details.zoneRoot}`)) {
    return normalizedName.slice(0, -(details.zoneRoot.length + 1));
  }

  if (domainType === 'subdomain' && normalizedType === 'TXT' && normalizedName === '_verify') {
    return details.hostLabel ? `_verify.${details.hostLabel}` : '_verify';
  }

  return String(record.name || '').trim();
};
