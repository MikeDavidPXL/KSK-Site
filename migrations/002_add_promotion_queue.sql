-- Migration: Add promotion_queue table for queued promotion workflow
-- Date: 2026-02-25

-- Create promotion_queue table
CREATE TABLE promotion_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES clan_list_members(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  discord_name TEXT NOT NULL,
  ign TEXT NOT NULL,
  uid TEXT NOT NULL,
  from_rank TEXT NOT NULL,
  to_rank TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'confirmed', 'processed', 'failed', 'removed')),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by TEXT,
  error TEXT
);

-- Create indexes for efficient querying
CREATE INDEX idx_promotion_queue_status ON promotion_queue(status);
CREATE INDEX idx_promotion_queue_member_id ON promotion_queue(member_id);
CREATE INDEX idx_promotion_queue_created_at ON promotion_queue(created_at DESC);

-- Create partial unique index to prevent duplicate active queue items per member
CREATE UNIQUE INDEX idx_promotion_queue_one_active_per_member 
  ON promotion_queue(member_id) 
  WHERE status IN ('queued', 'confirmed');

-- Add comment for clarity
COMMENT ON TABLE promotion_queue IS 'Queue for pending promotion candidates awaiting staff confirmation before role assignment and announcement';
COMMENT ON COLUMN promotion_queue.status IS 'Workflow state: queued (waiting), confirmed (staff approved), processed (roles applied), failed (error), removed (cancelled)';
COMMENT ON COLUMN promotion_queue.discord_id IS 'Discord user ID for role assignment - must exist for processing';
