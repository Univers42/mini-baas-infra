#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[ci-local] Repository: $ROOT_DIR"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[ci-local] Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd bash
require_cmd docker
require_cmd make
require_cmd curl

if ! docker compose version >/dev/null 2>&1; then
  echo "[ci-local] Docker Compose plugin is required." >&2
  exit 1
fi

RUN_SHELLCHECK=1
if ! command -v shellcheck >/dev/null 2>&1; then
  RUN_SHELLCHECK=0
  echo "[ci-local] shellcheck is not installed; skipping shellcheck step." >&2
  echo "[ci-local] Install shellcheck to fully mirror CI shell-checks job." >&2
fi

cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]]; then
    mkdir -p artifacts
    echo "[ci-local] Capturing compose diagnostics to artifacts/..."
    docker compose ps > artifacts/ci-local-compose-ps.txt 2>/dev/null || true
    docker compose logs --no-color > artifacts/ci-local-compose-logs.txt 2>/dev/null || true
  fi
  echo "[ci-local] Tearing down stack..."
  make compose-down-volumes || true
}

trap cleanup EXIT

echo "[ci-local] Running shell syntax checks..."
while IFS= read -r -d '' file; do
  bash -n "$file"
done < <(find scripts -type f -name '*.sh' -print0)

if [[ "$RUN_SHELLCHECK" == "1" ]]; then
  echo "[ci-local] Running shellcheck..."
  while IFS= read -r -d '' file; do
    shellcheck -S error -e SC1091 "$file"
  done < <(find scripts -type f -name '*.sh' -print0)
fi

echo "[ci-local] Generating .env..."
FORCE=1 bash ./scripts/generate-env.sh .env

echo "[ci-local] Starting compose stack..."
make compose-up

echo "[ci-local] Waiting for gateway health..."
for _ in $(seq 1 60); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:8000/auth/v1/health -H 'apikey: public-anon-key' || true)"
  if [[ "$code" == "200" ]]; then
    echo "[ci-local] Gateway health check passed"
    break
  fi
  sleep 2
done

if [[ "${code:-000}" != "200" ]]; then
  echo "[ci-local] Gateway health check failed" >&2
  exit 1
fi

echo "[ci-local] Running integration tests..."
FORCE_COLORS=0 make tests

echo "[ci-local] CI local run completed successfully"