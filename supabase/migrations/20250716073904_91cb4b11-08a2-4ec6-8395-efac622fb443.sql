-- Create a function to automatically restart failed campaigns with pending recipients
CREATE OR REPLACE FUNCTION public.auto_restart_failed_campaigns()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  campaign_record RECORD;
  pending_count INTEGER;
BEGIN
  -- Find failed campaigns that still have pending recipients
  FOR campaign_record IN 
    SELECT DISTINCT c.id, c.name
    FROM campaigns c
    INNER JOIN recipients r ON c.id = r.campaign_id
    WHERE c.status = 'failed' 
      AND r.status = 'pending'
  LOOP
    -- Count pending recipients for this campaign
    SELECT COUNT(*) INTO pending_count
    FROM recipients 
    WHERE campaign_id = campaign_record.id 
      AND status = 'pending';
    
    -- If there are pending recipients, mark campaign as ready to restart
    IF pending_count > 0 THEN
      UPDATE campaigns 
      SET status = 'ready',
          updated_at = NOW()
      WHERE id = campaign_record.id;
      
      RAISE NOTICE 'Auto-restarted failed campaign: % (%) with % pending recipients', 
        campaign_record.name, campaign_record.id, pending_count;
    END IF;
  END LOOP;
END;
$function$;

-- Create a function to fix campaign statistics
CREATE OR REPLACE FUNCTION public.fix_campaign_statistics()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  campaign_record RECORD;
  actual_sent INTEGER;
  actual_failed INTEGER;
  actual_opened INTEGER;
  actual_clicked INTEGER;
BEGIN
  -- Update statistics for all campaigns
  FOR campaign_record IN SELECT id FROM campaigns
  LOOP
    -- Count actual sent emails
    SELECT COUNT(*) INTO actual_sent
    FROM recipients 
    WHERE campaign_id = campaign_record.id AND status = 'sent';
    
    -- Count actual failed emails
    SELECT COUNT(*) INTO actual_failed
    FROM recipients 
    WHERE campaign_id = campaign_record.id AND status = 'failed';
    
    -- Count actual opened emails
    SELECT COUNT(*) INTO actual_opened
    FROM recipients 
    WHERE campaign_id = campaign_record.id AND opened_at IS NOT NULL;
    
    -- Count actual clicked emails
    SELECT COUNT(*) INTO actual_clicked
    FROM recipients 
    WHERE campaign_id = campaign_record.id AND clicked_at IS NOT NULL;
    
    -- Update campaign statistics
    UPDATE campaigns 
    SET sent_count = actual_sent,
        failed_count = actual_failed,
        opened_count = actual_opened,
        clicked_count = actual_clicked,
        updated_at = NOW()
    WHERE id = campaign_record.id;
  END LOOP;
  
  RAISE NOTICE 'Fixed statistics for all campaigns';
END;
$function$;

-- Run the fixes immediately
SELECT public.fix_campaign_statistics();
SELECT public.auto_restart_failed_campaigns();