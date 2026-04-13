#!/usr/bin/env bash
# File: docker/services/trino/tools/query.sh
# Description: Execute a SQL query against the Trino service
# Usage: ./query.sh "SELECT 1"
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <sql-query>"
  exit 1
fi

QUERY="$1"

echo "Running Trino query: ${QUERY}"
docker compose exec trino trino --execute "${QUERY}"
