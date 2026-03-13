CREATE TABLE IF NOT EXISTS public.landing_page_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  email_list_id UUID REFERENCES public.email_lists(id) ON DELETE SET NULL,
  prospect_id UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  form_block_id TEXT NOT NULL,
  full_name TEXT,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  job_title TEXT,
  source_url TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_page_form_submissions_user_submitted
  ON public.landing_page_form_submissions(user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_page_form_submissions_page_submitted
  ON public.landing_page_form_submissions(landing_page_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_page_form_submissions_list_submitted
  ON public.landing_page_form_submissions(email_list_id, submitted_at DESC);

ALTER TABLE public.landing_page_form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landing page form submissions owner access" ON public.landing_page_form_submissions;
CREATE POLICY "landing page form submissions owner access"
  ON public.landing_page_form_submissions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
