import { useEffect, useMemo, useState } from 'react';
import LandingPageRenderer from '@/components/landing-pages/LandingPageRenderer';
import { applyLandingPageMetadata } from '@/lib/landingPageMetadata';
import { resolvePublicSitePage, type ResolvedPublicSitePage } from '@/lib/publicSitePages';
import { normalizeSiteConnectorHost } from '@/lib/siteConnectorHost';

const normalizePathname = (value: string) => {
  const stripped = value.split('?')[0]?.split('#')[0] || '';
  const normalized = stripped.replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized ? `/${normalized}` : '/';
};

const extractRequestedSlug = (pathname: string) => {
  const normalized = normalizePathname(pathname);
  if (normalized === '/') return '';
  return normalized.replace(/^\/+/, '');
};

const PageShell = ({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
    <div className="max-w-xl space-y-4">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">{eyebrow}</p>
      <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
      <p className="text-sm text-slate-300 sm:text-base">{description}</p>
    </div>
  </div>
);

const CustomDomainApp = () => {
  const [loading, setLoading] = useState(true);
  const [resolvedPage, setResolvedPage] = useState<ResolvedPublicSitePage | null>(null);

  const host = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return normalizeSiteConnectorHost(window.location.host || window.location.hostname || '');
  }, []);

  const pathname = useMemo(() => {
    if (typeof window === 'undefined') return '/';
    return normalizePathname(window.location.pathname || '/');
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      try {
        const nextPage = await resolvePublicSitePage(host, pathname);
        if (!cancelled) {
          setResolvedPage(nextPage);
          if (nextPage) {
            applyLandingPageMetadata({ pageName: nextPage.page.name, settings: nextPage.page.settings });
          }
        }
      } catch {
        if (!cancelled) {
          setResolvedPage(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [host, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-400" />
      </div>
    );
  }

  if (resolvedPage) {
    return <LandingPageRenderer page={resolvedPage.page} />;
  }

  const requestedSlug = extractRequestedSlug(pathname);

  if (requestedSlug) {
    return (
      <PageShell
        eyebrow="Published Page"
        title="This page is not published on this domain."
        description={`${host}/${requestedSlug} did not resolve to a published landing page for this workspace.`}
      />
    );
  }

  return (
    <PageShell
      eyebrow="Custom Domain"
      title="This domain root is not linked."
      description={`${host || 'This domain'} does not currently have a landing page assigned to the root path.`}
    />
  );
};

export default CustomDomainApp;
