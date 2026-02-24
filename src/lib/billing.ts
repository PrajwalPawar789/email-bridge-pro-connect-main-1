import { supabase } from '@/integrations/supabase/client';

export type BillingCycle = 'monthly' | 'annual';
export type PlanId = 'free' | 'growth' | 'scale' | 'enterprise';

export type BillingSnapshot = {
  user_id: string;
  plan_id: string;
  plan_name: string;
  billing_cycle: string;
  subscription_status: string;
  current_period_start: string;
  current_period_end: string;
  credits_in_period: number;
  credits_used: number;
  credits_remaining: number;
  mailbox_limit: number | null;
  mailboxes_used: number;
  unlimited_mailboxes: boolean;
  campaign_limit: number | null;
  campaigns_used: number;
  unlimited_campaigns: boolean;
};

export type PaymentMethodRow = {
  id: string;
  user_id: string;
  provider: string;
  brand: string;
  last4: string;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type BillingInvoiceRow = {
  id: string;
  user_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  billing_cycle: string;
  amount_cents: number;
  currency: string;
  status: string;
  issued_at: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type BillingTransactionRow = {
  id: string;
  user_id: string;
  invoice_id: string | null;
  transaction_type: string;
  status: string;
  amount_cents: number;
  currency: string;
  provider: string;
  provider_reference: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type CreditLedgerRow = {
  id: string;
  user_id: string;
  subscription_id: string | null;
  delta: number;
  balance_after: number;
  event_type: string;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type CreatePaymentMethodInput = {
  brand: string;
  last4: string;
  expMonth?: number | null;
  expYear?: number | null;
  provider?: string;
  isDefault?: boolean;
};

const client = supabase as any;

export function normalizePlanId(value: unknown): PlanId | null {
  const v = String(value ?? '').toLowerCase();
  if (v === 'free' || v === 'growth' || v === 'scale' || v === 'enterprise') {
    return v as PlanId;
  }
  return null;
}

export function toBillingCycle(value: unknown): BillingCycle {
  const v = String(value ?? '').toLowerCase();
  return v === 'annual' ? 'annual' : 'monthly';
}

export function formatCurrencyFromCents(amountCents: number, currency = 'USD') {
  const amount = (Number(amountCents || 0) / 100).toFixed(2);
  const symbol = currency.toUpperCase() === 'USD' ? '$' : `${currency.toUpperCase()} `;
  return `${symbol}${amount}`;
}

export async function getBillingSnapshot(userId: string): Promise<BillingSnapshot | null> {
  const { data, error } = await client.rpc('get_billing_snapshot', { p_user_id: userId });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : null) as BillingSnapshot | null;
}

export async function listPaymentMethods(userId: string): Promise<PaymentMethodRow[]> {
  const { data, error } = await client
    .from('billing_payment_methods')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as PaymentMethodRow[];
}

export async function createPaymentMethod(userId: string, input: CreatePaymentMethodInput): Promise<PaymentMethodRow> {
  const normalizedLast4 = String(input.last4 || '').replace(/\D/g, '').slice(-4);
  if (normalizedLast4.length !== 4) {
    throw new Error('Card last 4 digits are required.');
  }

  const methods = await listPaymentMethods(userId);
  const setDefault = input.isDefault ?? methods.length === 0;

  if (setDefault && methods.length > 0) {
    const { error: resetError } = await client
      .from('billing_payment_methods')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('is_default', true);

    if (resetError) throw resetError;
  }

  const payload = {
    user_id: userId,
    provider: input.provider || 'manual',
    brand: String(input.brand || 'card').toLowerCase(),
    last4: normalizedLast4,
    exp_month: input.expMonth ?? null,
    exp_year: input.expYear ?? null,
    is_default: setDefault,
  };

  const { data, error } = await client
    .from('billing_payment_methods')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return data as PaymentMethodRow;
}

export async function setDefaultPaymentMethod(userId: string, methodId: string): Promise<void> {
  const { error: resetError } = await client
    .from('billing_payment_methods')
    .update({ is_default: false })
    .eq('user_id', userId)
    .eq('is_default', true);

  if (resetError) throw resetError;

  const { error: setError } = await client
    .from('billing_payment_methods')
    .update({ is_default: true })
    .eq('user_id', userId)
    .eq('id', methodId);

  if (setError) throw setError;
}

export async function deletePaymentMethod(userId: string, methodId: string): Promise<void> {
  const methods = await listPaymentMethods(userId);
  const target = methods.find((m) => m.id === methodId) || null;

  const { error } = await client
    .from('billing_payment_methods')
    .delete()
    .eq('user_id', userId)
    .eq('id', methodId);

  if (error) throw error;

  if (target?.is_default) {
    const next = methods.find((m) => m.id !== methodId) || null;
    if (next) {
      await setDefaultPaymentMethod(userId, next.id);
    }
  }
}

export async function listInvoices(userId: string, limit = 25): Promise<BillingInvoiceRow[]> {
  const { data, error } = await client
    .from('billing_invoices')
    .select('*')
    .eq('user_id', userId)
    .order('issued_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as BillingInvoiceRow[];
}

export async function listBillingTransactions(userId: string, limit = 50): Promise<BillingTransactionRow[]> {
  const { data, error } = await client
    .from('billing_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as BillingTransactionRow[];
}

export async function listCreditLedger(userId: string, limit = 100): Promise<CreditLedgerRow[]> {
  const { data, error } = await client
    .from('credit_ledger')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as CreditLedgerRow[];
}
