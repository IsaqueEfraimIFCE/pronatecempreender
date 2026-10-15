FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    clamav-daemon clamdscan clamav-freshclam ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
COPY deploy/clamav/clamd.conf /etc/clamav/clamd.conf
COPY deploy/clamav/freshclam.conf /etc/clamav/freshclam.conf
COPY deploy/clamav/start.sh /usr/local/bin/pronatec-clamav
RUN chmod 755 /usr/local/bin/pronatec-clamav
ENTRYPOINT ["/usr/bin/tini", "-s", "-g", "--", "/usr/local/bin/pronatec-clamav"]
