-- Migration: Accept flow → auto-create clan member
-- Run this in the Supabase SQL Editor

-- 1. Add accepted_at, accepted_by, denied_at, denied_by to applications
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by TEXT,
  ADD COLUMN IF NOT EXISTS denied_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS denied_by   TEXT;

-- 2. Make audit_log.target_id nullable and remove FK constraint
--    (needed because clan-related audit entries don't reference applications)
ALTER TABLE audit_log
  ALTER COLUMN target_id DROP NOT NULL;

-- If the FK constraint exists, drop it (name may vary):
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audit_log_target_id_fkey'
      AND table_name = 'audit_log'
  ) THEN
    ALTER TABLE audit_log DROP CONSTRAINT audit_log_target_id_fkey;
  END IF;
END $$;

ALTER TABLE audit_log
  ALTER COLUMN target_id TYPE TEXT USING target_id::TEXT;
