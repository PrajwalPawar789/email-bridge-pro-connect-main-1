import { useEffect, useMemo, useState } from 'react';
import LandingPage from './LandingPage';
import { resolveSiteDomain, type ResolvedSiteDomain } from '@/lib/siteConnectorPersistence';
import { normalizeSiteConnectorHost, shouldResolveSiteDomainHost } from '@/lib/siteConnectorHost';
import LandingPageRenderer from '@/components/landing-pages/LandingPageRenderer';
import { applyLandingPageMetadata } from '@/lib/landingPageMetadata';

const CustomDomainUnavailable = ({ host }: { host: string }) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
    <div className="max-w-lg space-y-4">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">Custom Domain</p>
      <h1 className="text-3xl font-semibold sm:text-4xl">This domain is not linked to a published page.</h1>
      <p className="text-sm text-slate-300 sm:text-base">
        {host || 'This host'} did not resolve to an active landing page. Re-run domain verification or link the domain to a
        published landing page in Site Connector.
      </p>
    </div>
  </div>
);

const RootPage = () => {
  const [loading, setLoading] = useState(true);
  const [resolvedDomain, setResolvedDomain] = useState<ResolvedSiteDomain | null>(null);

  const host = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return normalizeSiteConnectorHost(window.location.host || window.location.hostname || '');
  }, []);
  const shouldUseCustomDomainResolution = shouldResolveSiteDomainHost(host);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!shouldUseCustomDomainResolution) {
        setLoading(false);
        return;
      }

      try {
        const resolved = await resolveSiteDomain(host);
        if (!cancelled) {
          setResolvedDomain(resolved);
          if (resolved) {
            applyLandingPageMetadata({ pageName: resolved.page.name, settings: resolved.page.settings });
          }
        }
      } catch {
        if (!cancelled) {
          setResolvedDomain(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [host, shouldUseCustomDomainResolution]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!shouldUseCustomDomainResolution) {
    return <LandingPage />;
  }

  if (!resolvedDomain) {
    return <CustomDomainUnavailable host={host} />;
  }

  return <LandingPageRenderer page={resolvedDomain.page} />;
};

export default RootPage;
