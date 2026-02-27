-- Migration 008: Single-use download tokens for secure pack distribution
-- Tokens expire after 5 minutes and can only be used once.

CREATE TABLE IF NOT EXISTS download_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text        NOT NULL UNIQUE,
  discord_id  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  ip_address  text
);

-- Fast lookup by token
CREATE INDEX idx_download_tokens_token ON download_tokens (token);

-- Cleanup: auto-delete tokens older than 1 hour (optional cron / manual)
-- DELETE FROM download_tokens WHERE created_at < now() - interval '1 hour';
