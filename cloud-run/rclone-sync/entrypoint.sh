#!/bin/sh

# Check if the RCLONE_CONFIG environment variable is set
if [ -z "$RCLONE_CONFIG" ]; then
  echo "RCLONE_CONFIG environment variable is missing."
  exit 1
fi

echo "$RCLONE_CONFIG" > /rclone.conf

rclone sync s3:com-audiobookcovers-processed gdrive:Audiobook\ Covers --config=/rclone.conf --transfers 10 -v --stats-one-line --fast-list --size-only
