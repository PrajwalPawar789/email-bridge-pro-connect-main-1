CREATE TABLE IF NOT EXISTS public.crm_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('hubspot', 'salesforce')),
  display_name text,
  owner_id text,
  access_token text,
  refresh_token text,
  instance_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_credentials_user_provider_idx
  ON public.crm_credentials (user_id, provider);

ALTER TABLE public.crm_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own crm credentials" ON public.crm_credentials;
CREATE POLICY "Users manage own crm credentials"
  ON public.crm_credentials
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_crm_credentials_updated_at ON public.crm_credentials;
CREATE TRIGGER update_crm_credentials_updated_at
  BEFORE UPDATE ON public.crm_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
