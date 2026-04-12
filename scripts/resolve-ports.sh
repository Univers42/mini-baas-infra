#!/usr/bin/env bash
# File: scripts/resolve-ports.sh
# Detects port conflicts and exports free host-port env vars.
# Usage: eval "$(./scripts/resolve-ports.sh)"  or  source <(./scripts/resolve-ports.sh)
#
# For each VAR=DEFAULT pair, checks if the default port (or the value already
# set in the environment) is free.  If not, increments until a free port is
# found.  Outputs export statements so the caller gets the resolved values.

set -euo pipefail

# ── Port map: ENV_VAR=default_port ──────────────────────────────────
PORTS=(
  WAF_HTTP_PORT=8880
  KONG_HTTP_PORT=8000
  KONG_ADMIN_PORT=8001
  PG_PORT=5432
  TRINO_PORT=8080
  MONGO_PORT=27017
  GOTRUE_PORT=9999
  POSTGREST_PORT=3002
  REALTIME_PORT=4000
  REDIS_PORT=6379
  MINIO_API_PORT=9000
  MINIO_CONSOLE_PORT=9001
  SUPAVISOR_PORT=6543
  STUDIO_PORT=3001
)

# ── Helpers ─────────────────────────────────────────────────────────
_used_ports=""  # track ports we've already claimed in this run

port_in_use() {
  local p=$1
  # Already claimed by an earlier entry in this script run
  if [[ " $_used_ports " == *" $p "* ]]; then
    return 0
  fi
  # Check if something on the host is listening
  if ss -tlnH 2>/dev/null | awk '{print $4}' | grep -qE "(:|^)${p}$"; then
    return 0
  fi
  return 1
}

find_free() {
  local p=$1
  while port_in_use "$p"; do
    ((p++))
  done
  echo "$p"
  return 0
}

# ── Main ────────────────────────────────────────────────────────────
changed=0
for entry in "${PORTS[@]}"; do
  var="${entry%%=*}"
  default="${entry#*=}"
  # Honour existing env override
  want="${!var:-$default}"
  got=$(find_free "$want")
  _used_ports="$_used_ports $got"
  if [[ "$got" != "$default" ]]; then
    echo "export ${var}=${got}"
    if [[ -t 2 ]]; then
      echo "  ⚠  ${var}: ${default} busy → ${got}" >&2
    fi
    ((changed++)) || true
  fi
done

if [[ "$changed" -eq 0 && -t 2 ]]; then
  echo "  ✓ All default ports available" >&2
fi
