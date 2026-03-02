import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  ChevronDown,
  BadgePercent,
  ChevronUp,
  CircleCheckBig,
  CircleX,
  Gift,
  Rocket,
  BarChart3,
  Building2,
  Coins,
  X,
  Loader2,
  Plus,
  CreditCard
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { listPaymentMethods, PaymentMethodRow } from '@/lib/billing';

type BillingCycle = 'monthly' | 'annual';
type PlanId = 'free' | 'growth' | 'scale' | 'enterprise';

type Plan = {
  id: PlanId;
  name: string;
  description?: string;
  priceMonthly: number;
  priceAnnual: number;
  creditsPerMonth: number | null;
  creditsLabel?: string;
  creditsNote?: string;
  popular?: boolean;
  rank?: number;
  meta?: Record<string, any>;
};

type ComparisonRow = {
  label: string;
  values: (boolean | string | '-')[];
};

type BillingSnapshot = {
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

type ContactSalesForm = {
  fullName: string;
  email: string;
  company: string;
  role: string;
  teamSize: string;
  crm: string;
  message: string;
  website: string;
};

const DEFAULT_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Starter Trial',
    description: 'Validate your outbound workflow before scaling.',
    priceMonthly: 0,
    priceAnnual: 0,
    creditsPerMonth: null,
    creditsLabel: '2,000 workflow credits',
    creditsNote: '14-day trial, no credit card required',
    rank: 1
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'For lean GTM teams launching repeatable campaigns.',
    priceMonthly: 79,
    priceAnnual: 63,
    creditsPerMonth: 100000,
    rank: 2
  },
  {
    id: 'scale',
    name: 'Scale',
    description: 'For revenue teams operating multiple inbox pods.',
    priceMonthly: 149,
    priceAnnual: 119,
    creditsPerMonth: 300000,
    popular: true,
    rank: 3
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For global teams with compliance and governance needs.',
    priceMonthly: 0,
    priceAnnual: 0,
    creditsPerMonth: null,
    creditsLabel: 'Custom credit architecture',
    rank: 4
  }
];

const coreRows: ComparisonRow[] = [
  { label: 'Sender inboxes included', values: ['1', '5', '20', 'Unlimited'] },
  { label: 'Campaigns included', values: ['3', '25', '100', 'Unlimited'] },
  { label: 'Campaign studio + sequencing', values: [true, true, true, true] },
  { label: 'AI follow-up automation', values: ['Basic', 'Advanced', 'Advanced + routing', 'Custom workflows'] },
  { label: 'Inbox + reply workspace', values: ['Basic', 'Shared inbox', 'Shared + team rules', 'Enterprise controls'] },
  { label: 'Template library + personalization', values: [true, true, true, true] },
  { label: 'Pipeline board + stage management', values: [true, true, true, true] },
  { label: 'CRM sync (HubSpot/Salesforce)', values: ['One-way', 'Two-way', 'Two-way + mapping', 'Custom bi-directional'] },
  { label: 'API + webhooks', values: ['-', true, true, true] },
  { label: 'Support model', values: ['Community', 'Email support', 'Priority support', 'Dedicated CSM'] },
  { label: 'Overage credits (per 1,000)', values: ['N/A', '$12', '$9', 'Custom'] }
];

const insightsRows: ComparisonRow[] = [
  { label: 'Deliverability health scoring', values: ['Basic', true, true, true] },
  { label: 'Reply intent classification', values: ['Basic', 'Advanced', 'Advanced + enrichment', 'Custom models'] },
  { label: 'Pipeline attribution depth', values: ['-', 'Campaign-level', 'Revenue-level', 'Multi-workspace BI'] },
  { label: 'A/B testing + send-time optimization', values: [false, true, true, true] },
  { label: 'Team roles + approval flows', values: ['-', 'Basic roles', 'Role + approvals', 'Custom policies'] },
  { label: 'Security controls', values: ['Standard', 'Enhanced', 'Audit logs', 'SSO, SCIM, data residency'] },
  { label: 'Onboarding model', values: ['Self-serve', 'Guided setup', 'Migration support', 'White-glove implementation'] },
  { label: 'Service SLA', values: ['-', '-', '99.9% uptime target', 'Contracted SLA'] }
];

function formatPrice(n: number) {
  return n === 0 ? '$0' : `$${n.toFixed(0)}`;
}

function priceFor(plan: Plan, billing: BillingCycle) {
  return billing === 'monthly' ? plan.priceMonthly : plan.priceAnnual;
}

function planIcon(id: PlanId) {
  const cls = 'h-6 w-6 text-[var(--shell-accent)]';
  if (id === 'free') return <Gift className={cls} />;
  if (id === 'growth') return <Rocket className={cls} />;
  if (id === 'scale') return <BarChart3 className={cls} />;
  return <Building2 className={cls} />;
}

function planDisplay(plan: Plan, billing: BillingCycle) {
  const isEnterprise = plan.id === 'enterprise';
  const price = priceFor(plan, billing);

  let priceLabel: React.ReactNode;
  const priceSuffix = '';

  if (isEnterprise) {
    priceLabel = 'Custom Plan';
  } else if (price === 0) {
    priceLabel = '$0';
  } else if (billing === 'annual' && plan.priceAnnual > 0 && plan.priceAnnual < plan.priceMonthly) {
    priceLabel = (
      <span className="inline-flex items-baseline gap-2">
        <span className="font-medium text-slate-400 line-through">{formatPrice(plan.priceMonthly)}</span>
        <span className="font-bold">{formatPrice(plan.priceAnnual)}</span>
      </span>
    );
  } else {
    priceLabel = `$${price}`;
  }

  let billedNote = billing === 'monthly' ? 'Per month, billed monthly' : 'Per month, billed annually';
  let credits = plan.creditsLabel ?? '';

  if (plan.id === 'free') {
    credits = '2,000 workflow credits';
    billedNote = '14-day trial, no credit card required';
  } else if (plan.id === 'enterprise') {
    credits = 'Custom credit architecture';
  } else if (billing === 'annual') {
    if (plan.id === 'growth') credits = '1,200,000 credits per workspace/year';
    if (plan.id === 'scale') credits = '3,600,000 credits per workspace/year';
  } else {
    if (plan.id === 'growth') credits = '100,000 credits per workspace/month';
    if (plan.id === 'scale') credits = '300,000 credits per workspace/month';
  }

  return { priceLabel, priceSuffix, billedNote, credits };
}

function mapUserPackageNameToPlanId(userPackageName: string | null): PlanId | null {
  if (!userPackageName) return null;
  const name = userPackageName.toLowerCase();
  if (name.includes('free') || name.includes('starter') || name.includes('launch')) return 'free';
  if (name.includes('growth') || name.includes('pro')) return 'growth';
  if (name.includes('scale') || name.includes('power')) return 'scale';
  if (name.includes('enterprise')) return 'enterprise';
  return null;
}

function parsePlanId(value: unknown): PlanId | null {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'free' || normalized === 'growth' || normalized === 'scale' || normalized === 'enterprise') {
    return normalized as PlanId;
  }
  return null;
}

function getPlanChangeType(currentRank?: number, selectedRank?: number): 'upgrade' | 'downgrade' | 'same' {
  if (currentRank === undefined || selectedRank === undefined) return 'same';
  if (selectedRank > currentRank) return 'upgrade';
  if (selectedRank < currentRank) return 'downgrade';
  return 'same';
}

function mapTenureToInternal(tenure: unknown): BillingCycle {
  const t = String(tenure ?? '').toLowerCase();
  if (t === 'annual' || t === 'annually' || t === '12') return 'annual';
  return 'monthly';
}

function renderCell(v: boolean | string | '-') {
  if (v === '-' || v === '✖') return <CircleX className="h-5 w-5 text-rose-500" />;
  if (v === true) return <CircleCheckBig className="h-5 w-5 text-emerald-600" />;
  if (v === false) return <CircleX className="h-5 w-5 text-rose-500" />;
  if (typeof v === 'string') {
    return <span className="inline-block rounded-full border px-2 py-0.5 text-xs text-slate-700">{v}</span>;
  }
  return null;
}

function formatDateShort(value: string | null | undefined) {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function resolveActiveTab(pathname: string) {
  if (pathname === '/billing') return 'billing';
  if (pathname === '/spending') return 'spending';
  return 'subscription';
}

type PlanCardProps = {
  plan: Plan;
  billing: BillingCycle;
  selected: boolean;
  planIndex: number;
  onSelect: () => void;
  onContactSales: () => void;
  onToggleComparison: () => void;
  comparisonOpen: boolean;
  core: ComparisonRow[];
  insights: ComparisonRow[];
  userPlanId: PlanId | null;
  userBillingCycle: BillingCycle;
  selectedBillingCycle: BillingCycle;
  isPlanExpired: boolean;
};

const PlanCard = ({
  plan,
  billing,
  selected,
  planIndex,
  onSelect,
  onContactSales,
  onToggleComparison,
  comparisonOpen,
  core,
  insights,
  userPlanId,
  userBillingCycle,
  selectedBillingCycle,
  isPlanExpired
}: PlanCardProps) => {
  const includedCore = core
    .map((r) => ({ label: r.label, v: r.values[planIndex] }))
    .filter((r) => r.v !== false && r.v !== '-');
  const includedInsights = insights
    .map((r) => ({ label: r.label, v: r.values[planIndex] }))
    .filter((r) => r.v !== false && r.v !== '-');
  const highlightedCore = includedCore.slice(0, 4);
  const highlightedInsights = includedInsights.slice(0, 3);
  const additionalCount = Math.max(
    0,
    includedCore.length + includedInsights.length - highlightedCore.length - highlightedInsights.length
  );

  const isCurrent = userPlanId === plan.id && billing === userBillingCycle;
  const isSelectedUI = selected && selectedBillingCycle === billing;
  const isDisabled = plan.id === 'free' || plan.id === 'enterprise' || (isCurrent && !isPlanExpired);
  const details = planDisplay(plan, billing);

  const buttonText = isCurrent
    ? isPlanExpired
      ? 'Renew Plan'
      : 'Current Plan'
    : isSelectedUI
    ? 'Selected'
    : 'Select Plan';

  return (
    <Card
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all duration-200 ${
        plan.id === 'free' || plan.id === 'enterprise' ? 'cursor-default' : 'cursor-pointer'
      } ${
        isSelectedUI
          ? 'border-emerald-300 bg-emerald-50/40 ring-2 ring-emerald-200 shadow-[0_20px_45px_-28px_rgba(16,185,129,0.55)]'
          : 'shadow-[0_16px_40px_-30px_rgba(15,23,42,0.45)] hover:border-slate-300 hover:shadow-[0_18px_44px_-30px_rgba(15,23,42,0.5)]'
      }`}
      onClick={plan.id === 'free' || plan.id === 'enterprise' ? undefined : onSelect}
      role={plan.id === 'free' || plan.id === 'enterprise' ? undefined : 'button'}
      tabIndex={plan.id === 'free' || plan.id === 'enterprise' ? -1 : 0}
      onKeyDown={(e) => {
        if (plan.id !== 'free' && plan.id !== 'enterprise' && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <CardHeader className="space-y-4 p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2.5">
              {planIcon(plan.id)}
              <CardTitle className="text-base font-semibold text-slate-900 md:text-lg">{plan.name}</CardTitle>
            </div>
            {plan.description && <div className="mt-2 text-sm text-slate-600">{plan.description}</div>}
          </div>
          {isCurrent && isPlanExpired ? (
            <Badge className="border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">Expired</Badge>
          ) : isCurrent ? (
            <Badge className="border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50">Current</Badge>
          ) : plan.popular ? (
            <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Most Popular</Badge>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3">
          <div className="text-3xl font-bold text-slate-900">
            {details.priceLabel}
            {details.priceSuffix && <span className="text-sm text-slate-500">{details.priceSuffix}</span>}
          </div>
          <div className="mt-1 text-xs text-slate-500" style={{ visibility: plan.id === 'enterprise' ? 'hidden' : undefined }}>
            {details.billedNote}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col space-y-4 px-5 pb-5 pt-0">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center text-sm font-semibold text-slate-800">
            <Coins className="mr-2 h-4 w-4 text-[var(--shell-warm)]" />
            {details.credits}
          </div>
        </div>

        <div className="grid grid-cols-1">
          {plan.id === 'enterprise' ? (
            <Button
              className="h-10 w-full bg-[var(--shell-ink)] text-white hover:bg-slate-800"
              onClick={onContactSales}
            >
              Contact our sales
            </Button>
          ) : (
            <Button
              onClick={onSelect}
              disabled={isDisabled}
              className={`h-10 w-full ${
                isSelectedUI
                  ? 'bg-[#424242] text-white'
                  : 'bg-[var(--shell-accent)] text-white hover:bg-emerald-700'
              }`}
            >
              {isSelectedUI && <Check className="h-4 w-4 text-white" />}
              {buttonText}
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Execution</div>
          <ul className="space-y-1.5">
            {highlightedCore.map((item) => (
              <li key={item.label} className="flex items-start text-sm text-slate-700">
                <Check className="mr-2 mt-0.5 h-4 w-4 text-emerald-600" />
                <span>
                  {item.label}
                  {typeof item.v === 'string' && <span className="ml-2 text-xs text-slate-600">{item.v}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Intelligence</div>
          <ul className="space-y-1.5">
            {highlightedInsights.map((item) => (
              <li key={item.label} className="flex items-start text-sm text-slate-700">
                <Check className="mr-2 mt-0.5 h-4 w-4 text-emerald-600" />
                <span>
                  {item.label}
                  {typeof item.v === 'string' && <span className="ml-2 text-xs text-slate-600">{item.v}</span>}
                </span>
              </li>
            ))}
          </ul>
          {additionalCount > 0 && (
            <p className="text-xs text-slate-500">+{additionalCount} more features in comparison view</p>
          )}
        </div>
      </CardContent>

      <button
        type="button"
        onClick={onToggleComparison}
        aria-expanded={comparisonOpen}
        className="inline-flex w-full items-center justify-center border-t border-slate-200 px-4 py-3 text-sm font-semibold text-[var(--shell-accent)] transition-colors hover:bg-slate-50"
      >
        {comparisonOpen ? 'Hide plan comparison' : 'Show plan comparison'}
        {comparisonOpen ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
      </button>
    </Card>
  );
};

type PlanComparisonTableProps = {
  billing: BillingCycle;
  plans: Plan[];
  selectedPlan: PlanId;
  onSelect: (id: PlanId) => void;
  onContactSales: () => void;
  core: ComparisonRow[];
  insights: ComparisonRow[];
  userBillingCycle: BillingCycle;
  userPlanId: PlanId | null;
  selectedBillingCycle: BillingCycle;
  isPlanExpired: boolean;
};

const PlanComparisonTable = ({
  billing,
  plans,
  selectedPlan,
  onSelect,
  onContactSales,
  core,
  insights,
  userBillingCycle,
  userPlanId,
  selectedBillingCycle,
  isPlanExpired
}: PlanComparisonTableProps) => {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_-34px_rgba(15,23,42,0.5)]">
      <table className="min-w-[780px] w-full text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 p-3 text-left font-semibold text-slate-700">
              Feature
            </th>
            {plans.map((p) => {
              const d = planDisplay(p, billing);
              const isSelected = p.id === selectedPlan && billing === selectedBillingCycle;
              const isCurrent = userPlanId === p.id && billing === userBillingCycle;
              const isDisabled = p.id === 'free' || p.id === 'enterprise' || (isCurrent && !isPlanExpired);

              return (
                <th
                  key={p.id}
                  className={`p-3 text-left align-bottom font-semibold text-slate-800 ${
                    isSelected ? 'bg-emerald-50/80 border-b-2 border-emerald-300' : ''
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {planIcon(p.id)}
                      <span className="font-semibold">{p.name}</span>
                      {isCurrent && isPlanExpired && <Badge className="bg-rose-500 text-xs text-white">EXPIRED</Badge>}
                    </div>
                    <div className="text-[15px] font-medium">{d.priceLabel}</div>
                    <div className="text-[11px] text-slate-500" style={{ visibility: p.id === 'enterprise' ? 'hidden' : undefined }}>
                      {d.billedNote}
                    </div>
                    <div className="flex items-center text-[13px] font-semibold text-black">
                      <Coins className="h-4 w-4 text-black" /> {d.credits}
                    </div>
                    <div className="pt-2">
                      {p.id === 'enterprise' ? (
                        <Button
                          className="w-full bg-[var(--shell-ink)] text-white hover:bg-slate-800"
                          onClick={onContactSales}
                        >
                          Contact our sales
                        </Button>
                      ) : (
                        <Button
                          onClick={() => onSelect(p.id)}
                          disabled={isDisabled}
                          className={`h-9 w-full ${
                            isCurrent
                              ? 'bg-[#424242] text-white'
                              : isSelected
                              ? 'bg-[#424242] text-white'
                              : 'bg-[var(--shell-accent)] text-white hover:bg-emerald-700'
                          }`}
                        >
                          {isCurrent ? (isPlanExpired ? 'Renew Plan' : 'Current Plan') : isSelected ? 'Selected' : 'Select Plan'}
                        </Button>
                      )}
                    </div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              colSpan={1 + plans.length}
              className="bg-slate-50/60 p-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
              style={{ border: '1px solid #e7e8e9' }}
            >
              Outbound Execution Capabilities
            </td>
          </tr>
          {core.map((row, i) => (
            <tr key={`core-${i}`} className="border-t border-slate-200">
              <td className="sticky left-0 z-10 border-r border-slate-200 bg-white p-3 font-medium text-slate-800">
                {row.label}
              </td>
              {row.values.map((v, idx) => (
                <td
                  key={idx}
                  className={`p-3 ${plans[idx]?.id === selectedPlan && billing === selectedBillingCycle ? 'bg-emerald-50/60' : 'bg-white'}`}
                >
                  {renderCell(v)}
                </td>
              ))}
            </tr>
          ))}

          <tr>
            <td
              colSpan={1 + plans.length}
              className="bg-slate-50/60 p-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
              style={{ border: '1px solid #e7e8e9' }}
            >
              Revenue Intelligence Layer
            </td>
          </tr>
          {insights.map((row, i) => (
            <tr key={`insights-${i}`} className="border-t border-slate-200">
              <td className="sticky left-0 z-10 border-r border-slate-200 bg-white p-3 font-medium text-slate-800">
                {row.label}
              </td>
              {row.values.map((v, idx) => (
                <td
                  key={idx}
                  className={`p-3 ${plans[idx]?.id === selectedPlan && billing === selectedBillingCycle ? 'bg-emerald-50/60' : 'bg-white'}`}
                >
                  {renderCell(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function Subscription() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [billing, setBilling] = useState<BillingCycle>('annual');
  const [userBillingCycle, setUserBillingCycle] = useState<BillingCycle>('annual');
  const [selectedPlans, setSelectedPlans] = useState<{ monthly: PlanId; annual: PlanId }>({
    monthly: 'growth',
    annual: 'growth'
  });
  const selectedPlan = selectedPlans[billing];
  const [userPlanId, setUserPlanId] = useState<PlanId | null>(null);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<BillingCycle>('annual');
  const [plansState] = useState<Plan[]>(DEFAULT_PLANS);
  const [showComparison, setShowComparison] = useState(false);
  const [currentPlanName, setCurrentPlanName] = useState<string>('Starter Trial');
  const [userPlanRank, setUserPlanRank] = useState<number | undefined>();
  const [isPlanExpired, setIsPlanExpired] = useState(false);
  const [billingSnapshot, setBillingSnapshot] = useState<BillingSnapshot | null>(null);
  const [loadingBillingSnapshot, setLoadingBillingSnapshot] = useState(false);

  const [summaryBounds, setSummaryBounds] = useState({ left: 0, width: 0 });
  const [summaryHeight, setSummaryHeight] = useState(0);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const comparisonHeadingRef = useRef<HTMLDivElement | null>(null);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultStatus, setResultStatus] = useState<'Successful' | 'Cancelled' | 'Failed'>('Successful');
  const [invoiceContent, setInvoiceContent] = useState<string | null>(null);
  const [confirmForceOpen, setConfirmForceOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('other');
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [contactSalesOpen, setContactSalesOpen] = useState(false);
  const [contactSalesSubmitting, setContactSalesSubmitting] = useState(false);
  const [contactSalesStatus, setContactSalesStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [contactSalesError, setContactSalesError] = useState('');
  const [contactSalesForm, setContactSalesForm] = useState<ContactSalesForm>({
    fullName: '',
    email: '',
    company: '',
    role: '',
    teamSize: '',
    crm: '',
    message: '',
    website: '',
  });

  const sortedPlans = useMemo(() => plansState, [plansState]);
  const selectedPlanObj = useMemo(() => sortedPlans.find((p) => p.id === selectedPlan), [sortedPlans, selectedPlan]);
  const shouldShowSummaryTray = Boolean(
    selectedPlanObj &&
      userPlanId &&
      (isPlanExpired || selectedPlan !== userPlanId || billing !== userBillingCycle) &&
      !showResult &&
      !confirmForceOpen
  );
  const isSelectedCurrentPlan = userPlanId === selectedPlan && billing === userBillingCycle;
  const summaryStatusLabel = isSelectedCurrentPlan ? (isPlanExpired ? 'Expired' : 'Current') : 'Selected';
  const annualSavings =
    selectedPlanObj && billing === 'annual' && selectedPlanObj.priceAnnual > 0 && selectedPlanObj.priceAnnual < selectedPlanObj.priceMonthly
      ? selectedPlanObj.priceMonthly * 12 - selectedPlanObj.priceAnnual * 12
      : 0;
  const creditUsagePct = useMemo(() => {
    const used = Number(billingSnapshot?.credits_used || 0);
    const total = Number(billingSnapshot?.credits_in_period || 0);
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, (used / total) * 100));
  }, [billingSnapshot]);
  const snapshotStatusValue = String(billingSnapshot?.subscription_status || '').toLowerCase();
  const snapshotStatusLabel = !billingSnapshot
    ? 'Snapshot unavailable'
    : snapshotStatusValue === 'active' || snapshotStatusValue === 'trialing'
    ? 'Active'
    : snapshotStatusValue === 'past_due'
    ? 'Past due'
    : snapshotStatusValue === 'canceled' || snapshotStatusValue === 'cancelled'
    ? 'Canceled'
    : snapshotStatusValue || 'Unknown';
  const snapshotStatusClass =
    snapshotStatusValue === 'active' || snapshotStatusValue === 'trialing'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : snapshotStatusValue === 'past_due'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : snapshotStatusValue === 'canceled' || snapshotStatusValue === 'cancelled'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-slate-200 bg-slate-100 text-slate-600';
  const periodEndLabel = formatDateShort(billingSnapshot?.current_period_end);

  const dynamicCoreRows = useMemo(() => coreRows, []);
  const dynamicInsightsRows = useMemo(() => insightsRows, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const applyMetadataFallback = () => {
      const metadata = (user.user_metadata as any) || {};
      const packageName = metadata.plan_name || metadata.package_name || 'Starter Trial';
      const tenure = mapTenureToInternal(metadata.tenure || metadata.plan_tenure || 'annual');
      const expired = Boolean(metadata.is_subscription_expired || metadata.plan_expired || false);
      const mappedId = mapUserPackageNameToPlanId(packageName) ?? 'free';

      if (cancelled) return;
      setBillingSnapshot(null);
      setCurrentPlanName(packageName);
      setIsPlanExpired(expired);
      setUserBillingCycle(tenure);
      setBilling(tenure);
      setSelectedBillingCycle(tenure);
      setUserPlanId(mappedId);
      setSelectedPlans((prev) => ({ ...prev, [tenure]: mappedId }));
      setUserPlanRank(sortedPlans.find((p) => p.id === mappedId)?.rank);
    };

    const loadBillingSnapshot = async () => {
      setLoadingBillingSnapshot(true);
      try {
        const { data, error } = await (supabase as any).rpc('get_billing_snapshot', {
          p_user_id: user.id
        });

        if (error) throw error;

        const snapshot = (Array.isArray(data) ? data[0] : null) as BillingSnapshot | null;
        if (!snapshot) {
          applyMetadataFallback();
          return;
        }

        const planId = parsePlanId(snapshot.plan_id) ?? mapUserPackageNameToPlanId(snapshot.plan_name) ?? 'free';
        const nextBilling = mapTenureToInternal(snapshot.billing_cycle || 'monthly');
        const status = String(snapshot.subscription_status || '').toLowerCase();
        const expired = !['active', 'trialing'].includes(status);
        const planName = snapshot.plan_name || sortedPlans.find((p) => p.id === planId)?.name || 'Starter Trial';

        if (cancelled) return;

        setBillingSnapshot(snapshot);
        setCurrentPlanName(planName);
        setIsPlanExpired(expired);
        setUserBillingCycle(nextBilling);
        setBilling(nextBilling);
        setSelectedBillingCycle(nextBilling);
        setUserPlanId(planId);
        setSelectedPlans((prev) => ({ ...prev, [nextBilling]: planId }));
        setUserPlanRank(sortedPlans.find((p) => p.id === planId)?.rank);
      } catch (error) {
        console.error('Failed to load billing snapshot:', error);
        applyMetadataFallback();
      } finally {
        if (!cancelled) setLoadingBillingSnapshot(false);
      }
    };

    void loadBillingSnapshot();

    return () => {
      cancelled = true;
    };
  }, [user, sortedPlans]);

  const recalcBounds = () => {
    const el = pageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSummaryBounds({ left: Math.round(rect.left), width: Math.round(rect.width) });
  };

  useEffect(() => {
    recalcBounds();
    const onResize = () => recalcBounds();
    const onScroll = () => recalcBounds();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll as any);
    };
  }, []);

  useEffect(() => {
    const el = summaryRef.current;
    if (!shouldShowSummaryTray || !el) {
      setSummaryHeight(0);
      return;
    }
    const measure = () => setSummaryHeight(el ? el.offsetHeight : 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [shouldShowSummaryTray, selectedPlan, billing, showComparison, checkoutLoading, billingSnapshot]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'home') {
      navigate('/dashboard');
    } else if (tab === 'campaigns') {
      navigate('/campaigns');
    } else if (tab === 'inbox') {
      navigate('/inbox');
    } else if (tab === 'automations') {
      navigate('/automations');
    } else if (tab === 'pipeline') {
      navigate('/pipeline');
    } else if (tab === 'contacts' || tab === 'segments' || tab === 'templates' || tab === 'connect' || tab === 'settings') {
      navigate(`/dashboard?tab=${tab}`);
    } else if (tab === 'billing') {
      navigate('/billing');
    } else if (tab === 'spending') {
      navigate('/spending');
    } else {
      navigate('/subscription');
    }
  };

  const selectPlan = (id: PlanId, cycle?: BillingCycle) => {
    const nextCycle = cycle ?? billing;
    setSelectedPlans((prev) => ({ ...prev, [nextCycle]: id }));
    setSelectedBillingCycle(nextCycle);
    setTimeout(recalcBounds, 200);
  };

  const handleToggleComparison = () => {
    setShowComparison((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => {
          const el = comparisonHeadingRef.current;
          if (!el) return;
          const top = el.getBoundingClientRect().top + window.scrollY - 120;
          window.scrollTo({ top, behavior: 'smooth' });
        });
      }
      return next;
    });
  };

  const getUpgradeButtonText = (plan?: Plan) => {
    if (!plan) return 'Upgrade Plan';
    if (plan.id === 'enterprise') return 'Contact Sales';
    if (userPlanId === plan.id && billing === userBillingCycle && !isPlanExpired) return 'Current Plan';

    const changeType = getPlanChangeType(userPlanRank, plan.rank);
    if (changeType === 'upgrade') return 'Upgrade Plan';
    if (changeType === 'downgrade') return 'Downgrade Plan';
    return 'Change Plan';
  };

  const startResultModal = (status: 'Successful' | 'Cancelled' | 'Failed', plan: Plan, methodLabel: string) => {
    const dateStr = new Date().toLocaleString();
    if (status === 'Successful') {
      setInvoiceContent(`Invoice for ${plan.name} via ${methodLabel} on ${dateStr}.`);
    } else if (status === 'Cancelled') {
      setInvoiceContent(`Subscription update for ${plan.name} was cancelled on ${dateStr}.`);
    } else {
      setInvoiceContent(`Payment for ${plan.name} failed on ${dateStr}. Please try again.`);
    }
    setResultStatus(status);
    setShowResult(true);
  };

  const handleCheckout = async (plan: Plan) => {
    if (plan.id === 'free') return;
    if (plan.id === 'enterprise') {
      openContactSalesDialog();
      return;
    }
    if (userPlanId === plan.id && billing === userBillingCycle && !isPlanExpired) return;

    if (userPlanId && userPlanId !== plan.id && !isPlanExpired) {
      setPendingPlan(plan);
      setConfirmForceOpen(true);
      return;
    }

    setPendingPlan(plan);
    await loadPaymentMethodsForCheckout();
  };

  const loadPaymentMethodsForCheckout = async () => {
    if (!user) {
      setShowPaymentMethodModal(true);
      return;
    }

    setLoadingPaymentMethods(true);
    try {
      const methods = await listPaymentMethods(user.id);
      setPaymentMethods(methods);
      const defaultMethod = methods.find((m) => m.is_default) || methods[0] || null;
      setSelectedPaymentMethodId(defaultMethod?.id || 'other');
    } catch (error) {
      console.error('Failed to load payment methods for checkout:', error);
      setPaymentMethods([]);
      setSelectedPaymentMethodId('other');
      toast({
        title: 'Payment methods unavailable',
        description: 'Could not load saved payment methods. You can continue with a new payment method.',
        variant: 'destructive'
      });
    } finally {
      setLoadingPaymentMethods(false);
      setShowPaymentMethodModal(true);
    }
  };

  const performForceCheckout = async () => {
    setConfirmForceOpen(false);
    await loadPaymentMethodsForCheckout();
  };

  const handleFinalCheckout = async () => {
    if (!pendingPlan || !user) return;
    const planToApply = pendingPlan;

    setShowPaymentMethodModal(false);
    setCheckoutLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 900));

    const method = paymentMethods.find((m) => m.id === selectedPaymentMethodId);
    const methodLabel = method
      ? `${String(method.brand || 'card').toUpperCase()} ****${method.last4}`
      : 'new payment method';

    try {
      const { error: planError } = await (supabase as any).rpc('set_user_subscription_plan', {
        p_plan_id: planToApply.id,
        p_billing_cycle: billing,
        p_status: 'active',
        p_user_id: user.id
      });

      if (planError) throw planError;

      let snapshotApplied = false;
      const { data: snapshotData, error: snapshotError } = await (supabase as any).rpc('get_billing_snapshot', {
        p_user_id: user.id
      });

      if (!snapshotError) {
        const snapshot = (Array.isArray(snapshotData) ? snapshotData[0] : null) as BillingSnapshot | null;
        if (snapshot) {
          const planId = parsePlanId(snapshot.plan_id) ?? planToApply.id;
          const nextBilling = mapTenureToInternal(snapshot.billing_cycle || billing);
          const status = String(snapshot.subscription_status || '').toLowerCase();
          const expired = !['active', 'trialing'].includes(status);
          const planName = snapshot.plan_name || sortedPlans.find((p) => p.id === planId)?.name || planToApply.name;

          setBillingSnapshot(snapshot);
          setCurrentPlanName(planName);
          setIsPlanExpired(expired);
          setUserPlanId(planId);
          setUserBillingCycle(nextBilling);
          setBilling(nextBilling);
          setSelectedBillingCycle(nextBilling);
          setSelectedPlans((prev) => ({ ...prev, [nextBilling]: planId }));
          setUserPlanRank(sortedPlans.find((p) => p.id === planId)?.rank);
          snapshotApplied = true;
        }
      }

      if (!snapshotApplied) {
        setBillingSnapshot(null);
        setCurrentPlanName(planToApply.name);
        setIsPlanExpired(false);
        setUserPlanId(planToApply.id);
        setUserBillingCycle(billing);
        setBilling(billing);
        setSelectedBillingCycle(billing);
        setSelectedPlans((prev) => ({ ...prev, [billing]: planToApply.id }));
        setUserPlanRank(planToApply.rank);
      }

      startResultModal('Successful', planToApply, methodLabel);
      toast({
        title: 'Plan updated',
        description: `${planToApply.name} selected successfully.`
      });
      setPendingPlan(null);
    } catch (error: any) {
      console.error('Plan update failed:', error);
      startResultModal('Failed', planToApply, methodLabel);
      toast({
        title: 'Plan update failed',
        description: error?.message || 'Unable to update plan right now.',
        variant: 'destructive'
      });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const getDialogDescription = (plan?: Plan) => {
    if (!plan || userPlanRank === undefined || plan.rank === undefined) {
      return 'You already have an active plan. Replacing it will apply immediately.';
    }
    const changeType = getPlanChangeType(userPlanRank, plan.rank);
    if (changeType === 'upgrade') {
      return 'Upgrading will increase limits immediately and carry over remaining credits pro-rated.';
    }
    if (changeType === 'downgrade') {
      return 'Downgrading will reduce limits, but remaining credits will carry forward.';
    }
    return 'You already have an active plan at the same level.';
  };

  const handleBillingChange = (value: string) => {
    const next = (value === 'monthly' ? 'monthly' : 'annual') as BillingCycle;
    setBilling(next);
    setSelectedBillingCycle(next);
    setTimeout(recalcBounds, 120);
  };

  const deriveContactSalesDefaults = (): ContactSalesForm => {
    const metadata =
      user?.user_metadata && typeof user.user_metadata === 'object'
        ? (user.user_metadata as Record<string, unknown>)
        : {};

    const firstName = typeof metadata.first_name === 'string' ? metadata.first_name : '';
    const lastName = typeof metadata.last_name === 'string' ? metadata.last_name : '';
    const fullName = `${firstName} ${lastName}`.trim();
    const company =
      typeof metadata.company === 'string'
        ? metadata.company
        : typeof metadata.company_name === 'string'
        ? metadata.company_name
        : '';
    const role =
      typeof metadata.role === 'string'
        ? metadata.role
        : typeof metadata.job_title === 'string'
        ? metadata.job_title
        : '';

    return {
      fullName,
      email: user?.email || '',
      company,
      role,
      teamSize: '',
      crm: '',
      message: `We are evaluating the Enterprise plan with ${billing} billing and need custom pricing details.`,
      website: '',
    };
  };

  const openContactSalesDialog = () => {
    setContactSalesStatus('idle');
    setContactSalesError('');
    setContactSalesForm(deriveContactSalesDefaults());
    setContactSalesOpen(true);
  };

  const handleContactSalesOpenChange = (open: boolean) => {
    setContactSalesOpen(open);
    if (!open) {
      setContactSalesStatus('idle');
      setContactSalesError('');
      setContactSalesSubmitting(false);
      setContactSalesForm(deriveContactSalesDefaults());
    }
  };

  const handleContactSalesChange =
    (field: keyof ContactSalesForm) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (contactSalesStatus !== 'idle') {
        setContactSalesStatus('idle');
        setContactSalesError('');
      }
      setContactSalesForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleContactSalesSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContactSalesError('');

    if (contactSalesForm.website) {
      setContactSalesStatus('success');
      return;
    }

    const fullName = contactSalesForm.fullName.trim();
    const email = contactSalesForm.email.trim();
    const company = contactSalesForm.company.trim();

    if (!fullName || !email || !company || !contactSalesForm.teamSize.trim()) {
      setContactSalesStatus('error');
      setContactSalesError('Please complete all required fields.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setContactSalesStatus('error');
      setContactSalesError('Enter a valid work email address.');
      return;
    }

    setContactSalesSubmitting(true);

    try {
      const { error } = await supabase.functions.invoke('book-demo', {
        body: {
          fullName,
          email,
          company,
          role: contactSalesForm.role.trim(),
          teamSize: contactSalesForm.teamSize.trim(),
          crm: contactSalesForm.crm.trim(),
          message: contactSalesForm.message.trim(),
          website: contactSalesForm.website,
          source: 'subscription_enterprise',
          requestedPlan: 'enterprise',
          requestedBillingCycle: billing,
          currentPlanId: userPlanId,
          currentPlanName,
          userId: user?.id || null,
        },
      });

      if (error) throw error;

      setContactSalesStatus('success');
      toast({
        title: 'Request sent to sales',
        description: 'Our team will contact you within 1 business day.',
      });
    } catch (error) {
      console.error('Contact sales request failed:', error);
      setContactSalesStatus('error');
      setContactSalesError(error instanceof Error ? error.message : 'Unable to send request. Please try again.');
      toast({
        title: 'Failed to send request',
        description: 'Please try again or email info@theciovision.com',
        variant: 'destructive',
      });
    } finally {
      setContactSalesSubmitting(false);
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
    <DashboardLayout
      activeTab={resolveActiveTab(location.pathname)}
      onTabChange={handleTabChange}
      user={user}
      onLogout={handleLogout}
    >
      <div
        className="space-y-8"
        ref={pageRef}
        style={{ paddingBottom: shouldShowSummaryTray ? (summaryHeight || 0) + 24 : 0 }}
      >
        <section className="relative overflow-hidden rounded-3xl border border-[var(--shell-border)] bg-gradient-to-br from-white via-slate-50/70 to-emerald-50/30 p-5 shadow-[0_24px_55px_-40px_rgba(15,23,42,0.55)] sm:p-6 lg:p-8">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-sky-200/25 blur-3xl" />

          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">Subscription</p>
                <h1 className="text-2xl font-bold text-[var(--shell-ink)] md:text-3xl" style={{ fontFamily: 'var(--shell-font-display)' }}>
                  Design your growth lane, then scale with confidence
                </h1>
                <p className="max-w-2xl text-sm text-[var(--shell-muted)] md:text-base">
                  Choose a plan by team size, campaign volume, and workflow complexity. Pricing, credits, and limits are visible before checkout.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-slate-200 bg-white text-slate-700">
                  Current: {currentPlanName}
                </Badge>
                <Badge className={`border ${snapshotStatusClass}`}>
                  Status: {snapshotStatusLabel}
                </Badge>
                <Badge className="border border-slate-200 bg-white text-slate-700">
                  Renewal: {periodEndLabel}
                </Badge>
                {annualSavings > 0 && (
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                    <BadgePercent className="mr-1 h-3.5 w-3.5" />
                    Annual savings ${annualSavings.toFixed(0)}
                  </Badge>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Tabs
                  value={billing}
                  onValueChange={handleBillingChange}
                  className="rounded-xl border border-[var(--shell-border)] bg-white p-1"
                >
                  <TabsList className="grid grid-cols-2 gap-1 bg-transparent p-0">
                    <TabsTrigger
                      value="annual"
                      className="rounded-lg px-4 data-[state=active]:bg-[var(--shell-accent)] data-[state=active]:text-white"
                    >
                      Annual (Save 20%)
                    </TabsTrigger>
                    <TabsTrigger
                      value="monthly"
                      className="rounded-lg px-4 data-[state=active]:bg-[var(--shell-accent)] data-[state=active]:text-white"
                    >
                      Monthly
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <Button
                  type="button"
                  variant="outline"
                  className="border-[var(--shell-border)] bg-white text-[var(--shell-ink)] hover:bg-slate-50"
                  onClick={handleToggleComparison}
                >
                  {showComparison ? 'Hide comparison table' : 'Compare all features'}
                  {showComparison ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Card className="rounded-2xl border border-slate-200 bg-white/95 shadow-[0_18px_42px_-32px_rgba(15,23,42,0.45)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900">Workspace usage snapshot</CardTitle>
                <p className="text-xs text-slate-500">
                  {loadingBillingSnapshot ? 'Syncing billing state...' : `Based on ${billing === 'annual' ? 'annual' : 'monthly'} cycle`}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-600">Credits remaining</span>
                    <span className="font-semibold text-slate-900">
                      {billingSnapshot ? Number(billingSnapshot.credits_remaining || 0).toLocaleString() : '--'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${creditUsagePct}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {billingSnapshot
                      ? `${Number(billingSnapshot.credits_used || 0).toLocaleString()} used of ${Number(
                          billingSnapshot.credits_in_period || 0
                        ).toLocaleString()}`
                      : 'Billing snapshot unavailable right now'}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Mailboxes</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {billingSnapshot
                        ? `${billingSnapshot.mailboxes_used ?? 0}${
                            billingSnapshot.unlimited_mailboxes ? ' / Unlimited' : ` / ${billingSnapshot.mailbox_limit ?? 0}`
                          }`
                        : '--'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Campaigns</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {billingSnapshot
                        ? `${billingSnapshot.campaigns_used ?? 0}${
                            billingSnapshot.unlimited_campaigns ? ' / Unlimited' : ` / ${billingSnapshot.campaign_limit ?? 0}`
                          }`
                        : '--'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-[var(--shell-ink)]">Choose your plan</h2>
          <p className="text-sm text-[var(--shell-muted)]">
            Select a tier to preview pricing and limits. You can compare full feature matrices below.
          </p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-4">
          {sortedPlans.map((p, idx) => (
            <PlanCard
              key={p.id}
              plan={p}
              billing={billing}
              planIndex={idx}
              selected={p.id === selectedPlan}
              onSelect={() => selectPlan(p.id, billing)}
              onContactSales={openContactSalesDialog}
              onToggleComparison={handleToggleComparison}
              comparisonOpen={showComparison}
              core={dynamicCoreRows}
              insights={dynamicInsightsRows}
              userPlanId={userPlanId}
              userBillingCycle={userBillingCycle}
              selectedBillingCycle={selectedBillingCycle}
              isPlanExpired={isPlanExpired}
            />
          ))}
        </div>

        {showComparison && (
          <div className="mt-4" id="plan-comparison">
            <div
              ref={comparisonHeadingRef}
              className="flex items-center gap-2 rounded-t-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-4 text-slate-800"
            >
              <div>
                <div className="font-semibold">Plan comparison</div>
                <div className="text-xs text-slate-600">Review every capability side-by-side before confirming a change.</div>
              </div>
            </div>
            <PlanComparisonTable
              billing={billing}
              plans={sortedPlans}
              selectedPlan={selectedPlan}
              onSelect={(id) => selectPlan(id, billing)}
              onContactSales={openContactSalesDialog}
              core={dynamicCoreRows}
              insights={dynamicInsightsRows}
              userBillingCycle={userBillingCycle}
              userPlanId={userPlanId}
              selectedBillingCycle={selectedBillingCycle}
              isPlanExpired={isPlanExpired}
            />
          </div>
        )}

        {shouldShowSummaryTray && selectedPlanObj && (
          <div
            ref={summaryRef}
            className="fixed bottom-2 z-[20] w-full"
            style={{ left: `${summaryBounds.left}px`, width: `${summaryBounds.width}px` }}
          >
            <div className="px-2">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-[0_22px_42px_-28px_rgba(15,23,42,0.6)]">
                <div className="p-3 sm:p-4">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-900">
                          {planIcon(selectedPlanObj.id)}
                          <span>{selectedPlanObj.name}</span>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            summaryStatusLabel === 'Expired'
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : summaryStatusLabel === 'Current'
                              ? 'border-sky-200 bg-sky-50 text-sky-700'
                              : 'border-emerald-200 bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {summaryStatusLabel}
                        </span>
                        {annualSavings > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <BadgePercent className="h-3.5 w-3.5" />
                            Save ${annualSavings.toFixed(0)}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Billing</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{billing === 'annual' ? 'Annual' : 'Monthly'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Credits</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {billingSnapshot ? Number(billingSnapshot.credits_remaining || 0).toLocaleString() : '--'}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Mailboxes</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {billingSnapshot
                              ? `${billingSnapshot.mailboxes_used ?? 0}${billingSnapshot.unlimited_mailboxes ? ' / Unlimited' : ` / ${billingSnapshot.mailbox_limit ?? 0}`}`
                              : '--'}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Campaigns</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {billingSnapshot
                              ? `${billingSnapshot.campaigns_used ?? 0}${billingSnapshot.unlimited_campaigns ? ' / Unlimited' : ` / ${billingSnapshot.campaign_limit ?? 0}`}`
                              : '--'}
                          </p>
                        </div>
                      </div>

                      <button
                        className="inline-flex text-sm text-slate-600 underline transition-colors hover:text-[var(--shell-accent)]"
                        onClick={() => {
                          if (!showComparison) {
                            handleToggleComparison();
                            return;
                          }
                          requestAnimationFrame(() => {
                            const el = document.getElementById('plan-comparison');
                            if (!el) return;
                            const top = el.getBoundingClientRect().top + window.scrollY - 120;
                            window.scrollTo({ top, behavior: 'smooth' });
                          });
                        }}
                      >
                        See full feature breakdown
                      </button>
                    </div>

                    <div className="flex flex-col items-stretch gap-1.5 xl:min-w-[220px] xl:items-end">
                      <Button
                        onClick={() => selectedPlanObj && handleCheckout(selectedPlanObj)}
                        disabled={
                          selectedPlanObj.id === 'free' ||
                          checkoutLoading ||
                          (userPlanId === selectedPlanObj.id && billing === userBillingCycle && !isPlanExpired)
                        }
                        className="h-11 w-full bg-[var(--shell-accent)] px-6 text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-emerald-700 hover:shadow-lg xl:w-auto xl:min-w-[220px]"
                      >
                        {checkoutLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Redirecting...
                          </>
                        ) : (
                          getUpgradeButtonText(selectedPlanObj)
                        )}
                      </Button>
                      <span className="text-center text-[10px] italic text-slate-400 xl:text-right">*Sales taxes calculated at checkout</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500 xl:justify-end">
                    <a href="/security" className="transition-colors hover:text-[var(--shell-accent)]">
                      Security
                    </a>
                    <span className="text-slate-300">•</span>
                    <a href="/about" className="transition-colors hover:text-[var(--shell-accent)]">
                      Privacy & Trust
                    </a>
                    <span className="text-slate-300">•</span>
                    <a href="/about" className="transition-colors hover:text-[var(--shell-accent)]">
                      Service Terms
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={contactSalesOpen} onOpenChange={handleContactSalesOpenChange}>
        <DialogContent className="max-w-2xl w-[95vw] overflow-hidden rounded-2xl bg-white p-0">
          <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-5">
            <DialogTitle className="text-xl font-semibold text-slate-900">Contact sales</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-slate-600">
              Tell us about your team and we will send enterprise pricing, rollout options, and implementation guidance.
            </DialogDescription>
          </div>

          <form onSubmit={handleContactSalesSubmit} className="space-y-5 px-6 py-5">
            {contactSalesStatus === 'success' ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <CircleCheckBig className="mt-0.5 h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="font-semibold text-emerald-800">Request submitted</p>
                      <p className="mt-1 text-sm text-emerald-700">
                        Your enterprise inquiry is in our queue. A solutions specialist will contact you within 1 business day.
                      </p>
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                    onClick={() => {
                      setContactSalesStatus('idle');
                      setContactSalesError('');
                      setContactSalesForm(deriveContactSalesDefaults());
                    }}
                  >
                    Send another request
                  </Button>
                  <Button type="button" className="bg-[var(--shell-accent)] text-white hover:bg-emerald-700" onClick={() => handleContactSalesOpenChange(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-sales-name">Full name *</Label>
                    <Input
                      id="contact-sales-name"
                      value={contactSalesForm.fullName}
                      onChange={handleContactSalesChange('fullName')}
                      placeholder="Jane Doe"
                      disabled={contactSalesSubmitting}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-sales-email">Work email *</Label>
                    <Input
                      id="contact-sales-email"
                      type="email"
                      value={contactSalesForm.email}
                      onChange={handleContactSalesChange('email')}
                      placeholder="jane@company.com"
                      disabled={contactSalesSubmitting}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-sales-company">Company *</Label>
                    <Input
                      id="contact-sales-company"
                      value={contactSalesForm.company}
                      onChange={handleContactSalesChange('company')}
                      placeholder="Acme Inc."
                      disabled={contactSalesSubmitting}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-sales-role">Role</Label>
                    <Input
                      id="contact-sales-role"
                      value={contactSalesForm.role}
                      onChange={handleContactSalesChange('role')}
                      placeholder="Revenue Operations Lead"
                      disabled={contactSalesSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-sales-team-size">Team size *</Label>
                    <select
                      id="contact-sales-team-size"
                      value={contactSalesForm.teamSize}
                      onChange={handleContactSalesChange('teamSize')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      disabled={contactSalesSubmitting}
                      required
                    >
                      <option value="">Select team size</option>
                      <option value="1-5">1-5</option>
                      <option value="6-20">6-20</option>
                      <option value="21-50">21-50</option>
                      <option value="51-200">51-200</option>
                      <option value="200+">200+</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-sales-crm">Primary CRM</Label>
                    <select
                      id="contact-sales-crm"
                      value={contactSalesForm.crm}
                      onChange={handleContactSalesChange('crm')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      disabled={contactSalesSubmitting}
                    >
                      <option value="">Select CRM</option>
                      <option value="HubSpot">HubSpot</option>
                      <option value="Salesforce">Salesforce</option>
                      <option value="Pipedrive">Pipedrive</option>
                      <option value="Zoho">Zoho</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-sales-message">What do you need from enterprise? *</Label>
                  <Textarea
                    id="contact-sales-message"
                    value={contactSalesForm.message}
                    onChange={handleContactSalesChange('message')}
                    placeholder="Tell us about security requirements, team rollout, custom limits, or support expectations."
                    rows={4}
                    disabled={contactSalesSubmitting}
                    required
                  />
                </div>

                <div className="hidden" aria-hidden="true">
                  <Label htmlFor="contact-sales-website">Website</Label>
                  <Input
                    id="contact-sales-website"
                    autoComplete="off"
                    tabIndex={-1}
                    value={contactSalesForm.website}
                    onChange={handleContactSalesChange('website')}
                  />
                </div>

                {contactSalesStatus === 'error' && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {contactSalesError || 'Unable to send request. Please try again.'}
                  </div>
                )}

                <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                    onClick={() => handleContactSalesOpenChange(false)}
                    disabled={contactSalesSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-[var(--shell-accent)] text-white hover:bg-emerald-700"
                    disabled={contactSalesSubmitting}
                  >
                    {contactSalesSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send request'
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="text-xl">Payment {resultStatus}</DialogTitle>
          <DialogDescription>
            {invoiceContent || 'Subscription update finished.'}
          </DialogDescription>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Current plan: <strong>{currentPlanName}</strong> | Billing: <strong>{billing}</strong>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowResult(false)} className="bg-[var(--shell-accent)] text-white hover:bg-emerald-700">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmForceOpen} onOpenChange={setConfirmForceOpen}>
        <DialogContent className="max-w-md w-[95vw] overflow-hidden rounded-2xl p-0">
          <div className="relative bg-white p-6">
            <DialogClose asChild>
              <button
                type="button"
                className="absolute right-3 top-3 inline-flex items-center justify-center rounded-md p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </DialogClose>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <DialogTitle className="text-lg font-semibold text-slate-900">Existing active subscription detected</DialogTitle>
                <DialogDescription className="mt-2 text-sm text-slate-600">
                  {getDialogDescription(pendingPlan || selectedPlanObj)}
                </DialogDescription>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                onClick={() => {
                  setConfirmForceOpen(false);
                  setPendingPlan(null);
                }}
                className="border border-slate-200 bg-white text-black"
              >
                No
              </Button>
              <Button onClick={performForceCheckout} className="bg-[var(--shell-accent)] text-white hover:bg-emerald-700">
                Yes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentMethodModal} onOpenChange={setShowPaymentMethodModal}>
        <DialogContent className="max-w-md w-[95vw] rounded-2xl bg-white p-6">
          <DialogTitle className="text-xl font-bold text-slate-900">Select Payment Method</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-slate-500">
            Choose how you would like to pay for this subscription.
          </DialogDescription>

          <div className="mt-6">
            {loadingPaymentMethods ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--shell-accent)]" />
                <span className="text-sm text-slate-500">Loading payment methods...</span>
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto pr-2">
                <RadioGroup value={selectedPaymentMethodId} onValueChange={setSelectedPaymentMethodId} className="flex flex-col gap-3">
                  {paymentMethods.map((method) => {
                    const brandDisplay = method.brand || 'Card';
                    return (
                  <Label
                    key={method.id}
                    htmlFor={method.id}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all hover:border-emerald-500/50 hover:bg-emerald-50/30 ${
                          selectedPaymentMethodId === method.id
                            ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                            : 'border-slate-200'
                        }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="rounded-lg border bg-white p-2 text-slate-600 shadow-sm">
                        <CreditCard className="h-6 w-6" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900">{String(brandDisplay).charAt(0).toUpperCase() + String(brandDisplay).slice(1)}</span>
                        <span className="text-sm text-slate-500">Ending in •••• {method.last4}</span>
                      </div>
                    </div>
                        <RadioGroupItem value={method.id} id={method.id} className="data-[state=checked]:border-emerald-500 data-[state=checked]:text-emerald-500" />
                      </Label>
                    );
                  })}

                  <Label
                    htmlFor="other-method"
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all hover:border-emerald-500/50 hover:bg-emerald-50/30 ${
                      selectedPaymentMethodId === 'other' ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="rounded-lg border bg-white p-2 text-slate-600 shadow-sm">
                        <Plus className="h-6 w-6" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900">Other Payment Method</span>
                        <span className="text-sm text-slate-500">Use a different card or payment method</span>
                      </div>
                    </div>
                    <RadioGroupItem value="other" id="other-method" className="data-[state=checked]:border-emerald-500 data-[state=checked]:text-emerald-500" />
                  </Label>
                </RadioGroup>
              </div>
            )}
          </div>

          <DialogFooter className="mt-8 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowPaymentMethodModal(false)} className="h-11 px-6">
              Cancel
            </Button>
            <Button
              onClick={handleFinalCheckout}
              className="h-11 bg-[var(--shell-accent)] px-8 text-white hover:bg-emerald-700"
              disabled={loadingPaymentMethods || checkoutLoading}
            >
              Proceed to Checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

