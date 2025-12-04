-- Fix script to clean up recipients table from bot activity
-- This ensures that "Total Opens" in the dashboard only reflects human activity
-- while "Bot Activity" reflects the filtered bots.

DO $$
DECLARE
  cleaned_opens INTEGER := 0;
  cleaned_clicks INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting cleanup of bot activity from recipients table...';

  -- 1. Remove opened_at from recipients if they are flagged as bots in tracking_events
  -- This fixes the "Double Counting" issue where a bot open is counted as both a Human Open and a Bot Open
  WITH bot_opens AS (
    SELECT recipient_id 
    FROM tracking_events 
    WHERE event_type = 'open' AND is_bot = TRUE
  ),
  updated_rows AS (
    UPDATE recipients
    SET opened_at = NULL
    WHERE id IN (SELECT recipient_id FROM bot_opens)
    AND opened_at IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO cleaned_opens FROM updated_rows;

  RAISE NOTICE 'Cleaned % bot opens from recipients table', cleaned_opens;

  -- 2. Remove clicked_at from recipients if they are flagged as bots
  WITH bot_clicks AS (
    SELECT recipient_id 
    FROM tracking_events 
    WHERE event_type = 'click' AND is_bot = TRUE
  ),
  updated_rows AS (
    UPDATE recipients
    SET clicked_at = NULL
    WHERE id IN (SELECT recipient_id FROM bot_clicks)
    AND clicked_at IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO cleaned_clicks FROM updated_rows;

  RAISE NOTICE 'Cleaned % bot clicks from recipients table', cleaned_clicks;

  -- 3. Recalculate campaign opened_count and clicked_count (Human Only)
  -- We do this by counting the actual non-null timestamps in the recipients table
  UPDATE campaigns c
  SET 
    opened_count = (
      SELECT COUNT(*) 
      FROM recipients r 
      WHERE r.campaign_id = c.id 
      AND r.opened_at IS NOT NULL
    ),
    clicked_count = (
      SELECT COUNT(*) 
      FROM recipients r 
      WHERE r.campaign_id = c.id 
      AND r.clicked_at IS NOT NULL
    ),
    updated_at = NOW();

  RAISE NOTICE 'Recalculated human open/click counts for all campaigns.';

END $$;
