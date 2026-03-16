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

const removeHeadElement = (selector: string) => {
  if (typeof document === 'undefined') return;
  document.head.querySelector(selector)?.remove();
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
  const title = normalized.seo.title || pageName || 'Landing page';
  const description = normalized.seo.description || '';
  const canonicalUrl =
    normalized.seo.canonicalUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const ogImageUrl = normalized.seo.ogImageUrl || '';
  const themeColor = normalized.theme.background || '#ffffff';

  document.title = title;

  removeHeadElement('script[type="application/ld+json"]');

  upsertMetaTag('meta[name="author"]', {
    name: 'author',
    content: pageName || 'Landing page',
  });
  upsertMetaTag('meta[name="application-name"]', {
    name: 'application-name',
    content: pageName || 'Landing page',
  });
  upsertMetaTag('meta[name="robots"]', {
    name: 'robots',
    content: 'index, follow',
  });
  upsertMetaTag('meta[name="theme-color"]', {
    name: 'theme-color',
    content: themeColor,
  });

  if (description) {
    upsertMetaTag('meta[name="description"]', {
      name: 'description',
      content: description,
    });
    upsertMetaTag('meta[property="og:description"]', {
      property: 'og:description',
      content: description,
    });
    upsertMetaTag('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    });
  } else {
    removeHeadElement('meta[name="description"]');
    removeHeadElement('meta[property="og:description"]');
    removeHeadElement('meta[name="twitter:description"]');
  }

  upsertMetaTag('meta[property="og:title"]', {
    property: 'og:title',
    content: title,
  });
  upsertMetaTag('meta[name="twitter:title"]', {
    name: 'twitter:title',
    content: title,
  });
  upsertMetaTag('meta[property="og:type"]', {
    property: 'og:type',
    content: 'website',
  });
  upsertMetaTag('meta[name="twitter:card"]', {
    name: 'twitter:card',
    content: 'summary_large_image',
  });
  upsertMetaTag('meta[property="og:site_name"]', {
    property: 'og:site_name',
    content: pageName || title,
  });

  if (canonicalUrl) {
    upsertMetaTag('link[rel="canonical"]', {
      rel: 'canonical',
      href: canonicalUrl,
    });
    upsertMetaTag('meta[property="og:url"]', {
      property: 'og:url',
      content: canonicalUrl,
    });
  } else {
    removeHeadElement('link[rel="canonical"]');
    removeHeadElement('meta[property="og:url"]');
  }

  if (ogImageUrl) {
    upsertMetaTag('meta[property="og:image"]', {
      property: 'og:image',
      content: ogImageUrl,
    });
    upsertMetaTag('meta[name="twitter:image"]', {
      name: 'twitter:image',
      content: ogImageUrl,
    });
  } else {
    removeHeadElement('meta[property="og:image"]');
    removeHeadElement('meta[property="og:image:alt"]');
    removeHeadElement('meta[name="twitter:image"]');
  }
};
