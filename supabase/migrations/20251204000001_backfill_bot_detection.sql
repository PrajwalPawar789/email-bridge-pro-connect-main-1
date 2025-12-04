-- Backfill bot detection for previous campaigns
-- This script analyzes existing recipient data to identify bot behavior based on the "Speed Trap" rule.
-- Rule: If opened_at or clicked_at is within 2 seconds of last_email_sent_at, it's likely a bot.

DO $$
DECLARE
  r RECORD;
  bot_open_count_new INTEGER;
  bot_click_count_new INTEGER;
BEGIN
  RAISE NOTICE 'Starting retroactive bot detection...';

  -- 1. Insert retroactive OPENS into tracking_events
  -- We only check cases where opened_at is slightly AFTER last_email_sent_at (within 2 seconds)
  INSERT INTO tracking_events (campaign_id, recipient_id, event_type, is_bot, bot_score, bot_reasons, created_at)
  SELECT 
    campaign_id, 
    id, 
    'open', 
    TRUE, 
    90, 
    ARRAY['retroactive_speed_trap'], 
    opened_at
  FROM recipients
  WHERE opened_at IS NOT NULL 
    AND last_email_sent_at IS NOT NULL
    AND opened_at >= last_email_sent_at
    AND opened_at <= (last_email_sent_at + INTERVAL '2 seconds')
    -- Avoid duplicates if we run this multiple times
    AND NOT EXISTS (
      SELECT 1 FROM tracking_events 
      WHERE recipient_id = recipients.id 
      AND event_type = 'open' 
      AND 'retroactive_speed_trap' = ANY(bot_reasons)
    );

  GET DIAGNOSTICS bot_open_count_new = ROW_COUNT;
  RAISE NOTICE 'Detected % retroactive bot opens', bot_open_count_new;

  -- 2. Insert retroactive CLICKS into tracking_events
  INSERT INTO tracking_events (campaign_id, recipient_id, event_type, is_bot, bot_score, bot_reasons, created_at)
  SELECT 
    campaign_id, 
    id, 
    'click', 
    TRUE, 
    90, 
    ARRAY['retroactive_speed_trap'], 
    clicked_at
  FROM recipients
  WHERE clicked_at IS NOT NULL 
    AND last_email_sent_at IS NOT NULL
    AND clicked_at >= last_email_sent_at
    AND clicked_at <= (last_email_sent_at + INTERVAL '2 seconds')
    AND NOT EXISTS (
      SELECT 1 FROM tracking_events 
      WHERE recipient_id = recipients.id 
      AND event_type = 'click' 
      AND 'retroactive_speed_trap' = ANY(bot_reasons)
    );

  GET DIAGNOSTICS bot_click_count_new = ROW_COUNT;
  RAISE NOTICE 'Detected % retroactive bot clicks', bot_click_count_new;

  -- 3. Recalculate campaign bot counts from the tracking_events table
  -- This ensures the campaigns table reflects both real-time and retroactive detections
  UPDATE campaigns c
  SET 
    bot_open_count = (
      SELECT COUNT(*) 
      FROM tracking_events te 
      WHERE te.campaign_id = c.id 
      AND te.event_type = 'open' 
      AND te.is_bot = TRUE
    ),
    bot_click_count = (
      SELECT COUNT(*) 
      FROM tracking_events te 
      WHERE te.campaign_id = c.id 
      AND te.event_type = 'click' 
      AND te.is_bot = TRUE
    ),
    updated_at = NOW();

  RAISE NOTICE 'Updated campaign bot counts.';

END $$;
