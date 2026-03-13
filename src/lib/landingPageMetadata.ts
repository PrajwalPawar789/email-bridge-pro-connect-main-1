import { normalizeLandingPageSettings, type LandingPageSettings } from '@/lib/landingPageSettings';

const upsertMetaTag = (selector: string, attributes: Record<string, string>) => {
  if (typeof document === 'undefined') return;

  let element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null;
  if (!element) {
    element = document.createElement(selector.startsWith('link') ? 'link' : 'meta') as HTMLMetaElement | HTMLLinkElement;
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
};

export const applyLandingPageMetadata = ({
  pageName,
  settings,
}: {
  pageName: string;
  settings?: LandingPageSettings;
}) => {
  if (typeof document === 'undefined') return;

  const normalized = normalizeLandingPageSettings(settings);
  document.title = normalized.seo.title || pageName || 'Landing page';

  if (normalized.seo.description) {
    upsertMetaTag('meta[name="description"]', {
      name: 'description',
      content: normalized.seo.description,
    });
    upsertMetaTag('meta[property="og:description"]', {
      property: 'og:description',
      content: normalized.seo.description,
    });
  }

  upsertMetaTag('meta[property="og:title"]', {
    property: 'og:title',
    content: normalized.seo.title || pageName || 'Landing page',
  });

  if (normalized.seo.ogImageUrl) {
    upsertMetaTag('meta[property="og:image"]', {
      property: 'og:image',
      content: normalized.seo.ogImageUrl,
    });
  }

  if (normalized.seo.canonicalUrl) {
    upsertMetaTag('link[rel="canonical"]', {
      rel: 'canonical',
      href: normalized.seo.canonicalUrl,
    });
  }
};
