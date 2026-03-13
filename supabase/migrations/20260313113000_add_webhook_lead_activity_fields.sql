ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS webhook_first_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_last_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_type TEXT;

CREATE INDEX IF NOT EXISTS idx_prospects_user_webhook_first_received
  ON public.prospects(user_id, webhook_first_received_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospects_user_webhook_last_received
  ON public.prospects(user_id, webhook_last_received_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospects_user_last_activity
  ON public.prospects(user_id, last_activity_at DESC);
