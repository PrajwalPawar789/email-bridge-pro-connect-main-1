
-- Add bounce tracking columns
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS bounced_count INTEGER DEFAULT 0;

ALTER TABLE public.recipients 
ADD COLUMN IF NOT EXISTS bounced BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMP WITH TIME ZONE;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_recipients_bounced ON public.recipients(bounced);

-- Function to increment bounced count safely
CREATE OR REPLACE FUNCTION increment_bounced_count(campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE campaigns
  SET bounced_count = bounced_count + 1
  WHERE id = campaign_id;
END;
$$ LANGUAGE plpgsql;

