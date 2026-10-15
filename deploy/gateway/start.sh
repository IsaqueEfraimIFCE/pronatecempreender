#!/bin/sh
set -eu
umask 077
: "${DRIVE_TOKEN_B64:?Google authorization is required}"
: "${S3_ACCESS_KEY_ID:?S3 authentication is required}"
: "${S3_SECRET_ACCESS_KEY:?S3 authentication is required}"
: "${DRIVE_ROOT_FOLDER_ID:?Dedicated Drive folder is required}"
mkdir -p /data/config
chown gateway:gateway /data/config
# Refresh tokens survive access-token expiration; rclone refreshes automatically.
printf '[drive]\ntype = drive\nscope = drive\nroot_folder_id = %s\ntoken = ' \
  "$DRIVE_ROOT_FOLDER_ID" > /data/config/rclone.conf
printf '%s' "$DRIVE_TOKEN_B64" | base64 -d >> /data/config/rclone.conf
printf '\n' >> /data/config/rclone.conf
chown gateway:gateway /data/config/rclone.conf
chmod 600 /data/config/rclone.conf
unset DRIVE_TOKEN_B64 DRIVE_TOKEN
RCLONE_AUTH_KEY=$(printf '"%s,%s"' "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY")
export RCLONE_AUTH_KEY
export RCLONE_CONFIG=/data/config/rclone.conf
exec su-exec gateway rclone serve s3 drive: \
  --addr :8080 --vfs-cache-mode off --allow-origin https://pronatec-empreender.fly.dev \
  --response-header 'Access-Control-Expose-Headers: ETag' \
  --buffer-size 0 --drive-chunk-size 8M --transfers 2 \
  --multipart-max-uploads 30 --multipart-expiry 24h \
  --multipart-streaming-buffer-limit 16M --multipart-streaming-buffer-total 64M \
  --metadata-max-objects 2000 --log-level ERROR
