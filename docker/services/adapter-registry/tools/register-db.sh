#!/usr/bin/env bash
# File: docker/services/adapter-registry/tools/register-db.sh
# Description: Register a new database with the adapter-registry service
# Usage: ./register-db.sh <engine> <name> <connection_string>
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <engine> <name> <connection_string>"
  echo "  engine:            postgres | mongo | trino"
  echo "  name:              human-readable database name"
  echo "  connection_string: full connection URI"
  exit 1
fi

ENGINE="$1"
NAME="$2"
CONN_STRING="$3"
REGISTRY_URL="${REGISTRY_URL:-http://localhost:3200}"

echo "Registering database '${NAME}' (${ENGINE}) …"
curl -s -X POST "${REGISTRY_URL}/api/v1/databases" \
  -H "Content-Type: application/json" \
  -d "{\"engine\": \"${ENGINE}\", \"name\": \"${NAME}\", \"connection_string\": \"${CONN_STRING}\"}" | jq .

echo "Registration complete."
