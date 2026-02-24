import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  BillingInvoiceRow,
  BillingSnapshot,
  BillingTransactionRow,
  PaymentMethodRow,
  createPaymentMethod,
  deletePaymentMethod,
  formatCurrencyFromCents,
  getBillingSnapshot,
  listBillingTransactions,
  listInvoices,
  listPaymentMethods,
  normalizePlanId,
  setDefaultPaymentMethod,
  toBillingCycle,
} from '@/lib/billing';
import { supabase } from '@/integrations/supabase/client';
import { CreditCard, Plus, ReceiptText, RefreshCw, Wallet } from 'lucide-react';

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
};

const statusBadgeClass = (status: string) => {
  const s = String(status || '').toLowerCase();
  if (s === 'paid' || s === 'succeeded' || s === 'active') {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (s === 'pending' || s === 'trialing') {
    return 'border border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border border-rose-200 bg-rose-50 text-rose-700';
};

const Billing = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [activeTab] = useState('billing');
  const [loadingData, setLoadingData] = useState(false);
  const [savingMethod, setSavingMethod] = useState(false);

  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoiceRow[]>([]);
  const [transactions, setTransactions] = useState<BillingTransactionRow[]>([]);

  const [brand, setBrand] = useState('visa');
  const [last4, setLast4] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [isDefault, setIsDefault] = useState(true);

  const handleTabChange = (tab: string) => {
    if (tab === 'home') navigate('/dashboard');
    else if (tab === 'campaigns') navigate('/campaigns');
    else if (tab === 'inbox') navigate('/inbox');
    else if (tab === 'automations') navigate('/automations');
    else if (tab === 'pipeline') navigate('/pipeline');
    else if (
      tab === 'contacts' ||
      tab === 'segments' ||
      tab === 'templates' ||
      tab === 'connect' ||
      tab === 'settings'
    ) {
      navigate(`/dashboard?tab=${tab}`);
    } else if (tab === 'subscription') navigate('/subscription');
    else if (tab === 'spending') navigate('/spending');
    else navigate('/billing');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoadingData(true);
    try {
      const [snapshotRow, methods, invoicesRows, transactionRows] = await Promise.all([
        getBillingSnapshot(user.id),
        listPaymentMethods(user.id),
        listInvoices(user.id, 30),
        listBillingTransactions(user.id, 40),
      ]);

      setSnapshot(snapshotRow);
      setPaymentMethods(methods);
      setInvoices(invoicesRows);
      setTransactions(transactionRows);

      if (methods.length > 0) {
        setIsDefault(false);
      }
    } catch (error: any) {
      console.error('Failed to load billing page data:', error);
      toast({
        title: 'Failed to load billing data',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingData(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
      return;
    }
    if (user) {
      void loadData();
    }
  }, [loading, user, navigate, loadData]);

  const currentPlanLabel = useMemo(() => {
    if (!snapshot) return 'Starter Trial';
    const planId = normalizePlanId(snapshot.plan_id);
    if (planId === 'enterprise') return `${snapshot.plan_name || 'Enterprise'} (Power)`;
    return snapshot.plan_name || 'Starter Trial';
  }, [snapshot]);

  const currentBillingCycle = useMemo(() => {
    if (!snapshot) return 'monthly';
    return toBillingCycle(snapshot.billing_cycle);
  }, [snapshot]);

  const addPaymentMethod = async () => {
    if (!user?.id) return;
    setSavingMethod(true);
    try {
      await createPaymentMethod(user.id, {
        brand,
        last4,
        expMonth: expMonth ? Number(expMonth) : null,
        expYear: expYear ? Number(expYear) : null,
        isDefault,
      });

      setLast4('');
      setExpMonth('');
      setExpYear('');
      setIsDefault(false);

      await loadData();
      toast({ title: 'Payment method added', description: 'Your payment method was saved.' });
    } catch (error: any) {
      toast({
        title: 'Could not save payment method',
        description: error?.message || 'Please verify details and try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingMethod(false);
    }
  };

  const makeDefault = async (methodId: string) => {
    if (!user?.id) return;
    try {
      await setDefaultPaymentMethod(user.id, methodId);
      await loadData();
      toast({ title: 'Default payment method updated' });
    } catch (error: any) {
      toast({
        title: 'Failed to update default payment method',
        description: error?.message || 'Try again in a moment.',
        variant: 'destructive',
      });
    }
  };

  const removeMethod = async (methodId: string) => {
    if (!user?.id) return;
    try {
      await deletePaymentMethod(user.id, methodId);
      await loadData();
      toast({ title: 'Payment method removed' });
    } catch (error: any) {
      toast({
        title: 'Could not remove payment method',
        description: error?.message || 'Try again in a moment.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={handleTabChange} user={user} onLogout={handleLogout}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--shell-ink)]">Payments & Billing</h1>
            <p className="text-sm text-[var(--shell-muted)]">
              Manage payment methods, invoices, and subscription charges.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void loadData()} disabled={loadingData}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loadingData ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={() => navigate('/subscription')}>Change Plan</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Current Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">{currentPlanLabel}</div>
              <div className="mt-1 text-xs text-slate-500">Billed {currentBillingCycle}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Subscription Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className={statusBadgeClass(snapshot?.subscription_status || 'pending')}>
                {snapshot?.subscription_status || 'pending'}
              </Badge>
              <div className="mt-2 text-xs text-slate-500">
                Period ends: {formatDate(snapshot?.current_period_end)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Credits Remaining</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {Number(snapshot?.credits_remaining || 0).toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Used {Number(snapshot?.credits_used || 0).toLocaleString()} / {Number(snapshot?.credits_in_period || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Payment Methods
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentMethods.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No payment methods saved yet.
              </div>
            ) : (
              <div className="space-y-2">
                {paymentMethods.map((method) => (
                  <div key={method.id} className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm font-semibold uppercase">{method.brand} •••• {method.last4}</div>
                      <div className="text-xs text-slate-500">
                        {method.exp_month && method.exp_year
                          ? `Expires ${String(method.exp_month).padStart(2, '0')}/${method.exp_year}`
                          : 'No expiry set'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {method.is_default ? (
                        <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">Default</Badge>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => void makeDefault(method.id)}>
                          Set default
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => void removeMethod(method.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-md border bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Plus className="h-4 w-4" /> Add payment method
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <div>
                  <Label>Brand</Label>
                  <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="visa" className="mt-1" />
                </div>
                <div>
                  <Label>Last 4</Label>
                  <Input value={last4} onChange={(e) => setLast4(e.target.value)} placeholder="4242" maxLength={4} className="mt-1" />
                </div>
                <div>
                  <Label>Exp Month</Label>
                  <Input value={expMonth} onChange={(e) => setExpMonth(e.target.value)} placeholder="12" className="mt-1" />
                </div>
                <div>
                  <Label>Exp Year</Label>
                  <Input value={expYear} onChange={(e) => setExpYear(e.target.value)} placeholder="2028" className="mt-1" />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" disabled={savingMethod} onClick={() => void addPaymentMethod()}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                </div>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                Set as default payment method
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4" />
              Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-4">Issued</th>
                    <th className="py-2 pr-4">Plan</th>
                    <th className="py-2 pr-4">Cycle</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Period</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b">
                      <td className="py-2 pr-4">{formatDate(invoice.issued_at)}</td>
                      <td className="py-2 pr-4">{invoice.plan_id || '-'}</td>
                      <td className="py-2 pr-4 capitalize">{invoice.billing_cycle}</td>
                      <td className="py-2 pr-4">{formatCurrencyFromCents(invoice.amount_cents, invoice.currency)}</td>
                      <td className="py-2 pr-4">
                        <Badge className={statusBadgeClass(invoice.status)}>{invoice.status}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-500">
                        {formatDate(invoice.period_start)} to {formatDate(invoice.period_end)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invoices.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No invoices yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Charges</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b">
                      <td className="py-2 pr-4">{formatDate(tx.created_at)}</td>
                      <td className="py-2 pr-4 capitalize">{tx.transaction_type}</td>
                      <td className="py-2 pr-4">{formatCurrencyFromCents(tx.amount_cents, tx.currency)}</td>
                      <td className="py-2 pr-4">
                        <Badge className={statusBadgeClass(tx.status)}>{tx.status}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-500">{tx.provider_reference || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transactions.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No charge transactions yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Billing;
