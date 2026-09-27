#!/bin/bash
# Double-click this file to open Tap Studio.
#
# The studio is served over http rather than opened as a file:// page because
# browsers refuse to load ES modules from the local filesystem.

cd "$(dirname "$0")" || exit 1
PORT=8787

# If something is already serving on the port, just open the browser.
if ! lsof -i ":$PORT" >/dev/null 2>&1; then
  echo "Starting Tap Studio on http://localhost:$PORT"
  python3 "$(dirname "$0")/serve.py" "$PORT" >/dev/null 2>&1 &
  SERVER_PID=$!
  sleep 1
else
  echo "Server already running on port $PORT"
fi

open "http://localhost:$PORT/index.html" 2>/dev/null || \
  xdg-open "http://localhost:$PORT/index.html" 2>/dev/null || \
  echo "Open http://localhost:$PORT/index.html in your browser"

echo
echo "Tap Studio is running. Close this window to stop the server."
if [ -n "$SERVER_PID" ]; then
  trap 'kill $SERVER_PID 2>/dev/null' EXIT
  wait $SERVER_PID
fi
