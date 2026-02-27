-- Migration: Add Discord membership sync and restart-from-scratch fields to clan_list_members

-- Guild membership tracking
ALTER TABLE clan_list_members
  ADD COLUMN IF NOT EXISTS in_guild BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_guild_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS left_guild_at TIMESTAMPTZ;

-- Ensure archive fields exist (may already be present)
ALTER TABLE clan_list_members
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by TEXT,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- Reset/start-over tracking for members who must restart
ALTER TABLE clan_list_members
  ADD COLUMN IF NOT EXISTS reset_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reset_reason TEXT,
  ADD COLUMN IF NOT EXISTS reset_at TIMESTAMPTZ;

-- Index for efficient filtering of active vs archived members
CREATE INDEX IF NOT EXISTS idx_clan_list_members_archived
  ON clan_list_members (archived_at);

CREATE INDEX IF NOT EXISTS idx_clan_list_members_in_guild
  ON clan_list_members (in_guild);

COMMENT ON COLUMN clan_list_members.in_guild IS 'Whether member is currently in the Discord guild.';
COMMENT ON COLUMN clan_list_members.last_guild_check_at IS 'Last time guild membership was verified.';
COMMENT ON COLUMN clan_list_members.left_guild_at IS 'Timestamp when member was detected as having left the guild.';
COMMENT ON COLUMN clan_list_members.reset_required IS 'Flag indicating member must start over if they rejoin.';
COMMENT ON COLUMN clan_list_members.reset_reason IS 'Reason for reset requirement (e.g. left_guild).';
COMMENT ON COLUMN clan_list_members.reset_at IS 'When the reset flag was set.';
