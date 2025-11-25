
-- Add columns to store the open and click tracking links for each recipient
ALTER TABLE public.recipients
ADD COLUMN IF NOT EXISTS track_open_link TEXT,
ADD COLUMN IF NOT EXISTS track_click_link TEXT;
