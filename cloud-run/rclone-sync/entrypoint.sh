#!/bin/sh

# Check if the RCLONE_CONFIG environment variable is set
if [ -z "$RCLONE_CONFIG" ]; then
  echo "RCLONE_CONFIG environment variable is missing."
  exit 1
fi

echo "$RCLONE_CONFIG" > /rclone.conf

rclone sync r2:audiobookcovers-v4 gdrive:Audiobook\ Covers --config=/rclone.conf --transfers 10 --checkers 25 -v --stats-one-line --fast-list --size-only
