#!/bin/sh
set -eu
umask 077
database="pronatec_restore_$(date +%s)"
dump="/tmp/$database.dump"
cleanup() {
  dropdb -U postgres --if-exists "$database"
  rm -f "$dump"
}
trap cleanup EXIT INT TERM
if [ "${1:-}" = '--offsite' ]; then
  export RCLONE_CONFIG_BACKUPS_TYPE=s3
  export RCLONE_CONFIG_BACKUPS_PROVIDER=Other
  export RCLONE_CONFIG_BACKUPS_ENDPOINT=https://pronatec-empreender-storage.fly.dev
  export RCLONE_CONFIG_BACKUPS_REGION=auto
  export RCLONE_CONFIG_BACKUPS_FORCE_PATH_STYLE=true
  export RCLONE_CONFIG_BACKUPS_ACCESS_KEY_ID="${BACKUP_ACCESS_KEY:?Missing backup access key}"
  export RCLONE_CONFIG_BACKUPS_SECRET_ACCESS_KEY="${BACKUP_SECRET_KEY:?Missing backup secret key}"
  latest=$(rclone lsf backups:reports/_backups/postgres/ --files-only --log-level ERROR | sort | tail -n 1)
  case "$latest" in
    ????????T??????Z.dump) ;;
    *) echo 'No valid offsite backup found' >&2; exit 1 ;;
  esac
  rclone copyto "backups:reports/_backups/postgres/$latest" "$dump" --log-level ERROR
else
  pg_dump -U postgres -d pronatec --format=custom --file="$dump"
fi
createdb -U postgres "$database"
pg_restore -U postgres --exit-on-error --no-owner --dbname="$database" "$dump"
tables=$(psql -U postgres -d "$database" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
test "$tables" -ge 8
echo "Isolated database restore passed; public tables: $tables"
