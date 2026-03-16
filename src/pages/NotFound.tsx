import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { resolveSiteDomain, type ResolvedSiteDomain } from "@/lib/siteConnectorPersistence";
import { normalizeSiteConnectorHost, shouldResolveSiteDomainHost } from "@/lib/siteConnectorHost";
import { applyLandingPageMetadata } from "@/lib/landingPageMetadata";
import LandingPageRenderer from "@/components/landing-pages/LandingPageRenderer";
import { getPublishedLandingPage } from "@/lib/landingPagesPersistence";

const normalizeSlugPath = (pathname: string) =>
  pathname
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

const NotFound = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [resolvedDomain, setResolvedDomain] = useState<ResolvedSiteDomain | null>(null);
  const [publishedPage, setPublishedPage] = useState<ResolvedSiteDomain["page"] | null>(null);

  const host = useMemo(() => {
    if (typeof window === "undefined") return "";
    return normalizeSiteConnectorHost(window.location.host || window.location.hostname || "");
  }, []);

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    const requestedSlug = normalizeSlugPath(location.pathname);

    const run = async () => {
      if (!shouldResolveSiteDomainHost(host)) {
        setLoading(false);
        return;
      }

      try {
        const resolved = await resolveSiteDomain(host);
        let published = null;

        if (requestedSlug) {
          const resolvedSlug = normalizeSlugPath(resolved?.page.slug || "");
          if (!resolved || !resolvedSlug || requestedSlug !== resolvedSlug) {
            published = await getPublishedLandingPage(requestedSlug);
          }
        }

        if (!cancelled) {
          setResolvedDomain(resolved);
          setPublishedPage(published);
          if (published) {
            applyLandingPageMetadata({ pageName: published.name, settings: published.settings });
          } else if (resolved) {
            applyLandingPageMetadata({ pageName: resolved.page.name, settings: resolved.page.settings });
          }
        }
      } catch {
        if (!cancelled) {
          setResolvedDomain(null);
          setPublishedPage(null);
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
  }, [host, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (resolvedDomain) {
    const requestedSlug = normalizeSlugPath(location.pathname);
    const expectedSlug = normalizeSlugPath(resolvedDomain.page.slug || "");

    if (!requestedSlug || requestedSlug === expectedSlug || !expectedSlug) {
      return <LandingPageRenderer page={resolvedDomain.page} />;
    }
  }

  if (publishedPage) {
    return <LandingPageRenderer page={publishedPage} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-4">Oops! Page not found</p>
        <a href="/" className="text-blue-500 hover:text-blue-700 underline">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
