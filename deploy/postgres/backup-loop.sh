#!/bin/sh
set -eu
umask 077
export RCLONE_CONFIG_BACKUPS_TYPE=s3
export RCLONE_CONFIG_BACKUPS_PROVIDER=Other
export RCLONE_CONFIG_BACKUPS_ENDPOINT=https://pronatec-empreender-storage.fly.dev
export RCLONE_CONFIG_BACKUPS_REGION=auto
export RCLONE_CONFIG_BACKUPS_FORCE_PATH_STYLE=true
export RCLONE_CONFIG_BACKUPS_ACCESS_KEY_ID="${BACKUP_ACCESS_KEY:?Missing backup access key}"
export RCLONE_CONFIG_BACKUPS_SECRET_ACCESS_KEY="${BACKUP_SECRET_KEY:?Missing backup secret key}"
install -d -m 700 -o postgres -g postgres /data/backups
# Initdb briefly runs a local-only server. Require the production listener too.
until pg_isready -h localhost -U postgres -d pronatec >/dev/null 2>&1; do sleep 5; done
while true; do
  if gosu postgres pg_dump -U postgres -d pronatec --format=custom --file=/data/backups/latest.tmp; then
    mv /data/backups/latest.tmp /data/backups/latest.dump
    if rclone copyto /data/backups/latest.dump "backups:reports/_backups/postgres/$(date -u +%Y%m%dT%H%M%SZ).dump" \
        --s3-no-check-bucket --transfers 1 --retries 3 --log-level ERROR; then
      date -u +%FT%TZ > /data/backups/last-success
      echo 'Database offsite backup completed'
      sleep 86400
    else
      echo 'Database offsite backup failed; retrying in five minutes' >&2
      sleep 300
    fi
  else
    echo 'Database dump failed; retrying in five minutes' >&2
    sleep 300
  fi
done
