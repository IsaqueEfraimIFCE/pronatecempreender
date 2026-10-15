#!/bin/sh
set -eu
chown clamav:clamav /var/lib/clamav
chmod 750 /var/lib/clamav
if ! find /var/lib/clamav -maxdepth 1 -name 'daily.c[lv]d' | grep -q .; then
  freshclam --config-file=/etc/clamav/freshclam.conf
fi
freshclam --daemon --foreground=true --config-file=/etc/clamav/freshclam.conf &
updater=$!
clamd --config-file=/etc/clamav/clamd.conf &
scanner=$!
trap 'kill "$scanner" "$updater" 2>/dev/null || true' TERM INT EXIT
wait "$scanner"
