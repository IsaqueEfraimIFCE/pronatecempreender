#!/bin/sh
set -eu
# The postgres superuser is reserved for operations, not web requests.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password APP_DB_PASSWORD
CREATE ROLE pronatec LOGIN PASSWORD :'app_password';
ALTER DATABASE pronatec OWNER TO pronatec;
SQL
# Local socket administration remains possible. Every TCP connection requires TLS.
sed -i '1i hostnossl all all ::/0 reject' "$PGDATA/pg_hba.conf"
sed -i '1i hostnossl all all 0.0.0.0/0 reject' "$PGDATA/pg_hba.conf"
