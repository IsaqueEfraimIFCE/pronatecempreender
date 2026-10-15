FROM rclone/rclone:1.75.2 AS rclone
FROM postgres:17-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY deploy/postgres/start.sh /usr/local/bin/pronatec-postgres
COPY deploy/postgres/01-security.sh /docker-entrypoint-initdb.d/01-security.sh
COPY deploy/postgres/backup-loop.sh /usr/local/bin/pronatec-backups
COPY deploy/postgres/restore-check.sh /usr/local/bin/pronatec-restore-check
RUN chmod 755 /usr/local/bin/pronatec-* /docker-entrypoint-initdb.d/01-security.sh
ENV PGDATA=/data/pgdata
ENTRYPOINT ["/usr/local/bin/pronatec-postgres"]
