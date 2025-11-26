
-- Backfill replied_count and bounced_count from recipients table
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM campaigns LOOP
    -- Update replied_count
    UPDATE campaigns
    SET replied_count = (
      SELECT COUNT(DISTINCT id)
      FROM recipients
      WHERE campaign_id = r.id AND replied = true
    )
    WHERE id = r.id;

    -- Update bounced_count
    UPDATE campaigns
    SET bounced_count = (
      SELECT COUNT(DISTINCT id)
      FROM recipients
      WHERE campaign_id = r.id AND bounced = true
    )
    WHERE id = r.id;
  END LOOP;
END $$;
