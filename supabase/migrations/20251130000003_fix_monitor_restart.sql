CREATE OR REPLACE FUNCTION public.monitor_and_restart_campaigns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  campaign_record RECORD;
  pending_count INTEGER;
  now_ts TIMESTAMPTZ := NOW();
  ten_minutes_ago TIMESTAMPTZ := now_ts - INTERVAL '10 minutes';
  two_minutes_ago TIMESTAMPTZ := now_ts - INTERVAL '2 minutes';
  service_role_key TEXT;
  auth_headers JSONB := NULL;
BEGIN
  RAISE NOTICE 'Starting campaign monitoring at %', now_ts;

  -- Retrieve key from the secrets table
  SELECT value INTO service_role_key FROM public.app_secrets WHERE key = 'service_role_key';

  -- Maintenance tasks
  PERFORM public.fix_campaign_statistics();
  PERFORM public.auto_restart_failed_campaigns();
  PERFORM public.resume_stuck_campaigns();
  PERFORM public.cleanup_stuck_processing_recipients();

  IF service_role_key IS NOT NULL AND btrim(service_role_key) <> '' THEN
    auth_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    );
  ELSE
    RAISE WARNING 'Service role key not configured; skipping HTTP triggers in monitor_and_restart_campaigns.';
  END IF;

  FOR campaign_record IN
    SELECT DISTINCT c.id, c.name, c.status, c.last_batch_sent_at, c.updated_at
    FROM campaigns c
    INNER JOIN recipients r ON c.id = r.campaign_id
    WHERE c.status IN ('ready', 'sending', 'failed')
      AND c.status <> 'sent'
      AND r.status = 'pending'
      AND (
        c.status = 'ready' OR
        (c.status = 'sending' AND (c.last_batch_sent_at IS NULL OR c.last_batch_sent_at < ten_minutes_ago)) OR
        c.status = 'failed'
      )
      AND (c.updated_at IS NULL OR c.updated_at < two_minutes_ago)
  LOOP
    SELECT COUNT(*) INTO pending_count
    FROM recipients
    WHERE campaign_id = campaign_record.id
      AND status = 'pending';

    IF pending_count > 0 THEN
      IF campaign_record.status <> 'sending'
         OR campaign_record.last_batch_sent_at IS NULL
         OR campaign_record.last_batch_sent_at < ten_minutes_ago THEN

        UPDATE campaigns
        SET status = 'ready',
            updated_at = NOW()
        WHERE id = campaign_record.id
          AND status <> 'sent';

        IF FOUND THEN
          RAISE NOTICE 'Marked campaign % (%) as ready with % pending recipients',
            campaign_record.name, campaign_record.id, pending_count;

          IF auth_headers IS NOT NULL THEN
            PERFORM net.http_post(
              url := 'https://lyerkyijpavilyufcrgb.supabase.co/functions/v1/send-campaign-emails',
              headers := auth_headers,
              body := jsonb_build_object('campaignId', campaign_record.id, 'resume', true)
            );

            RAISE NOTICE 'Triggered edge function for campaign %', campaign_record.id;
          ELSE
            RAISE WARNING 'Skipped triggering edge function for campaign % due to missing service role key',
              campaign_record.id;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Campaign monitoring completed at %', NOW();
END;
$function$;
