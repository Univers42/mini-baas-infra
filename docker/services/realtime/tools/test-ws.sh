#!/usr/bin/env bash
# File: docker/services/realtime/tools/test-ws.sh
# Description: Basic WebSocket connectivity test against the Realtime service
# Usage: ./test-ws.sh
set -euo pipefail

WS_URL="${WS_URL:-ws://localhost:4000/socket/websocket}"

echo "Testing WebSocket connection to ${WS_URL} …"

if command -v wscat &>/dev/null; then
  echo '{"topic":"phoenix","event":"heartbeat","payload":{},"ref":"1"}' \
    | wscat -c "${WS_URL}" --wait 3
elif command -v curl &>/dev/null; then
  curl -i -N \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
    "${WS_URL}" &
  WS_PID=$!
  sleep 3
  kill "${WS_PID}" 2>/dev/null || true
else
  echo "ERROR: Neither wscat nor curl found. Install one of them."
  exit 1
fi

echo "WebSocket test complete."
