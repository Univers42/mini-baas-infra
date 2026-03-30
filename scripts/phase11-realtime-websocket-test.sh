#!/bin/bash

# Phase 11: Realtime WebSocket Communication
# Validates WebSocket upgrade via Kong proxy and real-time event channels

BASE_URL="${BASE_URL:-http://localhost:8000}"
TIMEOUT="${TIMEOUT:-15}"
APIKEY="${APIKEY:-public-anon-key}"
TMPDIR="${TMPDIR:-$(mktemp -d /tmp/phase11_realtime.XXXXXX)}"

mkdir -p "$TMPDIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./test-ui.sh
source "$SCRIPT_DIR/test-ui.sh"

pass() {
    local name="$1"
    echo -e "${GREEN}[PASS]${NC} $name"
    ((TESTS_PASSED++))
}

fail() {
    local name="$1"
    local details="$2"
    echo -e "${RED}[FAIL]${NC} $name - $details"
    ((TESTS_FAILED++))
}

assert_code() {
    local name="$1"
    local expected="$2"
    local actual="$3"

    if [[ "$actual" == "$expected" ]]; then
        pass "$name"
    else
        fail "$name" "expected $expected, got $actual"
    fi
}

assert_not_codes() {
    local name="$1"
    local actual="$2"
    shift 2
    local blocked=("$@")

    for disallowed in "${blocked[@]}"; do
        if [[ "$actual" == "$disallowed" ]]; then
            fail "$name" "unexpected HTTP $actual"
            return
        fi
    done

    if [[ "$actual" =~ ^5 ]]; then
        fail "$name" "unexpected server error $actual"
    else
        pass "$name"
    fi
}

ui_banner "Phase 11 Test Suite" "Realtime WebSocket Communication"
ui_kv "Gateway URL" "$BASE_URL"
ui_kv "Realtime endpoint" "$BASE_URL/realtime/v1"
ui_hr

ui_step "Test 1: WebSocket upgrade endpoint accessibility"
# Test that the realtime endpoint responds to HTTP (upgrade path)
WS_UPGRADE_CODE=$(curl -sS -o "$TMPDIR/ws-upgrade.txt" -w '%{http_code}' \
    -X GET "$BASE_URL/realtime/v1?apikey=$APIKEY" \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    --max-time "$TIMEOUT" 2>/dev/null || echo "000")
# Endpoint should not be missing/auth-failed/connection-failed.
assert_not_codes "WebSocket endpoint exists" "$WS_UPGRADE_CODE" "000" "401" "404"

ui_step "Test 2: WebSocket rejects missing API key"
MISSING_KEY_CODE=$(curl -sS -o "$TMPDIR/ws-nokey.txt" -w '%{http_code}' \
    -X GET "$BASE_URL/realtime/v1" \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    --max-time "$TIMEOUT" 2>/dev/null || echo "000")
assert_code "Missing API key rejected" "401" "$MISSING_KEY_CODE"

ui_step "Test 3: WebSocket accepts valid API key parameter"
VALID_KEY_CODE=$(curl -sS -o "$TMPDIR/ws-validkey.txt" -w '%{http_code}' \
    -X GET "$BASE_URL/realtime/v1?apikey=$APIKEY" \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    --max-time "$TIMEOUT" 2>/dev/null || echo "000")
# Valid key should not be rejected or route-missing.
assert_not_codes "Valid API key accepted" "$VALID_KEY_CODE" "000" "401" "404"

ui_step "Test 4: WebSocket with JWT token as query parameter"
# First get a JWT token
EMAIL="wstest_$(date +%s)@example.com"
PASS='TestPass123!'

SIGNUP_HTTP=$(curl -sS -o "$TMPDIR/ws-signup.json" -w '%{http_code}' \
    -X POST "$BASE_URL/auth/v1/signup" \
    -H 'Content-Type: application/json' \
    -H "apikey: $APIKEY" \
    --max-time "$TIMEOUT" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" 2>/dev/null || echo "000")

JWT_TOKEN=""
if [[ "$SIGNUP_HTTP" == "200" ]]; then
    LOGIN_HTTP=$(curl -sS -o "$TMPDIR/ws-login.json" -w '%{http_code}' \
        -X POST "$BASE_URL/auth/v1/token?grant_type=password" \
        -H 'Content-Type: application/json' \
        -H "apikey: $APIKEY" \
        --max-time "$TIMEOUT" \
        -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" 2>/dev/null || echo "000")
    
    if [[ "$LOGIN_HTTP" == "200" ]]; then
        JWT_TOKEN=$(jq -r '.access_token // empty' "$TMPDIR/ws-login.json" 2>/dev/null || true)
    fi
fi

if [[ -n "$JWT_TOKEN" ]]; then
    # WebSocket with JWT as query parameter (common pattern for realtime)
    # Using URL-safe base64 encoding of JWT token for parameter
    JWT_WS_CODE=$(curl -sS -o "$TMPDIR/ws-jwt.txt" -w '%{http_code}' \
        -X GET "$BASE_URL/realtime/v1?apikey=$APIKEY&jwt=$JWT_TOKEN" \
        -H "Upgrade: websocket" \
        -H "Connection: Upgrade" \
        --max-time "$TIMEOUT" 2>/dev/null || echo "000")
    
    if [[ "$JWT_WS_CODE" != "401" && "$JWT_WS_CODE" != "404" ]]; then
        pass "WebSocket with JWT token as query parameter"
    else
        fail "WebSocket with JWT token as query parameter" "got $JWT_WS_CODE"
    fi
else
    fail "WebSocket with JWT token as query parameter" "could not obtain JWT token"
fi

ui_step "Test 5: Realtime rate limiting applied"
# Validate that realtime responses expose rate-limit headers from Kong.
RATE_HEADERS=$(curl -sS -i -X GET "$BASE_URL/realtime/v1?apikey=$APIKEY" \
    --max-time 3 2>/dev/null | head -30)

if echo "$RATE_HEADERS" | grep -qi "RateLimit-Limit\|X-RateLimit-Limit"; then
    pass "Rate limiting headers present on realtime route"
else
    fail "Rate limiting headers present on realtime route" "missing RateLimit-Limit headers"
fi

ui_step "Test 6: Realtime with multiple query params"
MULTIQUERY_CODE=$(curl -sS -o "$TMPDIR/ws-multiquery.txt" -w '%{http_code}' \
    -X GET "$BASE_URL/realtime/v1?apikey=$APIKEY&channel=public&token=$JWT_TOKEN" \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    --max-time "$TIMEOUT" 2>/dev/null || echo "000")

assert_not_codes "WebSocket accepts multiple query parameters" "$MULTIQUERY_CODE" "000" "401" "404"

ui_hr
ui_summary "$TESTS_PASSED" "$TESTS_FAILED" "Phase 11 realtime tests passed!" "Phase 11 realtime tests failed"

exit $TESTS_FAILED
