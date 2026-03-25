import { useEffect, useMemo, useState } from 'react';
import { useSiteConnectorStore } from '@/stores/siteConnectorStore';
import { useLandingPageStore } from '@/stores/landingPageStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Plus, Shield, CheckCircle2, AlertCircle, Clock, Trash2, RefreshCw, Link2, ExternalLink, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSiteConnectorDnsRecordDisplayName, normalizeAndValidateSiteDomain } from '@/lib/siteConnectorDomain';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function SiteConnectorPage() {
  const {
    domains,
    hasLoaded,
    isLoading,
    isSaving,
    loadDomains,
    addDomain,
    removeDomain,
    verifyDomain,
    linkPage,
  } = useSiteConnectorStore();
  const {
    pages,
    hasLoaded: hasLoadedPages,
    loadPages,
  } = useLandingPageStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [domainType, setDomainType] = useState<'root' | 'subdomain'>('root');

  useEffect(() => {
    if (!hasLoaded) {
      void loadDomains();
    }
  }, [hasLoaded, loadDomains]);

  useEffect(() => {
    if (!hasLoadedPages) {
      void loadPages();
    }
  }, [hasLoadedPages, loadPages]);

  const linkablePages = useMemo(
    () => [...pages].sort((a, b) => a.name.localeCompare(b.name)),
    [pages]
  );
  const publishedPages = useMemo(
    () => linkablePages.filter((page) => page.published),
    [linkablePages]
  );

  const pageById = useMemo(() => {
    return new Map(linkablePages.map((page) => [page.id, page]));
  }, [linkablePages]);

  const domainValidation = useMemo(() => {
    const value = newDomain.trim();
    if (!value) {
      return {
        error: '',
        details: null as ReturnType<typeof normalizeAndValidateSiteDomain> | null,
      };
    }

    try {
      return {
        error: '',
        details: normalizeAndValidateSiteDomain(value, domainType),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Enter a valid domain.',
        details: null,
      };
    }
  }, [domainType, newDomain]);

  const getOrigin = () => {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  };

  const handleAdd = async () => {
    if (!newDomain.trim()) return;

    try {
      const { normalizedDomain } = normalizeAndValidateSiteDomain(newDomain, domainType);
      await addDomain(normalizedDomain, domainType);
      setNewDomain('');
      setShowAdd(false);
    } catch {
      // Toast message is handled in store.
    }
  };

  const statusConfig = {
    pending: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Pending' },
    verified: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Verified' },
    active: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Active' },
    failed: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Failed' },
    expired: { icon: AlertCircle, color: 'text-warning', bg: 'bg-warning/10', label: 'Expired' },
  };

  const copyToClipboard = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Link copied');
    } catch {
      toast.error('Unable to copy link');
    }
  };

  const renderUrlRow = (
    label: string,
    value: string,
    options?: {
      emphasize?: boolean;
      canOpen?: boolean;
    }
  ) => (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'font-mono hover:underline break-all',
            options?.emphasize ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {value}
        </a>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void copyToClipboard(value)}
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
        {options?.canOpen ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => window.open(value, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Site Connector</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect custom domains, verify DNS and SSL, and choose which published page serves at root.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} disabled={isSaving}>
          <Plus className="w-4 h-4 mr-1" /> Add Domain
        </Button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-semibold text-foreground mb-4">Add New Domain</h3>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs">Domain Type</Label>
                  <div className="flex gap-2 mt-1">
                    {(['root', 'subdomain'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setDomainType(type)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize",
                          domainType === type
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {type === 'root' ? 'Root Domain' : 'Subdomain'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Domain Name</Label>
                  <Input
                    value={newDomain}
                    onChange={(event) => setNewDomain(event.target.value)}
                    placeholder={domainType === 'root' ? 'example.com' : 'app.example.com'}
                    className="mt-1"
                    disabled={isSaving}
                  />
                  {domainValidation.error ? (
                    <p className="mt-2 text-xs text-destructive">{domainValidation.error}</p>
                  ) : domainValidation.details ? (
                    <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span>Normalized host</span>
                        <span className="font-mono text-foreground break-all">
                          {domainValidation.details.normalizedDomain}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Zone root</span>
                        <span className="font-mono text-foreground break-all">
                          {domainValidation.details.zoneRoot}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>DNS host label</span>
                        <span className="font-mono text-foreground break-all">
                          {domainType === 'subdomain'
                            ? domainValidation.details.hostLabel || '@'
                            : '@'}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  The selected root page only controls <span className="font-mono">/</span>. Every published landing
                  page remains available at <span className="font-mono">/&lt;slug&gt;</span> on the connected domain.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => void handleAdd()}
                    disabled={isSaving || !newDomain.trim() || Boolean(domainValidation.error)}
                  >
                    Add Domain
                  </Button>
                  <Button variant="ghost" onClick={() => setShowAdd(false)} disabled={isSaving}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {domains.length === 0 && !showAdd ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-2 border-dashed border-border rounded-xl p-12 text-center"
        >
          <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center mx-auto mb-4">
            <Globe className="w-6 h-6 text-warning" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">No domains connected</h3>
          <p className="text-sm text-muted-foreground mb-4">Connect your first domain to start routing traffic</p>
          <Button onClick={() => setShowAdd(true)} disabled={isSaving}>
            <Plus className="w-4 h-4 mr-1" /> Add Domain
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {domains.map((domain) => {
            const dns = statusConfig[domain.dnsStatus];
            const ssl = statusConfig[domain.sslStatus];
            const linkedPage = domain.linkedPageId ? pageById.get(domain.linkedPageId) : null;
            const customDomainProtocol = domain.sslStatus === 'active' ? 'https' : 'http';
            const customDomainRootUrl = `${customDomainProtocol}://${domain.domain}`;
            const customDomainSlugUrl = linkedPage?.slug ? `${customDomainRootUrl}/${linkedPage.slug}` : '';
            const publishedSlugUrl = linkedPage?.slug ? `${getOrigin()}/pages/${linkedPage.slug}` : '';
            const hasPublishedLinkedPage = Boolean(linkedPage?.published);
            const publishedDomainPages = publishedPages.map((page) => ({
              id: page.id,
              name: page.name || 'Untitled',
              slug: page.slug,
              customUrl: `${customDomainRootUrl}/${page.slug}`,
              platformUrl: `${getOrigin()}/pages/${page.slug}`,
              isRootPage: page.id === domain.linkedPageId,
            }));
            return (
              <motion.div
                key={domain.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{domain.domain}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{domain.type} domain</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void verifyDomain(domain.id)}
                      disabled={isSaving}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" /> Verify
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const shouldDelete = window.confirm(`Remove domain "${domain.domain}"?`);
                        if (!shouldDelete) return;
                        void removeDomain(domain.id);
                      }}
                      className="text-destructive hover:text-destructive"
                      disabled={isSaving}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium", dns.bg, dns.color)}>
                    <dns.icon className="w-3 h-3" /> DNS: {dns.label}
                  </div>
                  <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium", ssl.bg, ssl.color)}>
                    <Shield className="w-3 h-3" /> SSL: {ssl.label}
                  </div>
                  {domain.linkedPageName && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-info/10 text-info">
                      <Link2 className="w-3 h-3" /> Root: {domain.linkedPageName}
                    </div>
                  )}
                </div>

                <div className="bg-muted/50 rounded-lg p-4 mb-4">
                  <h4 className="text-xs font-semibold text-foreground mb-3">DNS Records</h4>
                  {domain.type === 'subdomain' && (
                    <p className="mb-3 text-xs text-muted-foreground">
                      For subdomains, use host labels like <span className="font-mono">lp</span> and{' '}
                      <span className="font-mono">_verify.lp</span>, not <span className="font-mono">@</span>.
                    </p>
                  )}
                  <div className="space-y-2">
                    {domain.dnsRecords.map((record, index) => (
                      <div key={index} className="flex items-center gap-4 text-xs">
                        <span className="w-10 font-mono font-bold text-muted-foreground">{record.type}</span>
                        <span className="w-20 font-mono text-foreground">
                          {getSiteConnectorDnsRecordDisplayName(domain.domain, domain.type, record)}
                        </span>
                        <span className="flex-1 font-mono text-muted-foreground truncate">{record.value}</span>
                        {record.verified ? (
                          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-warning shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Root Path Page</Label>
                  <Select
                    value={domain.linkedPageId || '__none'}
                    onValueChange={(value) => void linkPage(domain.id, value === '__none' ? null : value)}
                    disabled={isSaving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select page for /" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No page at root</SelectItem>
                      {linkablePages.map((page) => (
                        <SelectItem key={page.id} value={page.id}>
                          {page.name || 'Untitled'} {page.published ? '(Published)' : '(Draft)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {linkablePages.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Create at least one landing page before linking domains.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    The selected page serves <span className="font-mono">/</span>. All published landing pages also stay
                    available at <span className="font-mono">/&lt;slug&gt;</span> on this domain.
                  </p>

                  <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 space-y-4">
                    <div className="space-y-2">
                      <div>
                        <h4 className="text-xs font-semibold text-foreground">Root Route</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Visitors hitting <span className="font-mono">/</span> on this domain will use this page.
                        </p>
                      </div>

                      {hasPublishedLinkedPage && linkedPage ? (
                        <>
                          {renderUrlRow('Root URL', customDomainRootUrl, { emphasize: true, canOpen: true })}
                          {customDomainSlugUrl ? renderUrlRow('Root page slug', customDomainSlugUrl) : null}
                          {publishedSlugUrl ? renderUrlRow('Platform URL', publishedSlugUrl) : null}
                        </>
                      ) : linkedPage ? (
                        <p className="text-xs text-muted-foreground">
                          The selected root page is still a draft. Publish it before routing <span className="font-mono">/</span>.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No page is linked to <span className="font-mono">/</span> yet. Users can still open any published page at its slug path.
                        </p>
                      )}

                      {domain.sslStatus !== 'active' && (
                        <p className="text-[11px] text-muted-foreground">
                          SSL is still provisioning. Use the HTTP URL until SSL status becomes Active.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div>
                        <h4 className="text-xs font-semibold text-foreground">Published Slug Routes</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Every published landing page can be opened on this domain at its slug path.
                        </p>
                      </div>

                      {publishedDomainPages.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No published landing pages yet. Publish a page to make it available at a slug route.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {publishedDomainPages.map((page) => (
                            <div key={page.id} className="rounded-lg border border-border/70 bg-background/80 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-xs font-medium text-foreground">{page.name}</p>
                                  <p className="text-[11px] text-muted-foreground font-mono">/{page.slug}</p>
                                </div>
                                {page.isRootPage ? (
                                  <span className="rounded-full bg-info/10 px-2 py-1 text-[11px] font-medium text-info">
                                    Root page
                                  </span>
                                ) : null}
                              </div>
                              {renderUrlRow('Domain URL', page.customUrl, { emphasize: page.isRootPage, canOpen: true })}
                              {renderUrlRow('Platform URL', page.platformUrl)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
