-- Migration: Make discord_id the hard identity key
-- Run this in Supabase SQL Editor

-- 1) applications.discord_id must always be present and non-empty
ALTER TABLE applications
  ALTER COLUMN discord_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'applications_discord_id_not_empty'
      AND conrelid = 'applications'::regclass
  ) THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_discord_id_not_empty
      CHECK (length(trim(discord_id)) > 0);
  END IF;
END $$;

-- 2) clan_list_members.discord_id must support ON CONFLICT(discord_id)
-- NOTE: use a NON-partial unique index so Postgres can infer conflict target.
--       NULL values are still allowed (multiple NULLs are allowed by UNIQUE in Postgres).
DROP INDEX IF EXISTS uq_clan_list_members_discord_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clan_list_members_discord_id
  ON clan_list_members(discord_id);
