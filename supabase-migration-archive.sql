-- Add soft-delete / archive columns to applications table
-- Run this in the Supabase SQL Editor

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS archived_at   TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archived_by   TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT        DEFAULT NULL;

-- Optional: index for faster filtering on non-archived applications
CREATE INDEX IF NOT EXISTS idx_applications_archived_at
  ON applications (archived_at)
  WHERE archived_at IS NULL;
