-- Enable required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Attempt to remove old job if it exists (ignore errors)
DO $$
BEGIN
    PERFORM cron.unschedule('monitor-campaigns-heartbeat');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Schedule the cron job with a new name to avoid conflicts
select cron.schedule(
  'monitor-campaigns-worker',
  '*/2 * * * *',
  $$
  select
    net.http_post(
        url:='https://smwjzloqamtvemljedkv.supabase.co/functions/v1/monitor-campaigns',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

