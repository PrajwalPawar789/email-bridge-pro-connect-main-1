
-- Drop the old, incorrect constraint from the campaigns table
ALTER TABLE public.campaigns
DROP CONSTRAINT IF EXISTS campaigns_status_check;

-- Add a new, correct constraint that includes 'ready' as a valid status
ALTER TABLE public.campaigns
ADD CONSTRAINT campaigns_status_check
CHECK (status IN ('draft', 'ready', 'sending', 'paused', 'sent', 'failed'));
