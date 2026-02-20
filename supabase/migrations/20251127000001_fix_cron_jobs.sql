-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a table to store secrets securely (Alternative to app.settings)
CREATE TABLE IF NOT EXISTS public.app_secrets (
    key text PRIMARY KEY,
    value text NOT NULL
);

-- Secure the secrets table
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Only allow service_role or postgres to access
DROP POLICY IF EXISTS "Allow service_role to read secrets" ON public.app_secrets;
CREATE POLICY "Allow service_role to read secrets" ON public.app_secrets FOR SELECT TO service_role USING (true);
-- (Postgres superuser bypasses RLS)

-- Function to safely unschedule a job if it exists
CREATE OR REPLACE FUNCTION public.unschedule_job_if_exists(job_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM cron.unschedule(job_name);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Job % could not be unscheduled (might not exist)', job_name;
END;
$$;

-- 1. Cleanup old/redundant jobs
SELECT public.unschedule_job_if_exists('trigger-email-batches');
SELECT public.unschedule_job_if_exists('monitor-campaigns-worker');
SELECT public.unschedule_job_if_exists('monitor-campaigns-heartbeat');

-- 2. Create a robust function to trigger the monitor-campaigns edge function
CREATE OR REPLACE FUNCTION public.invoke_monitor_campaigns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_role_key TEXT;
  url TEXT := 'https://smwjzloqamtvemljedkv.supabase.co/functions/v1/monitor-campaigns';
BEGIN
  -- Retrieve key from the secrets table instead of app.settings
  SELECT value INTO service_role_key FROM public.app_secrets WHERE key = 'service_role_key';

  IF service_role_key IS NULL OR service_role_key = '' THEN
    RAISE WARNING 'Service role key not found in public.app_secrets.';
  END IF;

  PERFORM net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(service_role_key, '')
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- 3. Schedule the main worker to run every minute
SELECT cron.schedule(
  'monitor-campaigns-worker',
  '* * * * *',
  'SELECT public.invoke_monitor_campaigns()'
);

-- 4. Keep 'campaign-monitor' as a safety net (every 10 mins)
SELECT cron.schedule(
  'campaign-monitor',
  '*/10 * * * *',
  'SELECT public.monitor_and_restart_campaigns()'
);

