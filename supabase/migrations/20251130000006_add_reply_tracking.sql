
-- Add replied_count to campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS replied_count INTEGER DEFAULT 0;

-- Function to increment replied count safely
CREATE OR REPLACE FUNCTION increment_replied_count(campaign_id UUID)
RETURNS VOID AS $$
DECLARE
  r_count INTEGER;
BEGIN
  -- Count unique replies for this campaign
  SELECT COUNT(DISTINCT id) INTO r_count
  FROM recipients 
  WHERE recipients.campaign_id = increment_replied_count.campaign_id 
    AND replied = true;
  
  -- Update the campaign with the count
  UPDATE campaigns 
  SET replied_count = r_count,
      updated_at = NOW()
  WHERE id = increment_replied_count.campaign_id;
  
  RAISE NOTICE 'Updated replied_count for campaign % to %', campaign_id, r_count;
END;
$$ LANGUAGE plpgsql;
