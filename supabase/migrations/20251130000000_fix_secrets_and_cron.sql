-- 1. Insert the service role key into app_secrets
INSERT INTO public.app_secrets (key, value)
VALUES ('service_role_key', 'REDACTED_SUPABASE_SERVICE_ROLE_KEY')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Create a wrapper function for check-email-replies
CREATE OR REPLACE FUNCTION public.invoke_check_email_replies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_role_key TEXT;
  url TEXT := 'https://smwjzloqamtvemljedkv.supabase.co/functions/v1/check-email-replies';
BEGIN
  -- Retrieve key from the secrets table
  SELECT value INTO service_role_key FROM public.app_secrets WHERE key = 'service_role_key';

  IF service_role_key IS NULL OR service_role_key = '' THEN
    RAISE WARNING 'Service role key not found in public.app_secrets.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- 3. Update the cron job to use the new function
SELECT cron.schedule(
  'check-replies-bounces',
  '*/10 * * * *', -- Every 10 minutes
  'SELECT public.invoke_check_email_replies()'
);

