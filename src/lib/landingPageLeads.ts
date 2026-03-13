import { supabase } from '@/integrations/supabase/client';

export interface LandingPageEmailListOption {
  id: string;
  name: string;
  description?: string;
  count: number;
}

export interface LandingPageLeadStat {
  pageId: string;
  total: number;
  lastSubmittedAt?: string;
}

export interface LandingPageLeadSubmission {
  id: string;
  fullName: string;
  email: string;
  company?: string;
  submittedAt: string;
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

export const listLandingPageEmailLists = async (): Promise<LandingPageEmailListOption[]> => {
  const user = await getAuthenticatedUser();
  const { data, error } = await (supabase as any)
    .from('email_lists')
    .select('id, name, description, email_list_prospects(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name || ''),
    description: row.description ? String(row.description) : undefined,
    count: Number(row.email_list_prospects?.[0]?.count || 0),
  }));
};

export const createLandingPageEmailList = async (
  name: string,
  description?: string
): Promise<LandingPageEmailListOption> => {
  const user = await getAuthenticatedUser();
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('List name is required');

  const { data, error } = await (supabase as any)
    .from('email_lists')
    .insert({
      user_id: user.id,
      name: trimmedName,
      description: description?.trim() || null,
    })
    .select('id, name, description')
    .single();

  if (error) throw error;

  return {
    id: String(data.id),
    name: String(data.name || ''),
    description: data.description ? String(data.description) : undefined,
    count: 0,
  };
};

export const listLandingPageLeadStats = async (): Promise<Record<string, LandingPageLeadStat>> => {
  const user = await getAuthenticatedUser();
  const { data, error } = await (supabase as any)
    .from('landing_page_form_submissions')
    .select('landing_page_id, submitted_at')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })
    .limit(2000);

  if (error) throw error;

  return (Array.isArray(data) ? data : []).reduce((acc: Record<string, LandingPageLeadStat>, row: any) => {
    const pageId = String(row.landing_page_id || '');
    if (!pageId) return acc;
    const submittedAt = String(row.submitted_at || '');
    const existing = acc[pageId];
    if (!existing) {
      acc[pageId] = {
        pageId,
        total: 1,
        lastSubmittedAt: submittedAt || undefined,
      };
      return acc;
    }
    existing.total += 1;
    if (!existing.lastSubmittedAt && submittedAt) {
      existing.lastSubmittedAt = submittedAt;
    }
    return acc;
  }, {});
};

export const listRecentLandingPageLeads = async (
  pageId: string,
  limit = 6
): Promise<LandingPageLeadSubmission[]> => {
  if (!pageId) return [];
  const user = await getAuthenticatedUser();
  const { data, error } = await (supabase as any)
    .from('landing_page_form_submissions')
    .select('id, full_name, email, company, submitted_at')
    .eq('user_id', user.id)
    .eq('landing_page_id', pageId)
    .order('submitted_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id),
    fullName: String(row.full_name || ''),
    email: String(row.email || ''),
    company: row.company ? String(row.company) : undefined,
    submittedAt: String(row.submitted_at || ''),
  }));
};
