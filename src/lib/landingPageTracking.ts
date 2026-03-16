import { supabase } from '@/integrations/supabase/client';

export type LandingPageEventType = 'page_view' | 'cta_click' | 'form_submit';

export interface LandingPageTrackPayload {
  pageId: string;
  pageSlug?: string;
  eventType: LandingPageEventType;
  blockId?: string;
  label?: string;
}

const SESSION_STORAGE_KEY = 'landing-page-session-id';

const getLandingPageSessionId = () => {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(SESSION_STORAGE_KEY, next);
  return next;
};

const buildTrackContext = () => {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);

  return {
    sourceUrl: window.location.href,
    referrer: document.referrer,
    host: window.location.host,
    path: window.location.pathname,
    locale: navigator.language,
    userAgent: navigator.userAgent,
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
    utmTerm: params.get('utm_term') || '',
    utmContent: params.get('utm_content') || '',
  };
};

export const trackLandingPageEvent = async (payload: LandingPageTrackPayload) => {
  if (typeof window === 'undefined') return;
  if (!payload.pageId && !payload.pageSlug) return;

  try {
    await supabase.functions.invoke('landing-page-track', {
      body: {
        pageId: payload.pageId,
        pageSlug: payload.pageSlug,
        eventType: payload.eventType,
        blockId: payload.blockId,
        label: payload.label,
        sessionId: getLandingPageSessionId(),
        context: buildTrackContext(),
      },
    });
  } catch {
    // Tracking is best effort and should never break page usage.
  }
};

export const trackLandingPageViewOnce = (pageId: string, pageSlug?: string) => {
  if (typeof window === 'undefined') return;
  const key = `landing-page-view:${pageId || pageSlug || 'unknown'}:${window.location.pathname}`;
  if (window.sessionStorage.getItem(key)) return;
  window.sessionStorage.setItem(key, '1');
  void trackLandingPageEvent({
    pageId,
    pageSlug,
    eventType: 'page_view',
  });
};
