import { useEffect, useMemo, useState } from 'react';
import LandingPage from './LandingPage';
import { resolveSiteDomain, type ResolvedSiteDomain } from '@/lib/siteConnectorPersistence';
import { normalizeSiteConnectorHost, shouldResolveSiteDomainHost } from '@/lib/siteConnectorHost';
import LandingPageRenderer from '@/components/landing-pages/LandingPageRenderer';
import { applyLandingPageMetadata } from '@/lib/landingPageMetadata';

const RootPage = () => {
  const [loading, setLoading] = useState(true);
  const [resolvedDomain, setResolvedDomain] = useState<ResolvedSiteDomain | null>(null);

  const host = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return normalizeSiteConnectorHost(window.location.host || window.location.hostname || '');
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!shouldResolveSiteDomainHost(host)) {
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
  }, [host]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!resolvedDomain) {
    return <LandingPage />;
  }

  return <LandingPageRenderer page={resolvedDomain.page} />;
};

export default RootPage;
