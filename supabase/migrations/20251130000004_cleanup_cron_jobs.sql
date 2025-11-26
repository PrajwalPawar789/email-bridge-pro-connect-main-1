-- Unschedule the old/redundant cron jobs that are causing errors
SELECT public.unschedule_job_if_exists('trigger_monitor_campaigns_edge_function');
SELECT public.unschedule_job_if_exists('monitor-campaigns-every-minute');

-- Also try to unschedule by ID if possible, but pg_cron doesn't support that easily via SQL function
-- We can try to delete from cron.job directly if we are superuser, but let's stick to unschedule
-- The job name in the logs was "monitor-campaigns-every-minute" (job 9)

-- Let's also make sure we don't have duplicate jobs
SELECT cron.unschedule('monitor-campaigns-worker'); -- Unschedule to reschedule cleanly
SELECT cron.schedule(
  'monitor-campaigns-worker',
  '* * * * *',
  'SELECT public.invoke_monitor_campaigns()'
);
