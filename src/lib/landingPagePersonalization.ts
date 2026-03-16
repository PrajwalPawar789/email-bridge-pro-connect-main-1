export type LandingPagePersonalizationContext = Record<string, string>;

const humanizeToken = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const buildLandingPagePersonalizationContext = (): LandingPagePersonalizationContext => {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const context: LandingPagePersonalizationContext = {};

  params.forEach((value, key) => {
    const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    if (!normalizedKey) return;
    context[normalizedKey] = value.trim();
  });

  context.host = window.location.host || '';
  context.path = window.location.pathname || '';
  context.url = window.location.href || '';
  context.date = new Date().toLocaleDateString();

  return context;
};

export const resolveLandingPagePersonalization = (
  value: unknown,
  context: LandingPagePersonalizationContext
) => {
  const source = String(value || '');
  if (!source.includes('{{')) return source;

  return source.replace(/{{\s*([a-zA-Z0-9_.-]+)(?:\|([^}]+))?\s*}}/g, (_match, rawToken, rawFallback) => {
    const token = String(rawToken || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_');
    const candidate = token ? String(context[token] || '').trim() : '';
    if (candidate) return candidate;

    const fallback = String(rawFallback || '').trim();
    if (fallback) return fallback;

    return humanizeToken(String(rawToken || ''));
  });
};

export const resolveLandingPagePersonalizationList = (
  values: unknown[],
  context: LandingPagePersonalizationContext
) => values.map((item) => resolveLandingPagePersonalization(item, context));
