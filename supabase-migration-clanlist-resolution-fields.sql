-- Migration: Add resolution tracking fields for clan_list_members

ALTER TABLE clan_list_members
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS resolution_status TEXT;

-- Backfill reasonable defaults for existing rows
UPDATE clan_list_members
SET resolution_status = CASE
  WHEN discord_id IS NULL THEN 'unresolved'
  ELSE 'resolved_manual'
END
WHERE resolution_status IS NULL;

-- Replace constraint (if exists) with required values
ALTER TABLE clan_list_members
  DROP CONSTRAINT IF EXISTS clan_list_members_resolution_status_check;

ALTER TABLE clan_list_members
  ADD CONSTRAINT clan_list_members_resolution_status_check
  CHECK (resolution_status IN ('unresolved', 'resolved_auto', 'resolved_manual'));

ALTER TABLE clan_list_members
  ALTER COLUMN resolution_status SET DEFAULT 'unresolved';
