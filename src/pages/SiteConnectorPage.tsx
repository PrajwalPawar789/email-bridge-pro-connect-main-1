import { useEffect, useMemo, useState } from 'react';
import { useSiteConnectorStore } from '@/stores/siteConnectorStore';
import { useLandingPageStore } from '@/stores/landingPageStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Plus, Shield, CheckCircle2, AlertCircle, Clock, Trash2, RefreshCw, Link2, ExternalLink, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const inferSubdomainHostLabel = (domain: string) => {
  const labels = domain.trim().toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return '';
  return labels.slice(0, -2).join('.');
};

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

  const pageById = useMemo(() => {
    return new Map(linkablePages.map((page) => [page.id, page]));
  }, [linkablePages]);

  const getOrigin = () => {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  };

  const handleAdd = async () => {
    const value = newDomain.trim();
    if (!value) return;
    try {
      await addDomain(value, domainType);
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

  const getDisplayRecordName = (
    domainName: string,
    domainType: 'root' | 'subdomain',
    record: { type: string; name: string }
  ) => {
    if (domainType !== 'subdomain') return record.name;

    const hostLabel = inferSubdomainHostLabel(domainName);
    if (!hostLabel) return record.name;

    const normalizedType = record.type.toUpperCase();
    const normalizedName = record.name.trim();
    if (normalizedType === 'A' && normalizedName === '@') {
      return hostLabel;
    }
    if (normalizedType === 'TXT' && normalizedName === '_verify') {
      return `_verify.${hostLabel}`;
    }
    return normalizedName;
  };

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
          <p className="text-sm text-muted-foreground mt-1">Connect custom domains, manage DNS and SSL</p>
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
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => void handleAdd()} disabled={isSaving}>
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
            const customDomainUrl = `https://${domain.domain}`;
            const customDomainSlugUrl = linkedPage?.slug ? `${customDomainUrl}/${linkedPage.slug}` : customDomainUrl;
            const publishedSlugUrl = linkedPage?.slug ? `${getOrigin()}/pages/${linkedPage.slug}` : '';
            const hasPublishedLinkedPage = Boolean(linkedPage?.published);
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
                      <Link2 className="w-3 h-3" /> {domain.linkedPageName}
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
                          {getDisplayRecordName(domain.domain, domain.type, record)}
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
                  <Label className="text-xs">Link Landing Page</Label>
                  <Select
                    value={domain.linkedPageId || '__none'}
                    onValueChange={(value) => void linkPage(domain.id, value === '__none' ? null : value)}
                    disabled={isSaving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select landing page" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No page linked</SelectItem>
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

                  {linkedPage && (
                    <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                      {hasPublishedLinkedPage ? (
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">Published URL</span>
                          <div className="flex items-center gap-1">
                            <a
                              href={customDomainSlugUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-primary hover:underline break-all"
                            >
                              {customDomainSlugUrl}
                            </a>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => void copyToClipboard(customDomainSlugUrl)}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => window.open(customDomainSlugUrl, '_blank', 'noopener,noreferrer')}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Linked page is not published yet. Publish it to use domain URL.
                        </p>
                      )}

                      {publishedSlugUrl && (
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">Platform URL</span>
                          <div className="flex items-center gap-1">
                            <a
                              href={publishedSlugUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-muted-foreground hover:underline break-all"
                            >
                              {publishedSlugUrl}
                            </a>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => void copyToClipboard(publishedSlugUrl)}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
