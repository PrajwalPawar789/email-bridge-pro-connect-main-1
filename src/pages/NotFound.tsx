import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { resolveSiteDomain, type ResolvedSiteDomain } from "@/lib/siteConnectorPersistence";
import { extractHtmlBodyContent, extractHtmlTitle } from "@/lib/htmlDocument";

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeHostname = (value: string) =>
  value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");

const isLocalHost = (hostname: string) => {
  if (localHosts.has(hostname)) return true;
  return /^192\.168\.\d+\.\d+$/.test(hostname) || /^10\.\d+\.\d+\.\d+$/.test(hostname);
};

const normalizeSlugPath = (pathname: string) =>
  pathname
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

const NotFound = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [resolvedDomain, setResolvedDomain] = useState<ResolvedSiteDomain | null>(null);

  const host = useMemo(() => {
    if (typeof window === "undefined") return "";
    return normalizeHostname(window.location.host || window.location.hostname || "");
  }, []);

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!host || isLocalHost(host)) {
        setLoading(false);
        return;
      }

      try {
        const resolved = await resolveSiteDomain(host);
        if (!cancelled) {
          setResolvedDomain(resolved);
          const resolvedTitle = resolved ? extractHtmlTitle(resolved.page.contentHtml) || resolved.page.name : "";
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
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (resolvedDomain) {
    const requestedSlug = normalizeSlugPath(location.pathname);
    const expectedSlug = normalizeSlugPath(resolvedDomain.page.slug || "");

    if (!requestedSlug && expectedSlug) {
      if (typeof window !== "undefined") {
        window.location.replace(`/${expectedSlug}`);
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
        </div>
      );
    }

    if (requestedSlug === expectedSlug || !expectedSlug) {
      return <div dangerouslySetInnerHTML={{ __html: extractHtmlBodyContent(resolvedDomain.page.contentHtml) }} />;
    }
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
