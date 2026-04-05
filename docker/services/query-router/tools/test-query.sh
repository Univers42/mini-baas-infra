#!/usr/bin/env bash
# File: docker/services/query-router/tools/test-query.sh
# Description: Send a test query through the query-router service
# Usage: ./test-query.sh [database] [query]
set -euo pipefail

DATABASE="${1:-postgres}"
QUERY="${2:-SELECT 1 AS ok}"
ROUTER_URL="${ROUTER_URL:-http://localhost:3300}"

echo "Routing query to '${DATABASE}': ${QUERY}"
curl -s -X POST "${ROUTER_URL}/api/v1/query" \
  -H "Content-Type: application/json" \
  -d "{\"database\": \"${DATABASE}\", \"query\": \"${QUERY}\"}" | jq .

echo "Query test complete."
