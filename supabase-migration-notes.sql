-- Migration: Add application_notes table for internal admin notes
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS application_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by TEXT NOT NULL  -- discord_id of the admin
);

-- Index for fast lookups by application
CREATE INDEX IF NOT EXISTS idx_application_notes_app_id
  ON application_notes(application_id);

-- Index for chronological ordering
CREATE INDEX IF NOT EXISTS idx_application_notes_created
  ON application_notes(application_id, created_at DESC);
