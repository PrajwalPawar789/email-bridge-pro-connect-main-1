
-- Add columns if not already added
ALTER TABLE public.recipients 
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMP WITH TIME ZONE;

-- Create/update Postgres functions to update campaign counters
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
