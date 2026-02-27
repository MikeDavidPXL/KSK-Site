-- Migration: Fix clan_list_members.source constraint
-- Ensures backend write paths can store csv/manual/application

-- Normalize legacy/null values before tightening constraint
UPDATE clan_list_members
SET source = 'manual'
WHERE source IS NULL OR btrim(source) = '';

-- Drop old constraint if present
ALTER TABLE clan_list_members
  DROP CONSTRAINT IF EXISTS clan_list_members_source_check;

-- Add updated allowed values
ALTER TABLE clan_list_members
  ADD CONSTRAINT clan_list_members_source_check
  CHECK (source IN ('csv', 'manual', 'application'));

-- Keep a safe default for manual entry UIs that omit source
ALTER TABLE clan_list_members
  ALTER COLUMN source SET DEFAULT 'manual';
