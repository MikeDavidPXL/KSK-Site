-- Migration: Add created_by_username to application_notes
-- Date: 2026-02-25
-- Purpose: Store Discord username alongside user ID for display

ALTER TABLE application_notes
  ADD COLUMN IF NOT EXISTS created_by_username TEXT;

-- Add comment for clarity
COMMENT ON COLUMN application_notes.created_by_username IS 'Discord username of the staff member who created the note (for display, created_by stores the discord_id)';
