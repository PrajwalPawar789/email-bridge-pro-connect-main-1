-- Migration: Add job_title to prospects
-- Date: 2026-01-26

BEGIN;

ALTER TABLE IF EXISTS public.prospects
  ADD COLUMN IF NOT EXISTS job_title TEXT;

COMMIT;

-- Rollback (if needed):
-- BEGIN;
-- ALTER TABLE IF EXISTS public.prospects
--   DROP COLUMN IF EXISTS job_title;
-- COMMIT;
