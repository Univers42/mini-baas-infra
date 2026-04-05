#!/usr/bin/env bash
# File: scripts/secrets/validate-secrets.sh
# Validate all required secrets are present and correctly formatted
# Usage: bash scripts/secrets/validate-secrets.sh [secrets_dir]

set -euo pipefail

SECRETS_DIR="${1:-./secrets}"
ERRORS=0

check_file() {
  local file="$1"
  local min_len="${2:-8}"
  local path="$SECRETS_DIR/$file"

  if [[ ! -f "$path" ]]; then
    echo "FAIL: $file is missing"
    ERRORS=$((ERRORS + 1))
    return
  fi

  local len
  len=$(wc -c < "$path" | tr -d ' ')
  if [[ "$len" -lt "$min_len" ]]; then
    echo "FAIL: $file is too short ($len < $min_len bytes)"
    ERRORS=$((ERRORS + 1))
    return
  fi

  local perms
  perms=$(stat -c '%a' "$path" 2>/dev/null || stat -f '%Lp' "$path" 2>/dev/null)
  if [[ "$perms" != "600" ]]; then
    echo "WARN: $file permissions are $perms (expected 600)"
  fi

  echo "  OK: $file ($len bytes)"
}

echo "=== mini-BaaS Secret Validator ==="
echo "Checking: $SECRETS_DIR"
echo ""

check_file "jwt_secret.txt" 32
check_file "postgres_password.txt" 16
check_file "vault_enc_key.txt" 32
check_file "kong_public_api_key.txt" 16
check_file "kong_service_api_key.txt" 24
check_file "dashboard_password.txt" 8
check_file "minio_access_key.txt" 4
check_file "minio_secret_key.txt" 16

echo ""
if [[ "$ERRORS" -gt 0 ]]; then
  echo "FAILED: $ERRORS secret(s) missing or invalid"
  echo "Run 'bash scripts/secrets/generate-secrets.sh' to fix."
  exit 1
fi

echo "All secrets validated successfully."
