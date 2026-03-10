import { useEffect, useMemo, useState } from 'react';
import LandingPage from './LandingPage';
import { resolveSiteDomain, type ResolvedSiteDomain } from '@/lib/siteConnectorPersistence';
import { extractHtmlBodyContent, extractHtmlTitle } from '@/lib/htmlDocument';
import { normalizeSiteConnectorHost, shouldResolveSiteDomainHost } from '@/lib/siteConnectorHost';

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
          const resolvedTitle = resolved ? extractHtmlTitle(resolved.page.contentHtml) || resolved.page.name : '';
          if (resolvedTitle) {
            document.title = resolvedTitle;
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

  return <div dangerouslySetInnerHTML={{ __html: extractHtmlBodyContent(resolvedDomain.page.contentHtml) }} />;
};

export default RootPage;
