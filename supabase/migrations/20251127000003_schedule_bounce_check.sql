-- Improve increment_bounced_count to be idempotent (count from recipients table)
CREATE OR REPLACE FUNCTION public.increment_bounced_count(campaign_id UUID)
RETURNS VOID AS $$
DECLARE
  b_count INTEGER;
BEGIN
  -- Count unique bounces for this campaign
  SELECT COUNT(DISTINCT id) INTO b_count
  FROM recipients 
  WHERE recipients.campaign_id = increment_bounced_count.campaign_id 
    AND bounced = true;
  
  -- Update the campaign with the count
  UPDATE campaigns 
  SET bounced_count = b_count,
      updated_at = NOW()
  WHERE id = increment_bounced_count.campaign_id;
  
  RAISE NOTICE 'Updated bounced_count for campaign % to %', campaign_id, b_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule the check-email-replies function to run every 10 minutes
-- This function checks for both replies AND bounces
SELECT cron.schedule(
  'check-replies-bounces',
  '*/10 * * * *', -- Every 10 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://lyerkyijpavilyufcrgb.supabase.co/functions/v1/check-email-replies',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
