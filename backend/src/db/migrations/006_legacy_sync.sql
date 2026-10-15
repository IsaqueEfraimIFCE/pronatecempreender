-- State of the scheduled Google Sheets -> PostgreSQL synchronisation, one row per source.
CREATE TABLE IF NOT EXISTS legacy_sync (
 source text PRIMARY KEY,
 sheet_id text NOT NULL,
 content_hash text,
 db_marker text,
 status text NOT NULL DEFAULT 'pending',
 last_checked_at timestamptz,
 last_synced_at timestamptz,
 sheet_rows integer,
 stored_rows integer,
 duplicates integer,
 unmapped jsonb NOT NULL DEFAULT '[]'::jsonb,
 message text,
 duration_ms integer
);
