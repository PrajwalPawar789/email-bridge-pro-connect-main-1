
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Database,
  Lock,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Check,
  Clock,
  Settings,
  LogOut,
  Code2,
  Eye,
  EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { addHubSpotCredential, exchangeSalesforceOAuth } from '@/lib/crmApi';
import {
  addCrmLog,
  loadCrmState,
  runCrmSync,
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
    logo: {
      src: '/brand/hubspot.svg',
      alt: 'HubSpot logo',
      className: 'h-6'
    },
    summary: 'Sync contacts, lists, and engagement activity from HubSpot.',
    features: ['Contacts & Companies', 'Lists/Segments', 'Engagements & Activities'],
    auth: 'OAuth 2.0 with automatic token refresh.'
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    accent: '#00a1e0',
    logo: {
      src: '/brand/salesforce.svg',
      alt: 'Salesforce logo',
      className: 'h-6'
    },
    summary: 'Align leads, contacts, and opportunities with your campaigns.',
    features: ['Leads & Contacts', 'Campaign Members', 'Tasks & Activities'],
    auth: 'OAuth 2.0 with scoped permissions.'
  },
  {
    id: 'pipedrive',
    name: 'Pipedrive',
    accent: '#123f41',
    logo: {
      src: '/brand/pipedrive.svg',
      alt: 'Pipedrive logo',
      className: 'h-5'
    },
    summary: 'Pipeline and deal sync optimized for sales teams.',
    features: ['Deals & Stages', 'Leads & Persons', 'Activities'],
    comingSoon: true
  },
  {
    id: 'zoho',
    name: 'Zoho CRM',
    accent: '#e42527',
    logo: {
      src: '/brand/zoho.svg',
      alt: 'Zoho logo',
      className: 'h-5'
    },
    summary: 'Map Zoho modules into campaign automation without exports.',
    features: ['Leads & Accounts', 'Deals', 'Activities'],
    comingSoon: true
  },
  {
    id: 'microsoft-dynamics-365',
    name: 'Microsoft Dynamics 365',
    accent: '#5b2dac',
    logo: {
      src: '/brand/microsoft-dynamics-365.svg',
      alt: 'Microsoft Dynamics 365 logo',
      className: 'h-6'
    },
    summary: 'Sync accounts, opportunities, and activities from Dynamics 365.',
    features: ['Accounts & Contacts', 'Opportunities', 'Activities'],
    comingSoon: true
  }
] as const;

const statusStyles = {
  not_connected: 'bg-slate-100 text-slate-600 border-slate-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  connected: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  error: 'bg-rose-100 text-rose-700 border-rose-200'
} as const;

const statusLabels = {
  not_connected: 'Not connected',
  pending: 'Pending...',
  connected: 'Connected',
  error: 'Error'
} as const;

const statusIcons = {
  not_connected: null,
  pending: Clock,
  connected: Check,
  error: AlertTriangle
} as const;

const providerLabels: Record<CrmProvider, string> = {
  hubspot: 'HubSpot',
  salesforce: 'Salesforce'
};

interface IntegrationCardProps {
  provider: typeof crmProviders[number];
  statusKey: keyof typeof statusLabels;
  isBusy: boolean;
  accountLabel?: string;
  lastSync?: string;
  onConnect: () => void;
  onManage: () => void;
  onSync: () => void;
}

const IntegrationCard = ({
  provider,
  statusKey,
  isBusy,
  accountLabel,
  lastSync,
  onConnect,
  onManage,
  onSync
}: IntegrationCardProps) => {
  const StatusIcon = statusIcons[statusKey];
  const isConnected = statusKey === 'connected';
  const status = statusLabels[statusKey];

  return (
    <div className={cn(
      'group flex h-full flex-col overflow-hidden rounded-2xl border bg-gradient-to-br shadow-[0_16px_38px_-28px_rgba(15,23,42,0.45)] transition-all duration-300',
      provider.comingSoon
        ? 'border-slate-200 from-slate-50/70 to-slate-100/50'
        : isConnected
        ? 'border-emerald-200 from-emerald-50/50 to-white hover:border-emerald-300'
        : 'border-slate-200 from-white to-slate-50/60 hover:border-slate-300'
    )}>
      <div className="border-b border-slate-200/70 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
              <img src={provider.logo.src} alt={provider.logo.alt} className={cn('w-auto', provider.logo.className)} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-slate-900">{provider.name}</h3>
              <p className="mt-0.5 text-sm text-slate-500">{provider.summary}</p>
            </div>
          </div>
          <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', statusStyles[statusKey])}>
            {StatusIcon && <StatusIcon className="h-3.5 w-3.5" />}
            {status}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 py-4">
        <div className="space-y-3 text-sm">
          {accountLabel && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Connected account</p>
              <p className="mt-1 truncate text-sm font-medium text-emerald-900">{accountLabel}</p>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Supported objects</p>
            <ul className="space-y-1.5">
              {provider.features?.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {isConnected && lastSync && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs">Last sync {new Date(lastSync).toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-slate-200/70 pt-4">
          {provider.comingSoon ? (
            <Button disabled className="w-full border-slate-200 bg-white text-slate-500" variant="outline">
              Coming soon
            </Button>
          ) : isConnected ? (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={onManage} variant="outline" className="text-xs">
                <Settings className="mr-1.5 h-3.5 w-3.5" />
                Manage
              </Button>
              <Button onClick={onSync} variant="outline" disabled={isBusy} className="text-xs">
                <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isBusy && 'animate-spin')} />
                {isBusy ? 'Syncing...' : 'Sync now'}
              </Button>
            </div>
          ) : (
            <Button onClick={onConnect} disabled={isBusy} className="w-full bg-[var(--shell-accent)] text-white hover:bg-emerald-700 text-xs">
              {isBusy ? 'Connecting...' : 'Connect integration'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const Integrations = () => {
  const [crmState, setCrmState] = useState(loadCrmState);
  const [activeProvider, setActiveProvider] = useState<CrmProvider>('hubspot');
  const [loadingProvider, setLoadingProvider] = useState<CrmProvider | null>(null);
  const managementPanelRef = useRef<HTMLDivElement | null>(null);
  const [mappingDrafts, setMappingDrafts] = useState<Record<CrmProvider, CrmMappingRow[]>>({
    hubspot: crmState.integrations.hubspot.mapping,
    salesforce: crmState.integrations.salesforce.mapping
  });
  const [hubspotDialogOpen, setHubspotDialogOpen] = useState(false);
  const [salesforceDialogOpen, setSalesforceDialogOpen] = useState(false);
  const [hsDisplayName, setHsDisplayName] = useState('');
  const [hsToken, setHsToken] = useState('');
  const [hsOwnerId, setHsOwnerId] = useState('');
  const [showHsToken, setShowHsToken] = useState(false);
  const [hsSaving, setHsSaving] = useState(false);
  const [sfDisplayName, setSfDisplayName] = useState('');
  const [sfClientId, setSfClientId] = useState('');
  const [sfClientSecret, setSfClientSecret] = useState('');
  const [sfRedirectUri, setSfRedirectUri] = useState('');
  const [sfAuthCode, setSfAuthCode] = useState('');
  const [sfShowLogin, setSfShowLogin] = useState(false);
  const [sfSaving, setSfSaving] = useState(false);

  const updateState = (updater: (prev: typeof crmState) => typeof crmState) => {
    setCrmState((prev) => updater(prev));
  };

  useEffect(() => {
    setMappingDrafts({
      hubspot: crmState.integrations.hubspot.mapping,
      salesforce: crmState.integrations.salesforce.mapping
    });
  }, [crmState.integrations.hubspot.mapping, crmState.integrations.salesforce.mapping]);

  const providers = useMemo(
    () =>
      crmProviders
        .filter(p => !p.comingSoon)
        .map((provider) => {
          const integration = crmState.integrations[provider.id as CrmProvider];
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

  const comingSoonProviders = useMemo(
    () => crmProviders.filter(p => p.comingSoon),
    []
  );
  const activeIntegration = crmState.integrations[activeProvider];
  const activeProviderMeta = crmProviders.find((provider) => provider.id === activeProvider);
  const recentProviderLogs = useMemo(
    () => crmState.logs.filter((entry) => entry.provider === activeProvider).slice(0, 6),
    [crmState.logs, activeProvider]
  );
  const connectedCount = providers.filter((provider) => provider.status === 'connected').length;
  const pendingCount = providers.filter((provider) => provider.status === 'pending').length;
  const errorCount = providers.filter((provider) => provider.status === 'error').length;
  const notConnectedCount = providers.filter((provider) => provider.status === 'not_connected').length;

  const handleHubSpotConnect = async () => {
    if (!hsDisplayName.trim() || !hsToken.trim() || !hsOwnerId.trim()) {
      toast({
        title: 'Missing details',
        description: 'Please fill in all required fields to continue.',
        variant: 'destructive'
      });
      return;
    }
    setHsSaving(true);
    updateState((prev) => updateIntegration(prev, 'hubspot', { status: 'pending', error: undefined }));
    try {
      const response = (await addHubSpotCredential({
        owner_id: hsOwnerId.trim(),
        access_token: hsToken.trim(),
        display_name: hsDisplayName.trim()
      })) as Record<string, unknown>;
      const hubSpotAccountLabel =
        typeof response.display_name === 'string' && response.display_name.trim()
          ? response.display_name
          : hsDisplayName.trim();
      updateState((prev) => {
        let next = updateIntegration(prev, 'hubspot', {
          status: 'connected',
          accountLabel: hubSpotAccountLabel,
          connectedAt: new Date().toISOString(),
          error: undefined
        });
        next = addCrmLog(next, {
          provider: 'hubspot',
          status: 'success',
          message: 'HubSpot connected successfully.'
        });
        return next;
      });
      toast({
        title: 'Connected!',
        description: 'HubSpot is now connected to your workspace.'
      });
      setHubspotDialogOpen(false);
      setHsToken('');
      setHsOwnerId('');
      setHsDisplayName('');
    } catch (error) {
      updateState((prev) =>
        addCrmLog(prev, {
          provider: 'hubspot',
          status: 'error',
          message: 'HubSpot connection failed.',
          details: error instanceof Error ? error.message : undefined
        })
      );
      updateState((prev) =>
        updateIntegration(prev, 'hubspot', {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unable to connect HubSpot'
        })
      );
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Unable to connect HubSpot',
        variant: 'destructive'
      });
    } finally {
      setHsSaving(false);
    }
  };

  const handleSalesforceStart = () => {
    if (!sfClientId.trim() || !sfRedirectUri.trim()) {
      toast({
        title: 'Missing details',
        description: 'Please provide Client ID and Redirect URI.',
        variant: 'destructive'
      });
      return;
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: sfClientId,
      redirect_uri: sfRedirectUri,
      scope: 'api refresh_token offline_access',
      prompt: 'consent'
    });
    const authUrl = `https://login.salesforce.com/services/oauth2/authorize?${params.toString()}`;
    window.open(authUrl, '_blank', 'noopener,noreferrer');
    setSfShowLogin(true);
  };

  const handleSalesforceExchange = async () => {
    if (!sfAuthCode.trim()) {
      toast({
        title: 'Missing code',
        description: 'Paste the authorization code from Salesforce.',
        variant: 'destructive'
      });
      return;
    }
    if (!sfClientId.trim() || !sfClientSecret.trim() || !sfRedirectUri.trim()) {
      toast({
        title: 'Missing credentials',
        description: 'All OAuth credentials are required.',
        variant: 'destructive'
      });
      return;
    }
    setSfSaving(true);
    updateState((prev) => updateIntegration(prev, 'salesforce', { status: 'pending', error: undefined }));
    try {
      const response = (await exchangeSalesforceOAuth({
        code: sfAuthCode.trim(),
        SF_CLIENT_ID: sfClientId.trim(),
        SF_CLIENT_SECRET: sfClientSecret.trim(),
        SF_REDIRECT_URI: sfRedirectUri.trim(),
        display_name: sfDisplayName.trim()
      })) as Record<string, unknown>;
      const salesforceAccountLabel =
        typeof response.instance_url === 'string' && response.instance_url.trim()
          ? response.instance_url
          : sfDisplayName.trim() || 'Salesforce org';
      updateState((prev) => {
        let next = updateIntegration(prev, 'salesforce', {
          status: 'connected',
          accountLabel: salesforceAccountLabel,
          connectedAt: new Date().toISOString(),
          error: undefined
        });
        next = addCrmLog(next, {
          provider: 'salesforce',
          status: 'success',
          message: 'Salesforce connected successfully.'
        });
        return next;
      });
      toast({
        title: 'Connected!',
        description: 'Salesforce is now connected to your workspace.'
      });
      setSalesforceDialogOpen(false);
      setSfShowLogin(false);
      setSfAuthCode('');
    } catch (error) {
      updateState((prev) =>
        addCrmLog(prev, {
          provider: 'salesforce',
          status: 'error',
          message: 'Salesforce connection failed.',
          details: error instanceof Error ? error.message : undefined
        })
      );
      updateState((prev) =>
        updateIntegration(prev, 'salesforce', {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unable to connect Salesforce'
        })
      );
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Unable to connect Salesforce',
        variant: 'destructive'
      });
    } finally {
      setSfSaving(false);
    }
  };

  const openConnectDialog = (provider: CrmProvider) => {
    setActiveProvider(provider);
    if (provider === 'hubspot') {
      setHubspotDialogOpen(true);
      return;
    }
    setSalesforceDialogOpen(true);
  };

  const jumpToManagement = (provider: CrmProvider) => {
    setActiveProvider(provider);
    requestAnimationFrame(() => {
      managementPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleManualSync = async (provider: CrmProvider) => {
    setLoadingProvider(provider);
    try {
      const result = await runCrmSync(provider);
      updateState((prev) => {
        let next = updateIntegration(prev, provider, {
          status: 'connected',
          lastSyncAt: new Date().toISOString(),
          error: undefined
        });
        next = addCrmLog(next, {
          provider,
          status: 'success',
          message: `Manual sync completed (${result.synced ?? 0} synced, ${result.updated ?? 0} updated).`
        });
        return next;
      });
      toast({
        title: 'Sync complete',
        description: `${providerLabels[provider]} data has been refreshed.`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to run sync';
      updateState((prev) => {
        let next = updateIntegration(prev, provider, {
          status: 'error',
          error: errorMessage
        });
        next = addCrmLog(next, {
          provider,
          status: 'error',
          message: 'Manual sync failed.',
          details: errorMessage
        });
        return next;
      });
      toast({
        title: 'Sync failed',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleDisconnect = (provider: CrmProvider) => {
    updateState((prev) => {
      let next = updateIntegration(prev, provider, {
        status: 'not_connected',
        accountLabel: undefined,
        connectedAt: undefined,
        lastSyncAt: undefined,
        error: undefined
      });
      next = addCrmLog(next, {
        provider,
        status: 'warning',
        message: `${providerLabels[provider]} disconnected.`
      });
      return next;
    });
    toast({
      title: 'Integration disconnected',
      description: `${providerLabels[provider]} has been disconnected from this workspace.`
    });
  };

  const handleMappingTargetChange = (provider: CrmProvider, rowId: string, nextTarget: string) => {
    setMappingDrafts((prev) => ({
      ...prev,
      [provider]: prev[provider].map((row) =>
        row.id === rowId
          ? {
              ...row,
              target: nextTarget
            }
          : row
      )
    }));
  };

  const handleMappingSave = (provider: CrmProvider) => {
    updateState((prev) => {
      let next = updateMapping(prev, provider, mappingDrafts[provider]);
      next = addCrmLog(next, {
        provider,
        status: 'success',
        message: 'Field mapping updated.'
      });
      return next;
    });
    toast({
      title: 'Mapping saved',
      description: `${providerLabels[provider]} field mapping has been updated.`
    });
  };

  const handleMappingReset = (provider: CrmProvider) => {
    setMappingDrafts((prev) => ({
      ...prev,
      [provider]: crmState.integrations[provider].mapping
    }));
    toast({
      title: 'Mapping reset',
      description: `Restored the saved mapping for ${providerLabels[provider]}.`
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_10%,rgba(16,185,129,0.09),transparent_36%),radial-gradient(circle_at_86%_0%,rgba(14,165,233,0.08),transparent_36%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-[0_24px_50px_-35px_rgba(15,23,42,0.55)]">
          <div className="border-b border-slate-200/80 bg-gradient-to-r from-white to-slate-50 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">CRM Integrations</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Connect your revenue stack in minutes</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
              Keep campaign execution, inbox activity, and CRM data in sync without manual exports. Manage mapping, run manual syncs, and audit integration health from one place.
            </p>
          </div>
          <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Connected</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{connectedCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Awaiting setup</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{notConnectedCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Pending</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{pendingCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Errors</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{errorCount}</p>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Available Integrations</h2>
                <p className="mt-1 text-sm text-slate-600">Choose a provider to connect, then manage mappings and sync operations.</p>
              </div>
              <div className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 sm:block">
                {providers.length + comingSoonProviders.length} providers
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {providers.map((provider) => {
                const providerId = provider.id as CrmProvider;
                return (
                  <IntegrationCard
                    key={provider.id}
                    provider={provider}
                    statusKey={provider.status}
                    isBusy={loadingProvider === providerId}
                    accountLabel={provider.accountLabel}
                    lastSync={provider.lastSyncAt}
                    onConnect={() => openConnectDialog(providerId)}
                    onManage={() => jumpToManagement(providerId)}
                    onSync={() => handleManualSync(providerId)}
                  />
                );
              })}

              {comingSoonProviders.map((provider) => (
                <IntegrationCard
                  key={provider.id}
                  provider={provider}
                  statusKey="not_connected"
                  isBusy={false}
                  onConnect={() => {}}
                  onManage={() => {}}
                  onSync={() => {}}
                />
              ))}
            </div>
          </section>

          <aside ref={managementPanelRef} className="space-y-4 xl:sticky xl:top-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_36px_-28px_rgba(15,23,42,0.45)]">
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Integration Management</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                    {activeProviderMeta ? (
                      <img src={activeProviderMeta.logo.src} alt={activeProviderMeta.logo.alt} className={cn('w-auto', activeProviderMeta.logo.className)} />
                    ) : (
                      <Database className="h-5 w-5 text-slate-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{activeProviderMeta?.name || 'Integration'}</h3>
                    <p className="text-xs text-slate-500">{statusLabels[activeIntegration.status]}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 px-5 py-4">
                {activeIntegration.status === 'connected' ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Account</p>
                        <p className="mt-1 truncate text-sm font-medium text-slate-900">{activeIntegration.accountLabel || '--'}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Last sync</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {activeIntegration.lastSyncAt ? new Date(activeIntegration.lastSyncAt).toLocaleString() : 'Not yet'}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleManualSync(activeProvider)}
                        disabled={loadingProvider === activeProvider}
                      >
                        <RefreshCw className={cn('mr-2 h-4 w-4', loadingProvider === activeProvider && 'animate-spin')} />
                        {loadingProvider === activeProvider ? 'Syncing...' : 'Sync now'}
                      </Button>
                      <Button
                        variant="outline"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => handleDisconnect(activeProvider)}
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Disconnect
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Field Mapping</p>
                        <Code2 className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="space-y-2">
                        {mappingDrafts[activeProvider].map((row) => (
                          <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Source</p>
                            <p className="text-xs font-medium text-slate-700">{row.source}</p>
                            <Label htmlFor={`mapping-${activeProvider}-${row.id}`} className="mt-2 block text-[10px] uppercase tracking-[0.16em] text-slate-500">
                              Target
                            </Label>
                            <Input
                              id={`mapping-${activeProvider}-${row.id}`}
                              className="mt-1 h-8 bg-white"
                              value={row.target}
                              onChange={(event) => handleMappingTargetChange(activeProvider, row.id, event.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button className="bg-[var(--shell-accent)] text-white hover:bg-emerald-700" onClick={() => handleMappingSave(activeProvider)}>
                          Save mapping
                        </Button>
                        <Button variant="outline" onClick={() => handleMappingReset(activeProvider)}>
                          Reset draft
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm">
                    <p className="font-medium text-slate-900">No active connection</p>
                    <p className="mt-1 text-slate-600">
                      Connect {activeProviderMeta?.name || 'this provider'} to manage sync frequency and customize field mapping.
                    </p>
                    <Button className="mt-3 w-full bg-[var(--shell-accent)] text-white hover:bg-emerald-700" onClick={() => openConnectDialog(activeProvider)}>
                      Connect {activeProviderMeta?.name || 'provider'}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.45)]">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recent Activity</p>
                <Activity className="h-4 w-4 text-slate-400" />
              </div>
              {recentProviderLogs.length === 0 ? (
                <p className="text-sm text-slate-500">No activity yet for {providerLabels[activeProvider]}.</p>
              ) : (
                <div className="space-y-2">
                  {recentProviderLogs.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                      <p className="text-sm font-medium text-slate-800">{entry.message}</p>
                      <p className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Security posture</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>Role-based access keeps connection management limited to admins.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-4 w-4 text-sky-600" />
                  <span>OAuth credentials are transmitted over TLS with encrypted storage.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Activity className="mt-0.5 h-4 w-4 text-amber-600" />
                  <span>Audit logs capture connection state and sync operations.</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* HubSpot Connection Dialog */}
      <Dialog
        open={hubspotDialogOpen}
        onOpenChange={(open) => {
          setHubspotDialogOpen(open);
          if (!open) {
            setHsDisplayName('');
            setHsOwnerId('');
            setHsToken('');
            setShowHsToken(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                <img src="/brand/hubspot.svg" alt="HubSpot" className="h-5 w-auto" />
              </div>
              Connect HubSpot
            </DialogTitle>
            <DialogDescription>
              Add your HubSpot private app token to enable CRM integration.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="add">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="add">Add Account</TabsTrigger>
              <TabsTrigger value="howto">Setup Guide</TabsTrigger>
            </TabsList>

            <TabsContent value="add" className="space-y-4 mt-6">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="hs-display-name" className="text-sm font-medium">Display name</Label>
                  <Input
                    id="hs-display-name"
                    value={hsDisplayName}
                    onChange={(e) => setHsDisplayName(e.target.value)}
                    placeholder="e.g., HubSpot Sales"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="hs-owner-id" className="text-sm font-medium">Owner ID</Label>
                  <Input
                    id="hs-owner-id"
                    value={hsOwnerId}
                    onChange={(e) => setHsOwnerId(e.target.value)}
                    placeholder="Your HubSpot owner ID"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="hs-token" className="text-sm font-medium">Private app token</Label>
                  <div className="relative mt-1">
                    <Input
                      id="hs-token"
                      type={showHsToken ? 'text' : 'password'}
                      value={hsToken}
                      onChange={(e) => setHsToken(e.target.value)}
                      placeholder="Paste your private app token"
                      className="pr-10"
                    />
                    <button
                      onClick={() => setShowHsToken(!showHsToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                    >
                      {showHsToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6 gap-2">
                <Button variant="outline" onClick={() => setHubspotDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleHubSpotConnect}
                  disabled={hsSaving}
                >
                  {hsSaving ? 'Connecting...' : 'Connect'}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="howto" className="mt-6">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 mb-3">How to create a private app token</h3>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
                  <li>Log in to HubSpot and go to <strong>Settings -&gt; Integrations -&gt; Private Apps</strong></li>
                  <li>Click <strong>Create app</strong> and give it a name</li>
                  <li>Go to the <strong>Scopes</strong> tab and select CRM scopes (contacts, companies, etc.)</li>
                  <li>Go to <strong>Install app</strong> and copy the access token</li>
                  <li>Go to <strong>Users & Teams</strong> in Settings to find your Owner ID</li>
                  <li>Paste both values above and click Connect</li>
                </ol>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Salesforce Connection Dialog */}
      <Dialog
        open={salesforceDialogOpen}
        onOpenChange={(open) => {
          setSalesforceDialogOpen(open);
          if (!open) {
            setSfShowLogin(false);
            setSfAuthCode('');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                <img src="/brand/salesforce.svg" alt="Salesforce" className="h-5 w-auto" />
              </div>
              Connect Salesforce
            </DialogTitle>
            <DialogDescription>
              Use OAuth to securely authorize Salesforce access.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="add">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="add">Add Account</TabsTrigger>
              <TabsTrigger value="howto">Setup Guide</TabsTrigger>
            </TabsList>

            <TabsContent value="add" className="space-y-4 mt-6">
              {!sfShowLogin ? (
                <>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="sf-display-name" className="text-sm font-medium">Display name</Label>
                      <Input
                        id="sf-display-name"
                        value={sfDisplayName}
                        onChange={(e) => setSfDisplayName(e.target.value)}
                        placeholder="e.g., Salesforce Sales"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="sf-client-id" className="text-sm font-medium">Client ID</Label>
                      <Input
                        id="sf-client-id"
                        value={sfClientId}
                        onChange={(e) => setSfClientId(e.target.value)}
                        placeholder="Your OAuth client ID"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="sf-client-secret" className="text-sm font-medium">Client secret</Label>
                      <Input
                        id="sf-client-secret"
                        type="password"
                        value={sfClientSecret}
                        onChange={(e) => setSfClientSecret(e.target.value)}
                        placeholder="Your OAuth client secret"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="sf-redirect-uri" className="text-sm font-medium">Redirect URI</Label>
                      <Input
                        id="sf-redirect-uri"
                        value={sfRedirectUri}
                        onChange={(e) => setSfRedirectUri(e.target.value)}
                        placeholder="https://your-app.com/oauth/callback"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <DialogFooter className="mt-6 gap-2">
                    <Button variant="outline" onClick={() => setSalesforceDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleSalesforceStart}
                    >
                      Open Salesforce OAuth
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                    <p className="text-sm text-blue-900">
                      A Salesforce login window should have opened. After you approve access, paste the authorization code below.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="sf-auth-code" className="text-sm font-medium">Authorization code</Label>
                    <Input
                      id="sf-auth-code"
                      value={sfAuthCode}
                      onChange={(e) => setSfAuthCode(e.target.value)}
                      placeholder="Paste the code from Salesforce"
                      className="mt-1"
                    />
                  </div>

                  <DialogFooter className="mt-6 gap-2">
                    <Button variant="outline" onClick={() => setSfShowLogin(false)}>
                      Back
                    </Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleSalesforceExchange}
                      disabled={sfSaving}
                    >
                      {sfSaving ? 'Connecting...' : 'Connect'}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </TabsContent>

            <TabsContent value="howto" className="mt-6">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 mb-3">How to set up OAuth</h3>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
                  <li>Log in to Salesforce and go to <strong>Setup -&gt; Apps -&gt; App Manager</strong></li>
                  <li>Click <strong>New Connected App</strong></li>
                  <li>Enable <strong>OAuth Settings</strong> and add your redirect URI</li>
                  <li>Select scopes: <strong>api, refresh_token, offline_access</strong></li>
                  <li>Save and get your Consumer Key (Client ID) and Consumer Secret</li>
                  <li>Paste the values above and click Open Salesforce OAuth</li>
                </ol>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Integrations;

