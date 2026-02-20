-- Unschedule the old/redundant cron job that was causing errors
SELECT public.unschedule_job_if_exists('monitor-campaigns-every-minute');
