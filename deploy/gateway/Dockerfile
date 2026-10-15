FROM rclone/rclone:1.75.2
USER root
RUN apk add --no-cache su-exec && adduser -D -u 10001 gateway
COPY deploy/gateway/start.sh /usr/local/bin/pronatec-gateway
RUN chmod 755 /usr/local/bin/pronatec-gateway
ENTRYPOINT ["/usr/local/bin/pronatec-gateway"]
