import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublishedLandingPage } from '@/lib/landingPagesPersistence';
import { extractHtmlBodyContent, extractHtmlTitle } from '@/lib/htmlDocument';

interface PublishedPage {
  id: string;
  name: string;
  slug: string;
  contentHtml: string;
}

const PublishedLandingPage = () => {
  const { slug = '' } = useParams();
  const [page, setPage] = useState<PublishedPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const published = await getPublishedLandingPage(slug);
        if (!cancelled) {
          setPage(published);
          const resolvedTitle = published ? extractHtmlTitle(published.contentHtml) || published.name : '';
          if (resolvedTitle) {
            document.title = resolvedTitle;
          }
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || 'Unable to load landing page');
          setPage(null);
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
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Unable to load page</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Page not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page is either unpublished or does not exist.
          </p>
        </div>
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: extractHtmlBodyContent(page.contentHtml) }} />;
};

export default PublishedLandingPage;
