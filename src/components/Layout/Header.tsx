import React, { useEffect, useMemo, useState } from 'react';
import { Gift, User, LogOut, Search, Settings, CreditCard, Clock, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from 'react-router-dom';
import { BillingSnapshot, getBillingSnapshot, normalizePlanId } from '@/lib/billing';

interface HeaderProps {
  user: any;
  onLogout: () => void;
  activeTab?: string;
}

const Header = ({ user, onLogout, activeTab }: HeaderProps) => {
  const [billingSnapshot, setBillingSnapshot] = useState<BillingSnapshot | null>(null);
  const [loadingBillingSnapshot, setLoadingBillingSnapshot] = useState(false);

  useEffect(() => {
    const userId = user?.id as string | undefined;
    if (!userId) {
      setBillingSnapshot(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingBillingSnapshot(true);
      try {
        const snapshot = await getBillingSnapshot(userId);
        if (!cancelled) {
          setBillingSnapshot(snapshot);
        }
      } catch (error) {
        console.error('Failed to load header billing snapshot:', error);
        if (!cancelled) {
          setBillingSnapshot(null);
        }
      } finally {
        if (!cancelled) setLoadingBillingSnapshot(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const planBadge = useMemo(() => {
    const snapshot = billingSnapshot;
    if (!snapshot) {
      return {
        label: loadingBillingSnapshot ? 'Loading plan...' : 'Starter Trial',
        badgeClass: 'text-slate-600',
        progressClass: 'bg-slate-200'
      };
    }

    const planId = normalizePlanId(snapshot.plan_id);
    if (planId === 'enterprise') {
      return {
        label: `${snapshot.plan_name || 'Enterprise'} (Power)`,
        badgeClass: 'text-amber-600',
        progressClass: 'bg-amber-300'
      };
    }
    if (planId === 'scale') {
      return {
        label: snapshot.plan_name || 'Scale',
        badgeClass: 'text-indigo-600',
        progressClass: 'bg-indigo-300'
      };
    }
    if (planId === 'growth') {
      return {
        label: snapshot.plan_name || 'Growth',
        badgeClass: 'text-emerald-600',
        progressClass: 'bg-emerald-300'
      };
    }
    return {
      label: snapshot.plan_name || 'Starter Trial',
      badgeClass: 'text-slate-600',
      progressClass: 'bg-slate-300'
    };
  }, [billingSnapshot, loadingBillingSnapshot]);

  const creditUsage = useMemo(() => {
    const used = Number(billingSnapshot?.credits_used || 0);
    const max = Number(billingSnapshot?.credits_in_period || 0);
    const pct = max > 0 ? Math.min(100, Math.max(0, (used / max) * 100)) : 0;
    return { used, max, pct };
  }, [billingSnapshot]);

  const tabLabels: Record<string, string> = {
    home: 'Home',
    campaigns: 'Campaigns',
    inbox: 'Inbox',
    automations: 'Automations',
    contacts: 'Contacts',
    pipeline: 'Pipeline',
    segments: 'Segments',
    templates: 'Templates',
    connect: 'Connect',
    integrations: 'Integrations',
    settings: 'Settings',
    subscription: 'Subscription',
    billing: 'Billing',
    spending: 'Spending'
  };
  const activeLabel = activeTab ? tabLabels[activeTab] || 'Workspace' : 'Workspace';

  return (
    <header className="h-16 bg-[var(--shell-surface-strong)]/90 border-b border-[var(--shell-border)] backdrop-blur flex items-center justify-between px-6 w-full">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--shell-muted)]">
            Workspace
          </p>
          <h2 className="text-lg font-semibold text-[var(--shell-ink)]" style={{ fontFamily: 'var(--shell-font-display)' }}>
            {activeLabel}
          </h2>
        </div>
        <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
          Live
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-2 rounded-full border border-[var(--shell-border)] bg-white/70 px-3 py-1.5 text-[var(--shell-muted)]">
          <Search className="h-4 w-4" />
          <Input
            placeholder="Search workspace"
            className="h-6 w-44 border-0 bg-transparent p-0 text-xs font-semibold text-[var(--shell-ink)] placeholder:text-[var(--shell-muted)] focus-visible:ring-0"
          />
        </div>

        <Button 
          variant="outline" 
          className="h-9 rounded-full border-[var(--shell-border)] bg-white/80 text-[var(--shell-ink)] font-semibold gap-2 hover:bg-white"
        >
          <Gift className="h-4 w-4" />
          Refer a friend
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 rounded-full border border-[var(--shell-border)] bg-white/80 px-2 py-1.5 hover:bg-white">
              <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-700 overflow-hidden">
                {user?.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </div>
              <span className="text-sm font-semibold text-[var(--shell-ink)] hidden md:block">
                {user?.email?.split('@')[0] || 'User'}
              </span>
              <svg className="w-4 h-4 text-[var(--shell-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 border-[var(--shell-border)] bg-white/95">
            <div className="p-3 bg-amber-50 rounded-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden">
                  {user?.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-emerald-50 flex items-center justify-center text-emerald-700">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{(user?.user_metadata as any)?.first_name ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}` : (user?.email?.split('@')[0] || 'User')}</div>
                  <div className="text-xs text-slate-600">{user?.email}</div>
                </div>
                <div className={`text-xs font-semibold flex items-center gap-1 ${planBadge.badgeClass}`}>
                  <Crown className="h-4 w-4" />
                  <span>{planBadge.label}</span>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-600 flex items-center justify-between">
                <div>Credit Usage</div>
                <div className={`font-semibold ${planBadge.badgeClass}`}>
                  {creditUsage.used.toLocaleString()}/{creditUsage.max.toLocaleString()}
                </div>
              </div>
              <div className="w-full bg-white rounded-full h-2 mt-2 overflow-hidden border border-white/30">
                <div className={`h-2 ${planBadge.progressClass}`} style={{ width: `${creditUsage.pct}%` }} />
              </div>
              {billingSnapshot && (
                <div className="mt-2 text-[11px] text-slate-600 flex items-center justify-between">
                  <span>Campaigns</span>
                  <span className="font-semibold">
                    {Number(billingSnapshot.campaigns_used || 0).toLocaleString()}
                    {billingSnapshot.unlimited_campaigns
                      ? ' / Unlimited'
                      : ` / ${Number(billingSnapshot.campaign_limit || 0).toLocaleString()}`}
                  </span>
                </div>
              )}
            </div>

            <div className="p-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--shell-muted)] font-semibold px-2 py-1">Account Management</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile" className="flex items-center gap-2 w-full">
                  <Settings className="h-4 w-4 text-slate-500" />
                  <div className="flex-1 text-sm">Account Settings</div>
                  <div className="text-xs text-slate-400">Manage your account details</div>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link to="/subscription" className="flex items-center gap-2 w-full">
                  <Crown className="h-4 w-4 text-slate-500" />
                  <div className="flex-1 text-sm">Subscription</div>
                  <div className="text-xs text-slate-400">Upgrade & Manage plans</div>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link to="/billing" className="flex items-center gap-2 w-full">
                  <CreditCard className="h-4 w-4 text-slate-500" />
                  <div className="flex-1 text-sm">Payments & Billing</div>
                  <div className="text-xs text-slate-400">Transactions, Invoices & Billing</div>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link to="/spending" className="flex items-center gap-2 w-full">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <div className="flex-1 text-sm">Spending History</div>
                  <div className="text-xs text-slate-400"> </div>
                </Link>
              </DropdownMenuItem>
            </div>

            <DropdownMenuSeparator />
            <div className="p-2">
              <DropdownMenuItem onClick={onLogout} className="text-amber-600 font-semibold">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
