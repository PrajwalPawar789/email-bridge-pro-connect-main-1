-- Add thread_id to recipients to track the original message ID for threading
ALTER TABLE public.recipients 
ADD COLUMN IF NOT EXISTS thread_id TEXT;
-- Create an index for faster lookups if needed
CREATE INDEX IF NOT EXISTS idx_recipients_thread_id ON public.recipients(thread_id);