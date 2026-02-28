-- Migration: Rename has_420_tag column to has_ksk_tag
-- Also update default rank from 'Private' to 'Trial Member'

ALTER TABLE clan_list_members
  RENAME COLUMN has_420_tag TO has_ksk_tag;

ALTER TABLE clan_list_members
  ALTER COLUMN rank_current SET DEFAULT 'Trial Member';
