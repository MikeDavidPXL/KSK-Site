-- Migration: Add clan_list_members table for the upgraded clan list system
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS clan_list_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  discord_name TEXT NOT NULL,
  discord_id TEXT,                                    -- nullable, resolved via guild lookup
  ign TEXT NOT NULL,
  uid TEXT NOT NULL,
  join_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  has_420_tag BOOLEAN NOT NULL DEFAULT false,
  rank_current TEXT NOT NULL DEFAULT 'Private',
  rank_next TEXT,                                     -- computed, cached
  frozen_days INTEGER NOT NULL DEFAULT 0,             -- accumulated counted days before freeze
  counting_since TIMESTAMPTZ,                         -- null = frozen, non-null = counting from this ts
  promote_eligible BOOLEAN NOT NULL DEFAULT false,    -- cached
  promote_reason TEXT,
  needs_resolution BOOLEAN NOT NULL DEFAULT false,    -- true when discord_id could not be matched
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('csv', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clan_members_status
  ON clan_list_members(status);

CREATE INDEX IF NOT EXISTS idx_clan_members_discord_id
  ON clan_list_members(discord_id);

CREATE INDEX IF NOT EXISTS idx_clan_members_uid
  ON clan_list_members(uid);

CREATE INDEX IF NOT EXISTS idx_clan_members_promote
  ON clan_list_members(promote_eligible);
