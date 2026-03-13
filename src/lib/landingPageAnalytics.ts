import { supabase } from '@/integrations/supabase/client';

export interface LandingPageAnalyticsSummary {
  pageId: string;
  views: number;
  ctaClicks: number;
  leads: number;
  conversionRate: number;
  lastViewedAt?: string;
  topSource?: string;
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

const pickReadableSource = (row: any) => {
  const utmSource = String(row?.utm_source || '').trim();
  if (utmSource) return utmSource;

  const referrer = String(row?.referrer || '').trim();
  if (!referrer) return '';

  try {
    return new URL(referrer).host || referrer;
  } catch {
    return referrer;
  }
};

export const listLandingPageAnalyticsSummaries = async (): Promise<Record<string, LandingPageAnalyticsSummary>> => {
  const user = await getAuthenticatedUser();

  const [{ data: eventRows, error: eventError }, { data: submissionRows, error: submissionError }] = await Promise.all([
    (supabase as any)
      .from('landing_page_events')
      .select('landing_page_id, event_type, created_at, utm_source, referrer')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4000),
    (supabase as any)
      .from('landing_page_form_submissions')
      .select('landing_page_id, submitted_at, utm_source, referrer')
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false })
      .limit(4000),
  ]);

  if (eventError) throw eventError;
  if (submissionError) throw submissionError;

  const summary: Record<string, LandingPageAnalyticsSummary> = {};
  const sourceCounts: Record<string, Record<string, number>> = {};

  (Array.isArray(eventRows) ? eventRows : []).forEach((row: any) => {
    const pageId = String(row?.landing_page_id || '');
    if (!pageId) return;
    summary[pageId] ||= {
      pageId,
      views: 0,
      ctaClicks: 0,
      leads: 0,
      conversionRate: 0,
      lastViewedAt: undefined,
      topSource: undefined,
    };

    if (row?.event_type === 'page_view') {
      summary[pageId].views += 1;
      if (!summary[pageId].lastViewedAt && row?.created_at) {
        summary[pageId].lastViewedAt = String(row.created_at);
      }
    }

    if (row?.event_type === 'cta_click') {
      summary[pageId].ctaClicks += 1;
    }

    const source = pickReadableSource(row);
    if (!source) return;

    sourceCounts[pageId] ||= {};
    sourceCounts[pageId][source] = (sourceCounts[pageId][source] || 0) + 1;
  });

  (Array.isArray(submissionRows) ? submissionRows : []).forEach((row: any) => {
    const pageId = String(row?.landing_page_id || '');
    if (!pageId) return;
    summary[pageId] ||= {
      pageId,
      views: 0,
      ctaClicks: 0,
      leads: 0,
      conversionRate: 0,
      lastViewedAt: undefined,
      topSource: undefined,
    };

    summary[pageId].leads += 1;

    const source = pickReadableSource(row);
    if (!source) return;

    sourceCounts[pageId] ||= {};
    sourceCounts[pageId][source] = (sourceCounts[pageId][source] || 0) + 1;
  });

  Object.values(summary).forEach((item) => {
    item.conversionRate = item.views > 0 ? Number(((item.leads / item.views) * 100).toFixed(1)) : 0;

    const sources = Object.entries(sourceCounts[item.pageId] || {});
    if (sources.length > 0) {
      sources.sort((a, b) => b[1] - a[1]);
      item.topSource = sources[0]?.[0];
    }
  });

  return summary;
};
