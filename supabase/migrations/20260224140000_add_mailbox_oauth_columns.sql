ALTER TABLE public.email_configs
  ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'password' CHECK (auth_type IN ('password', 'oauth')),
  ADD COLUMN IF NOT EXISTS oauth_provider TEXT CHECK (oauth_provider IN ('gmail', 'outlook')),
  ADD COLUMN IF NOT EXISTS oauth_access_token TEXT,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS oauth_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS oauth_scope TEXT,
  ADD COLUMN IF NOT EXISTS oauth_token_type TEXT;

CREATE INDEX IF NOT EXISTS idx_email_configs_auth_type
  ON public.email_configs(auth_type);

CREATE INDEX IF NOT EXISTS idx_email_configs_oauth_provider
  ON public.email_configs(oauth_provider);
