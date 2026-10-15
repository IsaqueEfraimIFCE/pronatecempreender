#!/bin/sh
set -eu
umask 077
: "${POSTGRES_TLS_CERT:?Database TLS certificate is required}"
: "${POSTGRES_TLS_KEY:?Database TLS private key is required}"
install -d -m 700 -o postgres -g postgres /data/tls
printf '%s' "$POSTGRES_TLS_CERT" | base64 -d > /data/tls/server.crt
printf '%s' "$POSTGRES_TLS_KEY" | base64 -d > /data/tls/server.key
chown postgres:postgres /data/tls/server.crt /data/tls/server.key
chmod 600 /data/tls/server.crt /data/tls/server.key
unset POSTGRES_TLS_CERT POSTGRES_TLS_KEY
/usr/local/bin/pronatec-backups &
exec /usr/local/bin/docker-entrypoint.sh postgres \
  -c listen_addresses='*' -c ssl=on \
  -c ssl_cert_file=/data/tls/server.crt -c ssl_key_file=/data/tls/server.key \
  -c password_encryption=scram-sha-256 -c max_connections=60 \
  -c shared_buffers=128MB -c log_statement=none \
  -c log_min_error_statement=panic
