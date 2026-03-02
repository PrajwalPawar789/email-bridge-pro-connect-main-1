import { supabase } from '@/integrations/supabase/client';

const client = supabase as any;

const REFERRAL_QUERY_KEYS = ['ref', 'referral', 'referral_code'] as const;

export const PENDING_REFERRAL_CODE_STORAGE_KEY = 'auth:pending-referral-code';
export const PENDING_REFERRAL_CLAIM_READY_STORAGE_KEY = 'auth:pending-referral-claim-ready';
export const DEFAULT_REFERRAL_BONUS_CREDITS = 10000;

export type ReferralProgramDashboard = {
  userId: string;
  isRegistered: boolean;
  referralCode: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  companyEmail: string | null;
  totalReferrals: number;
  pendingReferrals: number;
  rewardedReferrals: number;
  totalBonusCredits: number;
};

export type ReferralEventRow = {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referral_code: string;
  status: 'pending' | 'qualified' | 'rewarded' | 'rejected' | string;
  bonus_credits: number;
  bonus_awarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RegisterReferralProgramInput = {
  firstName: string;
  lastName: string;
  companyName: string;
  companyEmail: string;
  termsAccepted: boolean;
};

export type ClaimReferralResult = {
  linked: boolean;
  message: string;
  referralEventId: string | null;
  referrerUserId: string | null;
  bonusCredits: number;
};

export function normalizeReferralCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function captureReferralCodeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search || '');

  for (const key of REFERRAL_QUERY_KEYS) {
    const value = normalizeReferralCode(params.get(key));
    if (value) {
      return value;
    }
  }

  return null;
}

export function persistPendingReferralCode(code: string): void {
  const normalized = normalizeReferralCode(code);
  if (!normalized || typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(PENDING_REFERRAL_CODE_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage failures.
  }
}

export function readPendingReferralCode(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return normalizeReferralCode(window.localStorage.getItem(PENDING_REFERRAL_CODE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearPendingReferralCode(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(PENDING_REFERRAL_CODE_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function markPendingReferralClaimReady(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_REFERRAL_CLAIM_READY_STORAGE_KEY, 'true');
  } catch {
    // Ignore storage failures.
  }
}

export function isPendingReferralClaimReady(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PENDING_REFERRAL_CLAIM_READY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function clearPendingReferralClaimReady(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_REFERRAL_CLAIM_READY_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function buildReferralLink(referralCode: string): string {
  const normalized = normalizeReferralCode(referralCode);
  if (!normalized) return '';

  if (typeof window === 'undefined') {
    return `/auth?ref=${encodeURIComponent(normalized)}`;
  }

  return `${window.location.origin}/auth?ref=${encodeURIComponent(normalized)}`;
}

const toDashboard = (raw: any, userId: string): ReferralProgramDashboard => ({
  userId,
  isRegistered: Boolean(raw?.is_registered),
  referralCode: raw?.referral_code ? String(raw.referral_code) : null,
  firstName: raw?.first_name ? String(raw.first_name) : null,
  lastName: raw?.last_name ? String(raw.last_name) : null,
  companyName: raw?.company_name ? String(raw.company_name) : null,
  companyEmail: raw?.company_email ? String(raw.company_email) : null,
  totalReferrals: Number(raw?.total_referrals || 0),
  pendingReferrals: Number(raw?.pending_referrals || 0),
  rewardedReferrals: Number(raw?.rewarded_referrals || 0),
  totalBonusCredits: Number(raw?.total_bonus_credits || 0),
});

export async function getReferralProgramDashboard(userId: string): Promise<ReferralProgramDashboard> {
  const { data, error } = await client.rpc('get_referral_program_dashboard', {
    p_user_id: userId,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : null;
  return toDashboard(row, userId);
}

export async function registerReferralProgramMember(
  userId: string,
  input: RegisterReferralProgramInput
): Promise<ReferralProgramDashboard> {
  const { error } = await client.rpc('register_referral_program_member', {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_company_name: input.companyName,
    p_company_email: input.companyEmail,
    p_terms_accepted: input.termsAccepted,
    p_user_id: userId,
  });

  if (error) throw error;

  return getReferralProgramDashboard(userId);
}

export async function listReferralEvents(userId: string, limit = 100): Promise<ReferralEventRow[]> {
  const { data, error } = await client
    .from('referral_events')
    .select(
      'id, referrer_user_id, referred_user_id, referral_code, status, bonus_credits, bonus_awarded_at, created_at, updated_at'
    )
    .eq('referrer_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []) as ReferralEventRow[];
}

export async function claimReferralForUser(
  referralCode: string,
  userId: string
): Promise<ClaimReferralResult> {
  const normalized = normalizeReferralCode(referralCode);

  if (!normalized) {
    return {
      linked: false,
      message: 'Referral code is missing.',
      referralEventId: null,
      referrerUserId: null,
      bonusCredits: 0,
    };
  }

  const { data, error } = await client.rpc('claim_referral_for_user', {
    p_referral_code: normalized,
    p_referred_user_id: userId,
    p_default_bonus_credits: DEFAULT_REFERRAL_BONUS_CREDITS,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : null;

  return {
    linked: Boolean(row?.linked),
    message: String(row?.message || 'Referral processed.'),
    referralEventId: row?.referral_event_id ? String(row.referral_event_id) : null,
    referrerUserId: row?.referrer_user_id ? String(row.referrer_user_id) : null,
    bonusCredits: Number(row?.bonus_credits || 0),
  };
}
