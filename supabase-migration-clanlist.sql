-- Migration: Add clan_list and clan_list_rows tables
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS clan_list (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  uploaded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  uploaded_by TEXT NOT NULL,         -- discord_id
  file_name TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT
);

CREATE TABLE IF NOT EXISTS clan_list_rows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES clan_list(id) ON DELETE CASCADE,
  row_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clan_list_uploaded
  ON clan_list(uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_clan_list_rows_list
  ON clan_list_rows(list_id);
