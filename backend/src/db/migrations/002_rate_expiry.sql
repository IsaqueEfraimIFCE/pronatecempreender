ALTER TABLE rate_windows ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours';
CREATE INDEX IF NOT EXISTS rate_windows_expiry ON rate_windows(expires_at);
