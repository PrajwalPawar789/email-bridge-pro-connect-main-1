-- Create tracking_events table for detailed analysis
CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES recipients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'click')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT,
  is_bot BOOLEAN DEFAULT FALSE,
  bot_score INTEGER DEFAULT 0,
  bot_reasons TEXT[], -- Array of reasons e.g. ['speed_trap', 'user_agent', 'honeypot']
  metadata JSONB -- Store extra info like link_url for clicks
);

-- Add index for faster querying
CREATE INDEX IF NOT EXISTS idx_tracking_events_campaign_id ON tracking_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_recipient_id ON tracking_events(recipient_id);

-- Add bot stats columns to campaigns
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS bot_open_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bot_click_count INTEGER DEFAULT 0;

-- Function to increment bot counts
CREATE OR REPLACE FUNCTION increment_bot_open_count(campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE campaigns 
  SET bot_open_count = bot_open_count + 1,
      updated_at = NOW()
  WHERE id = increment_bot_open_count.campaign_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_bot_click_count(campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE campaigns 
  SET bot_click_count = bot_click_count + 1,
      updated_at = NOW()
  WHERE id = increment_bot_click_count.campaign_id;
END;
$$ LANGUAGE plpgsql;
