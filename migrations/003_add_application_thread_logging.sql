-- Migration: Add application review fields
-- Date: 2026-02-25

-- Add deny_reason column (required text when denying)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS deny_reason TEXT;

-- Ensure accepted_at/accepted_by/denied_at/denied_by exist (idempotent)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by TEXT,
  ADD COLUMN IF NOT EXISTS denied_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS denied_by   TEXT;

-- Add comment for clarity
COMMENT ON COLUMN applications.deny_reason IS 'Required reason text explaining why the application was denied';
