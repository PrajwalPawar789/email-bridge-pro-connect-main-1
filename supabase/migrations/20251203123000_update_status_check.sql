ALTER TABLE public.campaigns
DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE public.campaigns
ADD CONSTRAINT campaigns_status_check
CHECK (status IN ('draft', 'ready', 'sending', 'paused', 'sent', 'failed', 'scheduled', 'completed'));
