-- Update the check constraint for recipients status to include 'processing'
ALTER TABLE public.recipients
DROP CONSTRAINT IF EXISTS recipients_status_check;

ALTER TABLE public.recipients
ADD CONSTRAINT recipients_status_check
CHECK (status IN ('pending', 'sent', 'failed', 'processing', 'completed'));
