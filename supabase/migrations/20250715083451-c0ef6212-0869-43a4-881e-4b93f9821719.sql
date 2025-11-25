-- Enable realtime for campaigns table
ALTER TABLE public.campaigns REPLICA IDENTITY FULL;

-- Add campaigns table to realtime publication
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE campaigns, recipients;

-- Enable realtime for recipients table  
ALTER TABLE public.recipients REPLICA IDENTITY FULL;

-- Add function to resume stuck campaigns
CREATE OR REPLACE FUNCTION public.resume_stuck_campaigns()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Mark campaigns as 'ready' if they've been 'sending' for more than 30 minutes with no recent progress
  UPDATE campaigns 
  SET status = 'ready'
  WHERE status = 'sending' 
    AND (last_batch_sent_at IS NULL OR last_batch_sent_at < NOW() - INTERVAL '30 minutes')
    AND updated_at < NOW() - INTERVAL '30 minutes';
END;
$function$;