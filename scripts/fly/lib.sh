#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FLY_DIR="${ROOT_DIR}/deploy/fly"
SERVICES_FILE="${FLY_DIR}/services.env"
FLY_APP_PREFIX="${FLY_APP_PREFIX:-mini-baas}"
FLY_ORG="${FLY_ORG:-personal}"
FLY_REGION="${FLY_REGION:-cdg}"

require_flyctl() {
  command -v flyctl >/dev/null 2>&1 || {
    echo "flyctl is required. Install it from https://fly.io/docs/flyctl/install/" >&2
    exit 1
  }
}

service_entry() {
  local service="$1"
  grep -E "^${service}=" "${SERVICES_FILE}" || true
}

service_config() {
  local service="$1" entry value
  entry="$(service_entry "$service")"
  [[ -n "$entry" ]] || { echo "Unknown service: ${service}" >&2; exit 1; }
  value="${entry#*=}"
  printf '%s/%s' "${FLY_DIR}" "${value%%:*}"
}

service_suffix() {
  local service="$1" entry value
  entry="$(service_entry "$service")"
  [[ -n "$entry" ]] || { echo "Unknown service: ${service}" >&2; exit 1; }
  value="${entry#*=}"
  printf '%s' "${value#*:}"
}

service_app() {
  local service="$1"
  printf '%s-%s' "${FLY_APP_PREFIX}" "$(service_suffix "$service")"
}

all_services() {
  grep -Ev '^(#|$)' "${SERVICES_FILE}" | cut -d= -f1
}

selected_services() {
  if [[ $# -gt 0 ]]; then
    printf '%s\n' "$@"
  else
    all_services
  fi
}

create_app_if_missing() {
  local app="$1"
  if flyctl apps list --json 2>/dev/null | grep -q "\"Name\":\"${app}\""; then
    return 0
  fi
  echo "Creating Fly app: ${app} (${FLY_REGION}, org=${FLY_ORG})"
  flyctl apps create "${app}" --org "${FLY_ORG}" >/dev/null
}
