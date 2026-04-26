#!/usr/bin/env bash
# Smoke test a deployed Fly gateway.
# Usage: BAAS_URL=https://api.example.com bash scripts/fly/smoke.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
BAAS_URL="${BAAS_URL:-}"
APIKEY="${APIKEY:-}"

if [[ -z "${BAAS_URL}" ]]; then
  echo "BAAS_URL is required, e.g. BAAS_URL=https://api.example.com" >&2
  exit 1
fi

if [[ -z "${APIKEY}" && -f "${ENV_FILE}" ]]; then
  APIKEY="$(grep '^ANON_KEY=' "${ENV_FILE}" | cut -d= -f2-)"
fi

[[ -n "${APIKEY}" ]] || { echo "APIKEY or ANON_KEY in .env is required" >&2; exit 1; }

checks=(
  "/auth/v1/health"
  "/rest/v1/"
  "/mongo/v1/health/live"
  "/admin/v1/health/live"
)

for path in "${checks[@]}"; do
  printf '%-32s' "${path}"
  curl -fsS -H "apikey: ${APIKEY}" -H "Authorization: Bearer ${APIKEY}" "${BAAS_URL}${path}" >/dev/null
  echo "ok"
done
