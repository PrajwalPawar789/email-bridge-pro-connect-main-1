import React, { useEffect, useMemo, useState } from 'react';
import { Gift, User, LogOut, Search, Settings, CreditCard, Clock, Crown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from 'react-router-dom';
import { BillingSnapshot, getBillingSnapshot, normalizePlanId } from '@/lib/billing';

interface HeaderUser {
  id?: string;
  email?: string;
  user_metadata?: {
    avatar_url?: string;
    first_name?: string;
    last_name?: string;
  };
}

interface HeaderProps {
  user: HeaderUser | null;
  onLogout: () => void;
  activeTab?: string;
}

const Header = ({ user, onLogout, activeTab }: HeaderProps) => {
  const [billingSnapshot, setBillingSnapshot] = useState<BillingSnapshot | null>(null);
  const [loadingBillingSnapshot, setLoadingBillingSnapshot] = useState(false);
  const hasBillingSnapshot = Boolean(billingSnapshot);
  const userMetadata = user?.user_metadata;

  useEffect(() => {
    const userId = user?.id;
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
        badgeClass: 'border border-slate-200 bg-white text-slate-600',
        progressClass: 'bg-slate-400'
      };
    }

    const planId = normalizePlanId(snapshot.plan_id);
    if (planId === 'enterprise') {
      return {
        label: `${snapshot.plan_name || 'Enterprise'} (Power)`,
        badgeClass: 'border border-amber-200 bg-amber-50 text-amber-700',
        progressClass: 'bg-amber-400'
      };
    }
    if (planId === 'scale') {
      return {
        label: snapshot.plan_name || 'Scale',
        badgeClass: 'border border-indigo-200 bg-indigo-50 text-indigo-700',
        progressClass: 'bg-indigo-400'
      };
    }
    if (planId === 'growth') {
      return {
        label: snapshot.plan_name || 'Growth',
        badgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
        progressClass: 'bg-emerald-400'
      };
    }
    return {
      label: snapshot.plan_name || 'Starter Trial',
      badgeClass: 'border border-slate-200 bg-slate-50 text-slate-700',
      progressClass: 'bg-slate-400'
    };
  }, [billingSnapshot, loadingBillingSnapshot]);

  const creditUsage = useMemo(() => {
    const used = Number(billingSnapshot?.credits_used || 0);
    const max = Number(billingSnapshot?.credits_in_period || 0);
    const pct = max > 0 ? Math.min(100, Math.max(0, (used / max) * 100)) : 0;
    return { used, max, pct };
  }, [billingSnapshot]);

  const campaignUsage = useMemo(() => {
    const used = Number(billingSnapshot?.campaigns_used || 0);
    const max = Number(billingSnapshot?.campaign_limit || 0);
    const unlimited = Boolean(billingSnapshot?.unlimited_campaigns);
    return { used, max, unlimited };
  }, [billingSnapshot]);

  const displayName = useMemo(() => {
    const fullName = `${userMetadata?.first_name || ''} ${userMetadata?.last_name || ''}`.trim();
    if (fullName) return fullName;
    return user?.email?.split('@')[0] || 'User';
  }, [user?.email, userMetadata?.first_name, userMetadata?.last_name]);

  const tabLabels: Record<string, string> = {
    home: 'Home',
    campaigns: 'Campaigns',
    inbox: 'Inbox',
    automations: 'Automations',
    contacts: 'Contacts',
    pipeline: 'Pipeline',
    referrals: 'Referrals',
    segments: 'Segments',
    'email-builder': 'Email Builder',
    'landing-pages': 'Landing Pages',
    'site-connector': 'Site Connector',
    templates: 'Templates',
    connect: 'Connect',
    integrations: 'Integrations',
    team: 'Team',
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
          asChild
        >
          <Link to="/referrals">
            <Gift className="h-4 w-4" />
            Refer a friend
          </Link>
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
          <DropdownMenuContent
            align="end"
            sideOffset={10}
            className="w-[360px] max-w-[calc(100vw-1rem)] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-0 shadow-[0_26px_65px_-24px_rgba(15,23,42,0.45)]"
          >
            <div className="p-2">
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white p-4">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-full overflow-hidden border border-slate-200 bg-emerald-50">
                    {user?.user_metadata?.avatar_url ? (
                      <img src={user.user_metadata.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-emerald-700">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  </div>

                  <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${planBadge.badgeClass}`}>
                    <Crown className="h-3.5 w-3.5" />
                    <span className="max-w-[120px] truncate">{planBadge.label}</span>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-200 bg-white/90 p-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-600">
                    <span className="font-medium">Credit usage</span>
                    <span className="text-xs font-semibold text-slate-800">
                      {loadingBillingSnapshot
                        ? 'Loading...'
                        : hasBillingSnapshot
                          ? `${creditUsage.used.toLocaleString()} / ${creditUsage.max.toLocaleString()}`
                          : 'No data'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full transition-[width] duration-300 ${planBadge.progressClass}`} style={{ width: `${creditUsage.pct}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {creditUsage.max > 0
                      ? `${Math.max(creditUsage.max - creditUsage.used, 0).toLocaleString()} credits remaining`
                      : loadingBillingSnapshot
                        ? 'Syncing billing snapshot'
                        : 'No credit allocation found'}
                  </p>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Campaigns</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {loadingBillingSnapshot
                        ? 'Loading...'
                        : campaignUsage.unlimited
                          ? `${campaignUsage.used.toLocaleString()} / Unlimited`
                          : `${campaignUsage.used.toLocaleString()} / ${campaignUsage.max.toLocaleString()}`}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Current plan</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">{planBadge.label}</p>
                    <p className="text-[11px] text-slate-500">Manage in Subscription</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-2 pb-2">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Account</p>
              <div className="space-y-1">
                <DropdownMenuItem asChild className="group h-auto rounded-lg px-2 py-2.5 focus:bg-slate-100">
                  <Link to="/profile" className="flex w-full items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                      <Settings className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">Account settings</p>
                      <p className="truncate text-[11px] text-slate-500">Profile, security and preferences</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-500" />
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild className="group h-auto rounded-lg px-2 py-2.5 focus:bg-slate-100">
                  <Link to="/subscription" className="flex w-full items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                      <Crown className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">Subscription</p>
                      <p className="truncate text-[11px] text-slate-500">Upgrade, downgrade, or change billing cycle</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-500" />
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild className="group h-auto rounded-lg px-2 py-2.5 focus:bg-slate-100">
                  <Link to="/billing" className="flex w-full items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">Payments & billing</p>
                      <p className="truncate text-[11px] text-slate-500">Invoices, transactions, and payment methods</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-500" />
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild className="group h-auto rounded-lg px-2 py-2.5 focus:bg-slate-100">
                  <Link to="/spending" className="flex w-full items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">Spending history</p>
                      <p className="truncate text-[11px] text-slate-500">Track monthly usage and charges over time</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-500" />
                  </Link>
                </DropdownMenuItem>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
              <DropdownMenuSeparator className="mx-0 my-0 bg-slate-200" />
              <div className="p-2">
                <DropdownMenuItem
                  onClick={onLogout}
                  className="h-10 rounded-lg px-3 font-semibold text-rose-600 focus:bg-rose-50 focus:text-rose-700"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
