-- Add step_number to tracking_events for per-step analytics
ALTER TABLE public.tracking_events
ADD COLUMN IF NOT EXISTS step_number INTEGER;

-- Helpful indexes for per-recipient timelines and bot burst detection
CREATE INDEX IF NOT EXISTS idx_tracking_events_recipient_step ON public.tracking_events(recipient_id, step_number);
CREATE INDEX IF NOT EXISTS idx_tracking_events_recipient_event_created ON public.tracking_events(recipient_id, event_type, is_bot, created_at);
CREATE INDEX IF NOT EXISTS idx_tracking_events_campaign_ip_created ON public.tracking_events(campaign_id, ip_address, created_at);
