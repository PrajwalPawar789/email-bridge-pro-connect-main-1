-- Persist landing pages and site connector domains.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  published BOOLEAN NOT NULL DEFAULT false,
  domain TEXT,
  content_html TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT landing_pages_user_slug_unique UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_user_updated
  ON public.landing_pages(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_pages_slug_published
  ON public.landing_pages(slug, published);

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landing pages owner access" ON public.landing_pages;
CREATE POLICY "landing pages owner access"
  ON public.landing_pages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "landing pages public read published" ON public.landing_pages;
CREATE POLICY "landing pages public read published"
  ON public.landing_pages
  FOR SELECT
  USING (published = true);

DROP TRIGGER IF EXISTS update_landing_pages_updated_at ON public.landing_pages;
CREATE TRIGGER update_landing_pages_updated_at
BEFORE UPDATE ON public.landing_pages
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.site_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('root', 'subdomain')),
  ssl_status TEXT NOT NULL DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'active', 'expired', 'failed')),
  dns_status TEXT NOT NULL DEFAULT 'pending' CHECK (dns_status IN ('pending', 'verified', 'failed')),
  dns_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT site_domains_user_domain_unique UNIQUE (user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_site_domains_user_updated
  ON public.site_domains(user_id, updated_at DESC);

ALTER TABLE public.site_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site domains owner access" ON public.site_domains;
CREATE POLICY "site domains owner access"
  ON public.site_domains
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_site_domains_updated_at ON public.site_domains;
CREATE TRIGGER update_site_domains_updated_at
BEFORE UPDATE ON public.site_domains
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
