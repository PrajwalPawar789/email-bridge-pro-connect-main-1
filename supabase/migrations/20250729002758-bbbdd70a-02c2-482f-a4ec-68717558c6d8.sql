-- Create a new function to trigger the next batch of emails
CREATE OR REPLACE FUNCTION public.trigger_next_batch()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  campaign_record RECORD;
  pending_count INTEGER;
  current_time TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
  -- Find campaigns that need to continue sending
  FOR campaign_record IN 
    SELECT DISTINCT c.id, c.name, c.status, c.last_batch_sent_at
    FROM campaigns c
    INNER JOIN recipients r ON c.id = r.campaign_id
    WHERE c.status = 'sending'
      AND r.status = 'pending'
      AND (c.last_batch_sent_at IS NULL OR c.last_batch_sent_at < current_time - INTERVAL '2 minutes')
  LOOP
    -- Count pending recipients
    SELECT COUNT(*) INTO pending_count
    FROM recipients 
    WHERE campaign_id = campaign_record.id 
      AND status = 'pending';
    
    -- If there are pending recipients, trigger the next batch
    IF pending_count > 0 THEN
      RAISE NOTICE 'Triggering next batch for campaign % (%) with % pending recipients', 
        campaign_record.name, campaign_record.id, pending_count;
      
      -- Use the new batch function instead of the old one
      PERFORM net.http_post(
        url := 'https://lyerkyijpavilyufcrgb.supabase.co/functions/v1/send-campaign-batch',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
        body := json_build_object('campaignId', campaign_record.id, 'batchSize', 3)::jsonb
      );
      
      RAISE NOTICE 'Triggered batch function for campaign %', campaign_record.id;
    END IF;
  END LOOP;
END;
$function$;

-- Update the cron job to trigger batches more frequently (every 2 minutes)
SELECT cron.unschedule('monitor-campaigns-job');

SELECT cron.schedule(
  'trigger-email-batches',
  '*/2 * * * *', -- every 2 minutes
  $$
  SELECT public.trigger_next_batch();
  $$
);