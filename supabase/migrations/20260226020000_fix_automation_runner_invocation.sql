-- Harden automation runner cron invocation:
-- - accept service key from app_secrets or app.settings
-- - treat placeholder keys as missing
-- - allow overriding Supabase base URL via app_secrets.supabase_url
-- - re-install scheduler safely

CREATE OR REPLACE FUNCTION public.invoke_automation_runner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_role_key TEXT;
  base_url TEXT;
  runner_url TEXT;
BEGIN
  SELECT value
  INTO service_role_key
  FROM public.app_secrets
  WHERE key = 'service_role_key';

  service_role_key := NULLIF(BTRIM(COALESCE(service_role_key, '')), '');
  IF service_role_key IS NULL OR service_role_key = 'REDACTED_SUPABASE_SERVICE_ROLE_KEY' THEN
    service_role_key := NULLIF(BTRIM(COALESCE(current_setting('app.settings.service_role_key', true), '')), '');
  END IF;

  IF service_role_key IS NULL OR service_role_key = 'REDACTED_SUPABASE_SERVICE_ROLE_KEY' THEN
    RAISE WARNING 'Service role key not configured; skipping automation runner invoke.';
    RETURN;
  END IF;

  SELECT value
  INTO base_url
  FROM public.app_secrets
  WHERE key = 'supabase_url';

  base_url := NULLIF(BTRIM(COALESCE(base_url, '')), '');
  IF base_url IS NULL THEN
    base_url := NULLIF(BTRIM(COALESCE(current_setting('app.settings.supabase_url', true), '')), '');
  END IF;

  IF base_url IS NULL THEN
    base_url := 'https://smwjzloqamtvemljedkv.supabase.co';
  END IF;

  runner_url := RTRIM(base_url, '/') || '/functions/v1/automation-runner';

  PERFORM net.http_post(
    url := runner_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object('action', 'tick')
  );
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.unschedule_job_if_exists('automation-runner-worker');
  EXCEPTION
    WHEN undefined_function THEN
      BEGIN
        PERFORM cron.unschedule('automation-runner-worker');
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
  END;
END;
$$;

SELECT cron.schedule(
  'automation-runner-worker',
  '*/2 * * * *',
  'SELECT public.invoke_automation_runner()'
);

