CREATE TABLE IF NOT EXISTS reports (
 id uuid PRIMARY KEY, metadata jsonb NOT NULL, metadata_hash text NOT NULL,
 resume_hash text NOT NULL, origin_hash text NOT NULL, object_key text NOT NULL UNIQUE,
 upload_id text, status text NOT NULL CHECK(status IN ('initializing','uploading','validating','received','rejected','expired','failed')),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 104857600),
 created_at timestamptz NOT NULL DEFAULT now(), received_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 validation_lease timestamptz, attempts integer NOT NULL DEFAULT 0, error text, sha256 text
);
CREATE INDEX IF NOT EXISTS reports_processing ON reports(status,validation_lease);
CREATE INDEX IF NOT EXISTS reports_origin_created ON reports(origin_hash,created_at);
CREATE TABLE IF NOT EXISTS registration_batches (
 id uuid PRIMARY KEY, request_hash text NOT NULL, responsible jsonb NOT NULL,
 participant_count integer NOT NULL CHECK(participant_count BETWEEN 1 AND 1000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS enrollments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, batch_id uuid NOT NULL REFERENCES registration_batches(id),
 institution text NOT NULL, campus text NOT NULL, course text NOT NULL, name text NOT NULL, cpf text NOT NULL,
 email text NOT NULL, city text NOT NULL, role text NOT NULL CHECK(role IN ('Docente','Estudante')),
 identity_key text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS enrollments_batch ON enrollments(batch_id);
CREATE TABLE IF NOT EXISTS registration_groups (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, batch_id uuid NOT NULL REFERENCES registration_batches(id),
 institution text NOT NULL,campus text NOT NULL,course text NOT NULL,participant_count integer NOT NULL,
 UNIQUE(batch_id,institution,campus,course)
);
CREATE TABLE IF NOT EXISTS admin_sessions (token_hash text PRIMARY KEY,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS rate_windows (key text NOT NULL,window_id bigint NOT NULL,count integer NOT NULL,PRIMARY KEY(key,window_id));
CREATE TABLE IF NOT EXISTS audit_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,action text NOT NULL,object_id text,created_at timestamptz NOT NULL DEFAULT now());
