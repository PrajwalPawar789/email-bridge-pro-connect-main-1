-- Allow per-step send tracking in tracking_events.
ALTER TABLE public.tracking_events
  DROP CONSTRAINT IF EXISTS tracking_events_event_type_check;

ALTER TABLE public.tracking_events
  ADD CONSTRAINT tracking_events_event_type_check
  CHECK (event_type IN ('sent', 'open', 'click'));

-- Backfill one sent event for recipients with existing send history.
INSERT INTO public.tracking_events (
  campaign_id,
  recipient_id,
  event_type,
  created_at,
  step_number,
  is_bot,
  bot_score,
  bot_reasons,
  metadata
)
SELECT
  r.campaign_id,
  r.id,
  'sent',
  r.last_email_sent_at,
  COALESCE(r.current_step, 0),
  FALSE,
  0,
  NULL,
  jsonb_build_object(
    'backfilled', TRUE,
    'source', 'recipients.last_email_sent_at'
  )
FROM public.recipients r
WHERE r.last_email_sent_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.tracking_events te
    WHERE te.recipient_id = r.id
      AND te.event_type = 'sent'
      AND te.step_number IS NOT DISTINCT FROM COALESCE(r.current_step, 0)
  );
