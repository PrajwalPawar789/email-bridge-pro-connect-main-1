import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  let priceSuffix = '';

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
  onToggleComparison,
  comparisonOpen,
  core,
  insights,
  userPlanId,
  userBillingCycle,
  selectedBillingCycle,
  isPlanExpired
}: PlanCardProps) => {
  const navigate = useNavigate();
  const includedCore = core
    .map((r) => ({ label: r.label, v: r.values[planIndex] }))
    .filter((r) => r.v !== false && r.v !== '-');
  const includedInsights = insights
    .map((r) => ({ label: r.label, v: r.values[planIndex] }))
    .filter((r) => r.v !== false && r.v !== '-');

  const isCurrent = userPlanId === plan.id && billing === userBillingCycle;
  const isSelectedUI = selected && selectedBillingCycle === billing;
  const isDisabled = plan.id === 'free' || plan.id === 'enterprise' || (isCurrent && !isPlanExpired);

  const buttonText = isCurrent
    ? isPlanExpired
      ? 'Renew Plan'
      : 'Current Plan'
    : isSelectedUI
    ? 'Selected'
    : 'Select Plan';

  return (
    <Card
      className={`relative flex h-full flex-col ${
        plan.id === 'free' || plan.id === 'enterprise' ? 'cursor-default' : 'cursor-pointer'
      } ${isSelectedUI ? 'ring-2 ring-emerald-300 bg-emerald-50/60' : ''}`}
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
      <CardHeader className="!p-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {planIcon(plan.id)}
              <CardTitle className="text-base font-semibold md:text-xl">{plan.name}</CardTitle>
            </div>
          </div>
          {isCurrent && isPlanExpired ? (
            <Badge className="mb-1 bg-rose-500 text-white hover:bg-rose-600">EXPIRED</Badge>
          ) : plan.popular ? (
            <Badge className="mb-1 bg-[var(--shell-accent)] text-white hover:bg-[var(--shell-accent)]">MOST POPULAR</Badge>
          ) : null}
        </div>

        <div className="mt-2 space-y-2">
          {plan.description && <div className="text-sm text-slate-600">{plan.description}</div>}
          {(() => {
            const d = planDisplay(plan, billing);
            return (
              <>
                <div className="text-3xl font-bold">
                  {d.priceLabel}
                  {d.priceSuffix && <span className="text-sm text-slate-500">{d.priceSuffix}</span>}
                </div>
                <div className="text-slate-500" style={{ visibility: plan.id === 'enterprise' ? 'hidden' : undefined }}>
                  {d.billedNote}
                </div>
              </>
            );
          })()}
        </div>
      </CardHeader>

      <CardContent className="!p-3 flex flex-1 flex-col space-y-5">
        <div className="border-y border-slate-200 py-3">
          <div className="flex items-center text-[17px] font-semibold text-black">
            <Coins className="h-5 w-5 text-[var(--shell-warm)]" />
            <span className="ml-2">{planDisplay(plan, billing).credits}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 pt-3">
          {plan.id === 'enterprise' ? (
            <Button
              className="w-full bg-[var(--shell-ink)] text-white hover:bg-slate-800"
              onClick={() => navigate('/subscription')}
            >
              Contact our sales
            </Button>
          ) : (
            <Button
              onClick={onSelect}
              disabled={isDisabled}
              className={`w-full ${
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

        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outbound Execution Capabilities</div>
          <ul className="space-y-2">
            {includedCore.map((item) => (
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

        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue Intelligence Layer</div>
          <ul className="space-y-2">
            {includedInsights.map((item) => (
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
      </CardContent>

      <button
        type="button"
        onClick={onToggleComparison}
        aria-expanded={comparisonOpen}
        className="my-4 inline-flex w-full items-center justify-center text-sm font-semibold text-[var(--shell-accent)] underline"
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
  core,
  insights,
  userBillingCycle,
  userPlanId,
  selectedBillingCycle,
  isPlanExpired
}: PlanComparisonTableProps) => {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-[720px] w-full text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className="p-3 text-left font-semibold text-slate-700">Feature</th>
            {plans.map((p) => {
              const d = planDisplay(p, billing);
              const isSelected = p.id === selectedPlan && billing === selectedBillingCycle;
              const isCurrent = userPlanId === p.id && billing === userBillingCycle;
              const isDisabled = p.id === 'free' || p.id === 'enterprise' || (isCurrent && !isPlanExpired);

              return (
                <th
                  key={p.id}
                  className={`p-3 text-left align-bottom font-semibold text-slate-800 ${
                    isSelected ? 'bg-emerald-50 border-b-2 border-emerald-300' : ''
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
                          onClick={() => navigate('/subscription')}
                        >
                          Contact our sales
                        </Button>
                      ) : (
                        <Button
                          onClick={() => onSelect(p.id)}
                          disabled={isDisabled}
                          className={`w-full ${
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
              className="bg-white p-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500"
              style={{ border: '1px solid #e7e8e9' }}
            >
              Outbound Execution Capabilities
            </td>
          </tr>
          {core.map((row, i) => (
            <tr key={`core-${i}`} className="border-t border-slate-200">
              <td className="p-3 font-medium text-slate-800">{row.label}</td>
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
              className="bg-white p-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500"
              style={{ border: '1px solid #e7e8e9' }}
            >
              Revenue Intelligence Layer
            </td>
          </tr>
          {insights.map((row, i) => (
            <tr key={`insights-${i}`} className="border-t border-slate-200">
              <td className="p-3 font-medium text-slate-800">{row.label}</td>
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
  const [paymentMethods, setPaymentMethods] = useState<any[]>([
    { id: 'pm_demo_1', card_brand: 'visa', last4: '4242' },
    { id: 'pm_demo_2', card_brand: 'mastercard', last4: '1887' }
  ]);

  const sortedPlans = useMemo(() => plansState, [plansState]);
  const selectedPlanObj = useMemo(() => sortedPlans.find((p) => p.id === selectedPlan), [sortedPlans, selectedPlan]);

  const dynamicCoreRows = useMemo(() => coreRows, []);
  const dynamicInsightsRows = useMemo(() => insightsRows, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const metadata = (user.user_metadata as any) || {};
    const packageName = metadata.plan_name || metadata.package_name || 'Starter Trial';
    const tenure = mapTenureToInternal(metadata.tenure || metadata.plan_tenure || 'annual');
    const expired = Boolean(metadata.is_subscription_expired || metadata.plan_expired || false);
    const mappedId = mapUserPackageNameToPlanId(packageName);

    setCurrentPlanName(packageName);
    setIsPlanExpired(expired);
    setUserBillingCycle(tenure);
    setBilling(tenure);
    setSelectedBillingCycle(tenure);

    if (mappedId) {
      setUserPlanId(mappedId);
      setSelectedPlans((prev) => ({ ...prev, [tenure]: mappedId }));
      setUserPlanRank(sortedPlans.find((p) => p.id === mappedId)?.rank);
    }
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
    const measure = () => setSummaryHeight(el ? el.offsetHeight : 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [selectedPlan, billing, showComparison, checkoutLoading]);

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
    if (plan.id === 'free' || plan.id === 'enterprise') return;
    if (userPlanId === plan.id && billing === userBillingCycle && !isPlanExpired) return;

    if (userPlanId && userPlanId !== plan.id && !isPlanExpired) {
      setPendingPlan(plan);
      setConfirmForceOpen(true);
      return;
    }

    setPendingPlan(plan);
    setShowPaymentMethodModal(true);
  };

  const performForceCheckout = async () => {
    setConfirmForceOpen(false);
    setLoadingPaymentMethods(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setLoadingPaymentMethods(false);
    setShowPaymentMethodModal(true);
  };

  const handleFinalCheckout = async () => {
    if (!pendingPlan) return;

    setShowPaymentMethodModal(false);
    setCheckoutLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 900));

    const method = paymentMethods.find((m) => m.id === selectedPaymentMethodId);
    const methodLabel = method
      ? `${String(method.card_brand).toUpperCase()} ****${method.last4}`
      : 'new payment method';

    setCheckoutLoading(false);
    startResultModal('Successful', pendingPlan, methodLabel);

    setUserPlanId(pendingPlan.id);
    setUserPlanRank(pendingPlan.rank);
    setUserBillingCycle(billing);
    setCurrentPlanName(pendingPlan.name);
    setSelectedPlans((prev) => ({ ...prev, [billing]: pendingPlan.id }));
    setPendingPlan(null);

    toast({
      title: 'Plan updated',
      description: `${pendingPlan.name} selected successfully.`
    });
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
      <div className="space-y-8" ref={pageRef} style={{ paddingBottom: (summaryHeight || 0) + 24 }}>
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-2xl font-bold text-[var(--shell-ink)] md:text-3xl" style={{ fontFamily: 'var(--shell-font-display)' }}>
            Choose a plan that matches your outbound operating model
          </h1>
          <p className="max-w-3xl text-[var(--shell-muted)]">
            Built for campaigns, inboxes, automations, and pipeline attribution. Pick by team scale and inbox volume,
            then expand with governance and integrations as you grow.
          </p>
          <div className="flex items-center gap-3">
            <Tabs
              value={billing}
              onValueChange={handleBillingChange}
              className="rounded-lg border border-[var(--shell-border)] bg-white p-1"
            >
              <TabsList className="grid grid-cols-2">
                <TabsTrigger
                  value="annual"
                  className="data-[state=active]:bg-[var(--shell-accent)] data-[state=active]:text-white"
                >
                  Annual (Save 20%)
                </TabsTrigger>
                <TabsTrigger
                  value="monthly"
                  className="data-[state=active]:bg-[var(--shell-accent)] data-[state=active]:text-white"
                >
                  Monthly
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 lg:grid-cols-4">
          {sortedPlans.map((p, idx) => (
            <PlanCard
              key={p.id}
              plan={p}
              billing={billing}
              planIndex={idx}
              selected={p.id === selectedPlan}
              onSelect={() => selectPlan(p.id, billing)}
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
          <div className="mt-6" id="plan-comparison">
            <div
              ref={comparisonHeadingRef}
              className="flex items-center gap-2 rounded-t-lg border bg-white px-4 py-3 text-slate-800"
            >
              <div>
                <div className="font-semibold">Plan comparison</div>
                <div className="text-xs text-slate-600">Find the features available in each plan</div>
              </div>
            </div>
            <PlanComparisonTable
              billing={billing}
              plans={sortedPlans}
              selectedPlan={selectedPlan}
              onSelect={(id) => selectPlan(id, billing)}
              core={dynamicCoreRows}
              insights={dynamicInsightsRows}
              userBillingCycle={userBillingCycle}
              userPlanId={userPlanId}
              selectedBillingCycle={selectedBillingCycle}
              isPlanExpired={isPlanExpired}
            />
          </div>
        )}

        {selectedPlanObj && !showResult && !confirmForceOpen && (
          <div
            ref={summaryRef}
            className="fixed bottom-0 z-[10] w-full rounded-t-lg border-t border-slate-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
            style={{ left: `${summaryBounds.left}px`, width: `${summaryBounds.width}px` }}
          >
            <div className="px-6 py-4">
              <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
                <div className="flex flex-col gap-1 text-center md:text-left">
                  <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Summary</div>
                  <div className="flex items-center justify-center gap-3 md:justify-start">
                    <div className="flex items-center gap-2 text-xl font-bold text-slate-900">
                      {planIcon(selectedPlanObj.id)}
                      <span>{selectedPlanObj.name}</span>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      {userPlanId === selectedPlan && billing === userBillingCycle ? (isPlanExpired ? 'Expired' : 'Current') : 'Selected'}
                    </span>
                  </div>
                  <button
                    className="mt-1 flex text-sm text-slate-600 underline transition-colors hover:text-[var(--shell-accent)]"
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
                    See price breakdown
                  </button>
                </div>

                <div className="flex w-full flex-col items-center gap-3 md:w-auto md:items-end">
                  <div className="flex flex-wrap items-center justify-center gap-6 md:justify-end md:gap-8">
                    <div className="text-center md:text-right">
                      <div className="mb-0.5 text-sm text-slate-500">Billed {billing === 'annual' ? 'Annually' : 'Monthly'}</div>
                      <div className="text-lg font-bold leading-tight text-slate-900">
                        {(() => {
                          const p = selectedPlanObj;
                          if (p.id === 'enterprise') return 'Custom';
                          const amt = billing === 'annual' ? p.priceAnnual * 12 : p.priceMonthly;
                          const suffix = billing === 'annual' ? '/yr' : '/mo';

                          if (billing === 'annual' && p.priceAnnual > 0 && p.priceAnnual < p.priceMonthly) {
                            const original = p.priceMonthly * 12;
                            const savings = original - amt;
                            return (
                              <div className="flex flex-col items-center md:items-end">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-sm font-semibold text-slate-400 line-through">${original.toFixed(0)}</span>
                                  <span>${amt.toFixed(0)}{suffix}</span>
                                </div>
                                <div className="mt-0.5 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-sm text-emerald-700">
                                  <span className="inline-flex items-center gap-1">
                                    <BadgePercent className="h-5 w-5" />
                                    You are saving <strong>${savings.toFixed(0)}</strong> by paying annually
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          return `$${amt}${suffix}`;
                        })()}
                      </div>
                    </div>

                    <div className="hidden h-10 w-px bg-slate-200 md:block"></div>

                    <div className="flex flex-col items-center">
                      <Button
                        onClick={() => selectedPlanObj && handleCheckout(selectedPlanObj)}
                        disabled={
                          selectedPlanObj.id === 'free' ||
                          checkoutLoading ||
                          (userPlanId === selectedPlanObj.id && billing === userBillingCycle && !isPlanExpired)
                        }
                        className="h-11 bg-[var(--shell-accent)] px-8 text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-emerald-700 hover:shadow-lg"
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
                      <span className="mt-1.5 text-[10px] italic text-slate-400">*Sales taxes calculated at checkout</span>
                    </div>
                  </div>

                  <div className="mt-1 flex items-center gap-4 text-[11px] text-slate-500">
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
                    const brandDisplay = method.card_brand || method.brand || method.brand_display || 'Card';
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
                            <span className="font-semibold text-slate-900">
                              {String(brandDisplay).charAt(0).toUpperCase() + String(brandDisplay).slice(1)}
                            </span>
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

