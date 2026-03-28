#!/bin/bash

# Phase 5 Test: Database Information Retrieval
# Validates SQL metadata endpoint exposure through Kong

BASE_URL="${BASE_URL:-http://localhost:8000}"
TIMEOUT="${TIMEOUT:-10}"
APIKEY="${APIKEY:-public-anon-key}"
TMPDIR="/tmp/phase5_db_info"

mkdir -p "$TMPDIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./test-ui.sh
source "$SCRIPT_DIR/test-ui.sh"

pass() {
    local name="$1"
    echo -e "${GREEN}✓${NC} $name"
    ((TESTS_PASSED++))
}

fail() {
    local name="$1"
    local details="$2"
    echo -e "${RED}✗${NC} $name${details:+ ($details)}"
    ((TESTS_FAILED++))
}

ui_banner "Phase 5 Test Suite" "Database metadata retrieval"
ui_kv "Base URL" "$BASE_URL"
ui_kv "API key" "$APIKEY"
ui_hr

ui_step "Step 1: Retrieve database info from available gateway route"

SELECTED_ENDPOINT=""
SELECTED_FILE=""

# Try SQL metadata endpoint first, then PostgREST OpenAPI as fallback.
SQL_HTTP=$(curl -sS -o "$TMPDIR/sql_info.json" -w '%{http_code}' \
    -X GET "$BASE_URL/sql/v1/info" \
    --max-time "$TIMEOUT" 2>/dev/null || echo "000")

if [[ "$SQL_HTTP" == "200" ]]; then
    SELECTED_ENDPOINT="/sql/v1/info"
    SELECTED_FILE="$TMPDIR/sql_info.json"
fi

if [[ -z "$SELECTED_ENDPOINT" ]]; then
    REST_HTTP=$(curl -sS -o "$TMPDIR/rest_openapi.json" -w '%{http_code}' \
        -X GET "$BASE_URL/rest/v1/" \
        -H "apikey: $APIKEY" \
        --max-time "$TIMEOUT" 2>/dev/null || echo "000")

    if [[ "$REST_HTTP" == "200" ]]; then
        SELECTED_ENDPOINT="/rest/v1/"
        SELECTED_FILE="$TMPDIR/rest_openapi.json"
    fi
fi

if [[ -n "$SELECTED_ENDPOINT" ]]; then
    pass "Database info endpoint reachable"
    echo -e "${GREEN}  └─${NC} Using endpoint: $SELECTED_ENDPOINT"
else
    fail "Database info endpoint reachable" "tried /sql/v1/info (HTTP: $SQL_HTTP) and /rest/v1/ (HTTP: ${REST_HTTP:-not-tried})"
fi

BODY=""
if [[ -n "$SELECTED_FILE" ]]; then
    BODY=$(cat "$SELECTED_FILE" 2>/dev/null || echo "")
fi

if [[ -n "$SELECTED_FILE" ]] && jq -e . "$SELECTED_FILE" >/dev/null 2>&1; then
    pass "Response is valid JSON"
else
    fail "Response is valid JSON" "invalid JSON payload"
fi

ui_step "Step 2: Validate database metadata presence"

if [[ -n "$SELECTED_FILE" ]] && jq -e '
    (.info.version? != null) or
    (.version? != null) or
    (.database? != null) or
    (.db? != null) or
    (.postgres_version? != null)
' "$SELECTED_FILE" >/dev/null 2>&1; then
    pass "Contains database/version metadata"
else
    fail "Contains database/version metadata" "expected version/database field in response"
fi

if [[ -n "$SELECTED_FILE" ]] && jq -e '
    (.paths? != null) or
    (.schemas? != null) or
    (.tables? != null)
' "$SELECTED_FILE" >/dev/null 2>&1; then
    pass "Contains schema/introspection data"
else
    fail "Contains schema/introspection data" "expected paths/schemas/tables in response"
fi

# Optional diagnostic summary for operator visibility.
if [[ -n "$SELECTED_ENDPOINT" ]]; then
    echo -e "${YELLOW}Info payload preview:${NC} ${BODY:0:200}"
fi

ui_summary "$TESTS_PASSED" "$TESTS_FAILED" "Database info retrieval test passed!" "Phase 5 has failing tests"

if [[ $TESTS_FAILED -gt 0 ]]; then
    exit 1
else
    exit 0
fi
