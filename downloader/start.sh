#!/bin/sh

# Exit immediately if any command fails, ensuring the script is robust.
set -e

# Check if the TS_AUTH_KEY environment variable is set and not empty.
if [ -n "$TS_AUTH_KEY" ]; then
  echo "TS_AUTH_KEY detected. Starting Tailscale..."

  # 1. Start the Tailscale daemon in the background.
  # The '&' is crucial to allow the script to continue.
  containerboot &

  until tailscale status &> /dev/null
  do
    echo "Tailscale is not connected"
    sleep 0.05
  done
  echo "Tailscale is up and has an IP: $(tailscale ip)"
  echo "Tailscale started successfully."

else
  # If the key does not exist, print a message and do nothing else.
  echo "TS_AUTH_KEY not set. Skipping Tailscale."
fi


cd /app
# 'exec' replaces the shell process with the Deno process. This is a best practice
# ensuring your app receives signals correctly from the container runtime (e.g., for shutdowns).
exec deno task start