ALTER TABLE public.landing_pages
ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.landing_page_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'cta_click', 'form_submit')),
  session_id TEXT,
  block_id TEXT,
  label TEXT,
  source_url TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_page_events_user_created
  ON public.landing_page_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_page_events_page_created
  ON public.landing_page_events(landing_page_id, created_at DESC);

ALTER TABLE public.landing_page_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landing page events owner access" ON public.landing_page_events;
CREATE POLICY "landing page events owner access"
  ON public.landing_page_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
