
-- Add tracking columns to recipients table
ALTER TABLE public.recipients 
ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMP WITH TIME ZONE;

-- Create functions to increment campaign counters
CREATE OR REPLACE FUNCTION increment_opened_count(campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE campaigns 
  SET opened_count = (
    SELECT COUNT(*) 
    FROM recipients 
    WHERE recipients.campaign_id = increment_opened_count.campaign_id 
    AND opened_at IS NOT NULL
  )
  WHERE id = increment_opened_count.campaign_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_clicked_count(campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE campaigns 
  SET clicked_count = (
    SELECT COUNT(*) 
    FROM recipients 
    WHERE recipients.campaign_id = increment_clicked_count.campaign_id 
    AND clicked_at IS NOT NULL
  )
  WHERE id = increment_clicked_count.campaign_id;
END;
$$ LANGUAGE plpgsql;
