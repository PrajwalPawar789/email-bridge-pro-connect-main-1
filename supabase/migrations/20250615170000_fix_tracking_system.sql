
-- Ensure tracking columns exist in recipients table
ALTER TABLE public.recipients 
ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMP WITH TIME ZONE;

-- Ensure tracking count columns exist in campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS opened_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS clicked_count INTEGER DEFAULT 0;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS increment_opened_count(UUID);
DROP FUNCTION IF EXISTS increment_clicked_count(UUID);

-- Create improved RPC functions with better error handling
CREATE OR REPLACE FUNCTION increment_opened_count(campaign_id UUID)
RETURNS VOID AS $$
DECLARE
  open_count INTEGER;
BEGIN
  -- Count unique opens for this campaign
  SELECT COUNT(DISTINCT id) INTO open_count
  FROM recipients 
  WHERE recipients.campaign_id = increment_opened_count.campaign_id 
    AND opened_at IS NOT NULL;
  
  -- Update the campaign with the count
  UPDATE campaigns 
  SET opened_count = open_count,
      updated_at = NOW()
  WHERE id = increment_opened_count.campaign_id;
  
  -- Log for debugging
  RAISE NOTICE 'Updated opened_count for campaign % to %', campaign_id, open_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_clicked_count(campaign_id UUID)
RETURNS VOID AS $$
DECLARE
  click_count INTEGER;
BEGIN
  -- Count unique clicks for this campaign
  SELECT COUNT(DISTINCT id) INTO click_count
  FROM recipients 
  WHERE recipients.campaign_id = increment_clicked_count.campaign_id 
    AND clicked_at IS NOT NULL;
  
  -- Update the campaign with the count
  UPDATE campaigns 
  SET clicked_count = click_count,
      updated_at = NOW()
  WHERE id = increment_clicked_count.campaign_id;
  
  -- Log for debugging
  RAISE NOTICE 'Updated clicked_count for campaign % to %', campaign_id, click_count;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_recipients_opened_at ON recipients(campaign_id, opened_at) WHERE opened_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipients_clicked_at ON recipients(campaign_id, clicked_at) WHERE clicked_at IS NOT NULL;
