
ALTER TABLE campaign_email_configurations 
ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
