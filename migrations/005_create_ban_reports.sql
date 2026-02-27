-- Migration: Create ban_reports table
-- Date: 2026-02-25
-- Purpose: Track member ban reports for appeal eligibility

CREATE TABLE IF NOT EXISTS ban_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  discord_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  custom_reason TEXT,
  additional_context TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  appeal_available_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookup by discord_id
CREATE INDEX IF NOT EXISTS idx_ban_reports_discord_id ON ban_reports(discord_id);

-- Index for checking recent submissions (24h rule)
CREATE INDEX IF NOT EXISTS idx_ban_reports_submitted_at ON ban_reports(submitted_at DESC);

-- Add comment for clarity
COMMENT ON TABLE ban_reports IS 'Tracks ban reports submitted by clan members. Appeal available after 6 months.';
COMMENT ON COLUMN ban_reports.appeal_available_at IS 'Earliest date member can submit an appeal (submitted_at + 6 months)';
