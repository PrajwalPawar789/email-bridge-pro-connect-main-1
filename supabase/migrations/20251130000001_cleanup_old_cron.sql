-- Unschedule the old/redundant cron job that was causing errors
SELECT cron.unschedule('monitor-campaigns-every-minute');
