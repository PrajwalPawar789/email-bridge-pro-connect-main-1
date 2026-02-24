import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { useAuth } from '@/providers/AuthProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  BillingSnapshot,
  BillingTransactionRow,
  CreditLedgerRow,
  formatCurrencyFromCents,
  getBillingSnapshot,
  listBillingTransactions,
  listCreditLedger,
} from '@/lib/billing';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw } from 'lucide-react';

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
};

const formatEventType = (value: string) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const Spending = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab] = useState('spending');

  const [loadingData, setLoadingData] = useState(false);
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerRow[]>([]);
  const [transactions, setTransactions] = useState<BillingTransactionRow[]>([]);

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
    else if (tab === 'billing') navigate('/billing');
    else navigate('/spending');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoadingData(true);
    try {
      const [snapshotRow, ledgerRows, txRows] = await Promise.all([
        getBillingSnapshot(user.id),
        listCreditLedger(user.id, 120),
        listBillingTransactions(user.id, 80),
      ]);

      setSnapshot(snapshotRow);
      setLedger(ledgerRows);
      setTransactions(txRows);
    } catch (error: any) {
      console.error('Failed to load spending data:', error);
      toast({
        title: 'Failed to load spending history',
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

  const usagePct = useMemo(() => {
    const used = Number(snapshot?.credits_used || 0);
    const total = Number(snapshot?.credits_in_period || 0);
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, (used / total) * 100));
  }, [snapshot]);

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
            <h1 className="text-2xl font-bold text-[var(--shell-ink)]">Spending History</h1>
            <p className="text-sm text-[var(--shell-muted)]">
              Track credit consumption and billing charges across your workspace.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadData()} disabled={loadingData}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingData ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Credits Remaining</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold">
              {Number(snapshot?.credits_remaining || 0).toLocaleString()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Credits Used</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold">
              {Number(snapshot?.credits_used || 0).toLocaleString()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Credits In Period</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold">
              {Number(snapshot?.credits_in_period || 0).toLocaleString()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">{usagePct.toFixed(1)}%</div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-emerald-500" style={{ width: `${usagePct}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Credit Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Event</th>
                    <th className="py-2 pr-4">Delta</th>
                    <th className="py-2 pr-4">Balance After</th>
                    <th className="py-2 pr-4">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry) => (
                    <tr key={entry.id} className="border-b">
                      <td className="py-2 pr-4">{formatDate(entry.created_at)}</td>
                      <td className="py-2 pr-4 capitalize">{formatEventType(entry.event_type)}</td>
                      <td className={`py-2 pr-4 font-semibold ${entry.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {entry.delta >= 0 ? '+' : ''}{entry.delta.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">{entry.balance_after.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-xs text-slate-500">{entry.reference_id || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ledger.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No credit ledger events yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing Transactions</CardTitle>
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
                    <th className="py-2 pr-4">Provider Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b">
                      <td className="py-2 pr-4">{formatDate(tx.created_at)}</td>
                      <td className="py-2 pr-4 capitalize">{tx.transaction_type}</td>
                      <td className="py-2 pr-4">{formatCurrencyFromCents(tx.amount_cents, tx.currency)}</td>
                      <td className="py-2 pr-4">
                        <Badge
                          className={
                            String(tx.status).toLowerCase() === 'succeeded'
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                              : String(tx.status).toLowerCase() === 'pending'
                              ? 'border border-amber-200 bg-amber-50 text-amber-700'
                              : 'border border-rose-200 bg-rose-50 text-rose-700'
                          }
                        >
                          {tx.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-500">{tx.provider_reference || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transactions.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No billing transactions yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Spending;
