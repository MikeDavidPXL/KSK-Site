-- ============================================================
-- 420 Clan – Supabase Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL → New Query)
-- ============================================================

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  discord_id    TEXT NOT NULL,
  discord_name  TEXT NOT NULL,
  uid           TEXT NOT NULL,
  age           INTEGER NOT NULL,
  speaks_english BOOLEAN NOT NULL,
  timezone      TEXT NOT NULL,
  activity      TEXT NOT NULL,
  level         TEXT NOT NULL,
  playstyle     TEXT NOT NULL,
  banned_koth_cheating BOOLEAN NOT NULL,
  looking_for   TEXT NOT NULL,
  has_mic       BOOLEAN NOT NULL,
  clan_history  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'rejected')),
  reviewer_id   TEXT,
  reviewer_note TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookups by discord user
CREATE INDEX IF NOT EXISTS idx_applications_discord ON applications (discord_id);
CREATE INDEX IF NOT EXISTS idx_applications_status  ON applications (status);

-- Audit log for admin actions
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action      TEXT NOT NULL,
  target_id   UUID REFERENCES applications(id),
  actor_id    TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_applications_updated
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
