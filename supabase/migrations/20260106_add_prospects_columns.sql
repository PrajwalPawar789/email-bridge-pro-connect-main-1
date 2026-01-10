-- Migration: Add optional prospect fields used by importer
-- Date: 2026-01-06
-- Adds: country, industry, sender_name, sender_email

BEGIN;

ALTER TABLE IF EXISTS prospects
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS sender_email TEXT;

COMMIT;

-- Rollback (if needed):
-- BEGIN;
-- ALTER TABLE IF EXISTS prospects
--   DROP COLUMN IF EXISTS sender_email,
--   DROP COLUMN IF EXISTS sender_name,
--   DROP COLUMN IF EXISTS industry,
--   DROP COLUMN IF EXISTS country;
-- COMMIT;
