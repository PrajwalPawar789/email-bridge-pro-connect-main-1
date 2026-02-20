-- Enable pg_cron extension for background job scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a comprehensive campaign monitoring function
CREATE OR REPLACE FUNCTION public.monitor_and_restart_campaigns()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  campaign_record RECORD;
  pending_count INTEGER;
  current_time TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
  -- Log the monitoring start
  RAISE NOTICE 'Starting campaign monitoring at %', current_time;
  
  -- Step 1: Fix campaign statistics first
  PERFORM public.fix_campaign_statistics();
  
  -- Step 2: Auto-restart failed campaigns with pending recipients
  PERFORM public.auto_restart_failed_campaigns();
  
  -- Step 3: Resume campaigns that have been stuck in 'sending' for too long
  PERFORM public.resume_stuck_campaigns();
  
  -- Step 4: Find campaigns that should be actively sending
  FOR campaign_record IN 
    SELECT DISTINCT c.id, c.name, c.status, c.last_batch_sent_at, c.updated_at
    FROM campaigns c
    INNER JOIN recipients r ON c.id = r.campaign_id
    WHERE (c.status = 'ready' OR 
           (c.status = 'sending' AND (c.last_batch_sent_at IS NULL OR c.last_batch_sent_at < current_time - INTERVAL '10 minutes')) OR
           (c.status = 'failed' AND r.status = 'pending'))
      AND r.status = 'pending'
  LOOP
    -- Count pending recipients
    SELECT COUNT(*) INTO pending_count
    FROM recipients 
    WHERE campaign_id = campaign_record.id 
      AND status = 'pending';
    
    -- If there are pending recipients, ensure campaign is ready to send
    IF pending_count > 0 THEN
      -- Update campaign status to ready if it's not already sending recently
      IF campaign_record.status != 'sending' OR 
         campaign_record.last_batch_sent_at IS NULL OR 
         campaign_record.last_batch_sent_at < current_time - INTERVAL '10 minutes' THEN
        
        UPDATE campaigns 
        SET status = 'ready',
            updated_at = current_time
        WHERE id = campaign_record.id;
        
        RAISE NOTICE 'Marked campaign % (%) as ready with % pending recipients', 
          campaign_record.name, campaign_record.id, pending_count;
        
        -- Trigger the edge function to start sending
        PERFORM net.http_post(
          url := 'https://smwjzloqamtvemljedkv.supabase.co/functions/v1/send-campaign-emails',
          headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
          body := json_build_object('campaignId', campaign_record.id, 'resume', true)::jsonb
        );
        
        RAISE NOTICE 'Triggered edge function for campaign %', campaign_record.id;
      END IF;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Campaign monitoring completed at %', NOW();
END;
$function$;

-- Schedule the monitoring function to run every 2 minutes
SELECT cron.schedule(
  'campaign-monitor',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT public.monitor_and_restart_campaigns();
  $$
);
