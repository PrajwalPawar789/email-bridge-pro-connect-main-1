
import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  Database,
  Link2,
  Lock,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Sparkles,
  ChevronRight,
  ArrowUpRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  addCrmLog,
  exchangeCrmOAuth,
  loadCrmState,
  runCrmSync,
  startCrmOAuth,
  updateIntegration,
  updateMapping,
  type CrmProvider,
  type CrmMappingRow
} from '@/lib/crmIntegrations';

const crmProviders = [
  {
    id: 'hubspot',
    name: 'HubSpot',
    accent: '#ff7a59',
    summary: 'Sync CRM contacts, lifecycle stages, and engagement activity with EmailBridge.',
    highlights: ['Contacts & Companies', 'Lists/Segments', 'Engagements & Replies'],
    sync: ['One-way CRM -> EmailBridge', 'One-way EmailBridge -> CRM', 'Two-way sync (enterprise)'],
    auth: 'OAuth 2.0 with automatic token refresh.'
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    accent: '#00a1e0',
    summary: 'Align campaigns with Salesforce Leads, Contacts, and Opportunities.',
    highlights: ['Leads & Contacts', 'Campaign Members', 'Tasks & Activities'],
    sync: ['One-way CRM -> EmailBridge', 'Engagement-only pushback', 'Two-way sync (enterprise)'],
    auth: 'OAuth 2.0 with scoped permission sets.'
  }
] as const;

const complianceItems = [
  {
    title: 'Role-based access',
    description: 'Only admins can connect CRMs; teams can use mapped fields.',
    icon: ShieldCheck
  },
  {
    title: 'Audit logs',
    description: 'Track every sync, field mapping change, and token refresh event.',
    icon: Activity
  },
  {
    title: 'Data governance',
    description: 'Workspace-level field mapping with source-of-truth controls.',
    icon: Database
  },
  {
    title: 'Secure transport',
    description: 'TLS-encrypted payloads with revocable OAuth tokens.',
    icon: Lock
  }
];

const statusStyles = {
  not_connected: 'bg-slate-100 text-slate-600 border-slate-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  connected: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  error: 'bg-rose-100 text-rose-700 border-rose-200'
} as const;

const statusLabels = {
  not_connected: 'Not connected',
  pending: 'Pending',
  connected: 'Connected',
  error: 'Action required'
} as const;

const Integrations = () => {
  const [crmState, setCrmState] = useState(loadCrmState);
  const [activeProvider, setActiveProvider] = useState<CrmProvider>('hubspot');
  const [loadingProvider, setLoadingProvider] = useState<CrmProvider | null>(null);
  const [pendingProvider, setPendingProvider] = useState<CrmProvider | null>(null);
  const [authCodes, setAuthCodes] = useState<Record<CrmProvider, string>>({
    hubspot: '',
    salesforce: ''
  });
  const [mappingDrafts, setMappingDrafts] = useState<Record<CrmProvider, CrmMappingRow[]>>({
    hubspot: crmState.integrations.hubspot.mapping,
    salesforce: crmState.integrations.salesforce.mapping
  });

  const mappingRef = useRef<HTMLDivElement | null>(null);
  const logsRef = useRef<HTMLDivElement | null>(null);

  const providers = useMemo(
    () =>
      crmProviders.map((provider) => {
        const integration = crmState.integrations[provider.id];
        return {
          ...provider,
          status: integration.status,
          accountLabel: integration.accountLabel,
          lastSyncAt: integration.lastSyncAt,
          error: integration.error
        };
      }),
    [crmState]
  );

  const logEntries = useMemo(() => {
    return crmState.logs.filter((entry) => entry.provider === activeProvider).slice(0, 8);
  }, [crmState.logs, activeProvider]);

  const updateState = (updater: (prev: typeof crmState) => typeof crmState) => {
    setCrmState((prev) => updater(prev));
  };

  const handleStartOAuth = async (provider: CrmProvider) => {
    setLoadingProvider(provider);
    try {
      const response = await startCrmOAuth(provider);
      if (response?.authUrl) {
        window.open(response.authUrl, '_blank', 'noopener,noreferrer');
      }
      if (response?.simulatedCode) {
        setAuthCodes((prev) => ({ ...prev, [provider]: response.simulatedCode || '' }));
      }
      updateState((prev) => {
        let next = updateIntegration(prev, provider, { status: 'pending', error: undefined });
        next = addCrmLog(next, {
          provider,
          status: 'info',
          message: 'OAuth flow started.',
          details: response?.mode === 'simulate' ? 'Simulation mode active.' : undefined
        });
        return next;
      });
      setPendingProvider(provider);
      toast({
        title: 'OAuth started',
        description: 'Finish authorization in the new window, then paste the code.'
      });
    } catch (error) {
      updateState((prev) =>
        addCrmLog(prev, {
          provider,
          status: 'error',
          message: 'OAuth start failed.',
          details: error instanceof Error ? error.message : undefined
        })
      );
      updateState((prev) =>
        updateIntegration(prev, provider, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unable to start OAuth'
        })
      );
      toast({
        title: 'OAuth failed',
        description: error instanceof Error ? error.message : 'Unable to start OAuth',
        variant: 'destructive'
      });
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleExchange = async (provider: CrmProvider) => {
    const code = authCodes[provider];
    if (!code) {
      toast({
        title: 'Authorization code required',
        description: 'Paste the OAuth code from the CRM redirect URL.',
        variant: 'destructive'
      });
      return;
    }
    setLoadingProvider(provider);
    try {
      const response = await exchangeCrmOAuth(provider, code);
      updateState((prev) => {
        let next = updateIntegration(prev, provider, {
          status: 'connected',
          accountLabel: response.accountLabel || 'Primary workspace',
          connectedAt: new Date().toISOString(),
          error: undefined
        });
        next = addCrmLog(next, {
          provider,
          status: 'success',
          message: 'CRM connected successfully.',
          details: response.accountLabel
        });
        return next;
      });
      setPendingProvider(null);
      toast({
        title: 'CRM connected',
        description: `Connection to ${provider} is active.`
      });
    } catch (error) {
      updateState((prev) =>
        addCrmLog(prev, {
          provider,
          status: 'error',
          message: 'OAuth exchange failed.',
          details: error instanceof Error ? error.message : undefined
        })
      );
      updateState((prev) =>
        updateIntegration(prev, provider, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unable to exchange OAuth code'
        })
      );
      toast({
        title: 'OAuth exchange failed',
        description: error instanceof Error ? error.message : 'Unable to exchange OAuth code',
        variant: 'destructive'
      });
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleSyncNow = async (provider: CrmProvider) => {
    setLoadingProvider(provider);
    try {
      const result = await runCrmSync(provider);
      updateState((prev) => {
        let next = updateIntegration(prev, provider, {
          lastSyncAt: new Date().toISOString()
        });
        next = addCrmLog(next, {
          provider,
          status: 'success',
          message: `Sync completed (${result.synced} records synced).`,
          details: result.warnings ? `${result.warnings} warnings` : undefined
        });
        return next;
      });
      toast({
        title: 'Sync complete',
        description: `${result.synced} records synced, ${result.updated} updated.`
      });
    } catch (error) {
      updateState((prev) =>
        addCrmLog(prev, {
          provider,
          status: 'error',
          message: 'Sync failed.',
          details: error instanceof Error ? error.message : undefined
        })
      );
      toast({
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Unable to run sync',
        variant: 'destructive'
      });
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleMappingChange = (provider: CrmProvider, rowId: string, value: string) => {
    setMappingDrafts((prev) => ({
      ...prev,
      [provider]: prev[provider].map((row) => (row.id === rowId ? { ...row, target: value } : row))
    }));
  };

  const handleSaveMapping = (provider: CrmProvider) => {
    updateState((prev) => {
      let next = updateMapping(prev, provider, mappingDrafts[provider]);
      next = addCrmLog(next, {
        provider,
        status: 'info',
        message: 'Field mapping updated.'
      });
      return next;
    });
    toast({
      title: 'Mapping saved',
      description: `Field mapping for ${provider} has been updated.`
    });
  };

  const handleConfigureMapping = (provider: CrmProvider) => {
    setActiveProvider(provider);
    mappingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleViewLogs = (provider: CrmProvider) => {
    setActiveProvider(provider);
    logsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute -right-40 -top-40 h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl"></div>
        <div className="pointer-events-none absolute -bottom-24 left-12 h-64 w-64 rounded-full bg-amber-200/40 blur-3xl"></div>
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--shell-muted)]">
              System - Integrations
            </p>
            <h1
              className="mt-2 text-3xl font-semibold text-[var(--shell-ink)] md:text-4xl"
              style={{ fontFamily: 'var(--shell-font-display)' }}
            >
              CRM integrations designed for enterprise workflows
            </h1>
            <p className="mt-3 text-sm text-[var(--shell-muted)]">
              Connect HubSpot or Salesforce once, then keep contacts, engagement, and revenue signals in sync across
              EmailBridge. Reduce list duplication and bring CRM segmentation into campaigns with a single source of
              truth.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                99.95% sync uptime
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                SOC 2 ready
              </div>
              <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                2 min setup
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700">
                Request custom CRM
              </Button>
              <Button variant="outline" className="rounded-full border-[var(--shell-border)] bg-white/70">
                View sync documentation
              </Button>
            </div>
          </div>

          <div className="w-full max-w-md">
            <div className="rounded-3xl border border-[var(--shell-border)] bg-white/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Integration health</p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--shell-ink)]">Launch checklist</h3>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                {[
                  'Connect CRM with OAuth',
                  'Map fields to CRM properties',
                  'Start first sync and validate'
                ].map((item, index) => (
                  <div key={item} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700">
                      {index + 1}
                    </span>
                    <span className="flex-1">{item}</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-xs text-slate-500">Latest sync</div>
                <div className="mt-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                  <span>
                    {crmState.integrations[activeProvider].lastSyncAt
                      ? new Date(crmState.integrations[activeProvider].lastSyncAt as string).toLocaleString()
                      : 'Not yet synced'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <ArrowUpRight className="h-4 w-4" />
                    Healthy
                  </span>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <Button
                  className="flex-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => handleSyncNow(activeProvider)}
                  disabled={crmState.integrations[activeProvider].status !== 'connected' || loadingProvider === activeProvider}
                >
                  Run sync now
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full border-[var(--shell-border)] bg-white/70"
                  onClick={() => handleConfigureMapping(activeProvider)}
                >
                  Review mapping
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[var(--shell-ink)]">CRM connections</h2>
            <p className="text-sm text-[var(--shell-muted)]">
              Authenticate once, then map fields and select sync direction per workspace.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700 md:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Enterprise-ready
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="relative overflow-hidden rounded-3xl border border-[var(--shell-border)] bg-white/85 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
            >
              <div className="absolute -right-16 -top-20 h-40 w-40 rounded-full opacity-20" style={{ background: provider.accent }}></div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-[0_8px_20px_rgba(15,23,42,0.16)]"
                    style={{ background: provider.accent }}
                  >
                    <PlugZap className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--shell-ink)]">{provider.name}</h3>
                    <p className="text-xs text-[var(--shell-muted)]">{provider.summary}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "whitespace-nowrap rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
                    statusStyles[provider.status]
                  )}
                >
                  {statusLabels[provider.status]}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600">
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold">
                  {provider.accountLabel ? `Account: ${provider.accountLabel}` : 'Account: Not set'}
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold">
                  {provider.lastSyncAt ? `Last sync: ${new Date(provider.lastSyncAt).toLocaleString()}` : 'Last sync: -'}
                </div>
              </div>

              {provider.error && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <AlertTriangle className="h-4 w-4" />
                  {provider.error}
                </div>
              )}

              <div className="mt-6 grid gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Data coverage</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {provider.highlights.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Sync strategy</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {provider.sync.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 text-emerald-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Link2 className="h-4 w-4 text-slate-400" />
                  {provider.auth}
                </div>
              </div>

              {pendingProvider === provider.id && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Complete OAuth</p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                      placeholder="Paste authorization code"
                      value={authCodes[provider.id]}
                      onChange={(event) =>
                        setAuthCodes((prev) => ({ ...prev, [provider.id]: event.target.value }))
                      }
                      className="h-10 rounded-full border-amber-200 bg-white/90 text-sm"
                    />
                    <Button
                      onClick={() => handleExchange(provider.id)}
                      className="rounded-full bg-amber-600 text-white hover:bg-amber-700"
                      disabled={loadingProvider === provider.id}
                    >
                      Complete connection
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => handleStartOAuth(provider.id)}
                  disabled={loadingProvider === provider.id}
                >
                  {provider.status === 'connected' ? `Reconnect ${provider.name}` : `Connect ${provider.name}`}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full border-[var(--shell-border)] bg-white/70"
                  onClick={() => handleConfigureMapping(provider.id)}
                >
                  Configure mapping
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-full text-slate-500 hover:text-slate-700"
                  onClick={() => handleViewLogs(provider.id)}
                >
                  View sync logs
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  onClick={() => handleSyncNow(provider.id)}
                  disabled={provider.status !== 'connected' || loadingProvider === provider.id}
                >
                  Sync now
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/80 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[var(--shell-ink)]">Field mapping</h3>
                <p className="text-sm text-[var(--shell-muted)]">
                  Map EmailBridge fields to CRM properties without forcing a 1:1 schema.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {crmProviders.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => setActiveProvider(provider.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                    activeProvider === provider.id
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-500'
                  )}
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          <div ref={mappingRef} className="mt-5 space-y-3">
            {mappingDrafts[activeProvider].map((row) => (
              <div
                key={row.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3 md:grid-cols-[1fr_1fr]"
              >
                <div className="text-sm font-semibold text-slate-700">{row.source}</div>
                <Input
                  value={row.target}
                  onChange={(event) => handleMappingChange(activeProvider, row.id, event.target.value)}
                  className="h-9 rounded-full border-slate-200 text-sm"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => handleSaveMapping(activeProvider)}
            >
              Save mapping
            </Button>
            <span className="text-xs text-[var(--shell-muted)]">
              Choose a source-of-truth per field and decide whether EmailBridge can create new leads on reply.
            </span>
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--shell-border)] bg-white/80 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--shell-ink)]">Enterprise safeguards</h3>
              <p className="text-sm text-[var(--shell-muted)]">Security, auditability, and governance baked in.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {complianceItems.map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3">
                <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/85 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--shell-muted)]">CRM in action</p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--shell-ink)]">Your workflow, with CRM signals</h3>
            <p className="text-sm text-[var(--shell-muted)]">
              These screens show how CRM data lives inside EmailBridge after integration.
            </p>
          </div>
          <Button variant="outline" className="rounded-full border-[var(--shell-border)] bg-white/70">
            View product tour
          </Button>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {[
            {
              title: 'CRM-synced contacts',
              description: 'Bring HubSpot lists into outbound sequences without CSV imports.',
              image: '/platform/prospect list.png'
            },
            {
              title: 'Replies logged to CRM',
              description: 'Sales sees replies and tasks directly on CRM records.',
              image: '/platform/inbox.png'
            },
            {
              title: 'Pipeline outcomes',
              description: 'Track revenue impact and influence from every campaign.',
              image: '/platform/analytics dashboard.png'
            }
          ].map((item) => (
            <div key={item.title} className="rounded-3xl border border-slate-200 bg-white/80 p-4">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                <img src={item.image} alt={item.title} className="h-40 w-full object-cover" />
              </div>
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                <p className="text-xs text-slate-500">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section ref={logsRef} className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/85 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--shell-ink)]">Sync log</h3>
            <p className="text-sm text-[var(--shell-muted)]">
              Latest events for {crmProviders.find((provider) => provider.id === activeProvider)?.name}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {crmProviders.map((provider) => (
              <button
                key={provider.id}
                onClick={() => setActiveProvider(provider.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                  activeProvider === provider.id
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-500'
                )}
              >
                {provider.name}
              </button>
            ))}
            <Button
              variant="outline"
              className="rounded-full border-[var(--shell-border)] bg-white/70"
              onClick={() => handleSyncNow(activeProvider)}
              disabled={crmState.integrations[activeProvider].status !== 'connected' || loadingProvider === activeProvider}
            >
              Run sync now
            </Button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {logEntries.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-500">
              No sync activity yet. Run a sync or connect a CRM to see logs.
            </div>
          )}
          {logEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{entry.message}</p>
                  {entry.details && <p className="text-xs text-slate-500">{entry.details}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]",
                    entry.status === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                      : entry.status === 'error'
                      ? 'border-rose-200 bg-rose-50 text-rose-600'
                      : entry.status === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-600'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  )}
                >
                  {entry.status}
                </span>
                {new Date(entry.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Integrations;
