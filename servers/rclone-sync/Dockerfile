FROM alpine:latest

RUN apk --no-cache add curl

RUN curl -O https://downloads.rclone.org/rclone-current-linux-amd64.zip \
    && unzip rclone-current-linux-amd64.zip \
    && mv rclone-*-linux-amd64/rclone /usr/bin \
    && chmod 755 /usr/bin/rclone \
    && rm -r rclone-*-linux-amd64 rclone-current-linux-amd64.zip

COPY entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
