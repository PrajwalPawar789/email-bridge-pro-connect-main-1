-- Ensure app_secrets table exists
CREATE TABLE IF NOT EXISTS public.app_secrets (
    key text PRIMARY KEY,
    value text NOT NULL
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Allow service_role to read secrets
DROP POLICY IF EXISTS "Allow service_role to read secrets" ON public.app_secrets;
CREATE POLICY "Allow service_role to read secrets" ON public.app_secrets FOR SELECT TO service_role USING (true);

-- Insert the service role key
INSERT INTO public.app_secrets (key, value)
VALUES ('service_role_key', 'REDACTED_SUPABASE_SERVICE_ROLE_KEY')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
