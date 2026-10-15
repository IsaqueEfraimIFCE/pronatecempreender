-- Data behind the legacy portal functions (CPF consultation, SETEC and Coordenação
-- dashboards) that used to be read from Google Sheets through Apps Script.
-- CPFs are stored only as keyed HMACs; contact data is never imported.
CREATE TABLE IF NOT EXISTS legacy_interested (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 cpf_hash text NOT NULL, name text NOT NULL, course text NOT NULL DEFAULT '',
 fields jsonb NOT NULL DEFAULT '{}'::jsonb,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 row_hash text NOT NULL UNIQUE, imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legacy_interested_cpf ON legacy_interested(cpf_hash,submitted_at DESC);
CREATE TABLE IF NOT EXISTS legacy_offers (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 institution text NOT NULL, campus text NOT NULL DEFAULT '', region text NOT NULL DEFAULT '',
 course text NOT NULL DEFAULT '', vacancies integer NOT NULL DEFAULT 0 CHECK(vacancies>=0),
 start_month text NOT NULL DEFAULT '',
 row_hash text NOT NULL UNIQUE, imported_at timestamptz NOT NULL DEFAULT now()
);
