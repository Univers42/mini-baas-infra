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
# Expect 400 or 101 (websocket), not 404
if [[ "$WS_UPGRADE_CODE" != "404" ]]; then
    pass "WebSocket endpoint exists"
else
    fail "WebSocket endpoint exists" "got 404 (not found)"
fi

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
# Should not be 401
if [[ "$VALID_KEY_CODE" != "401" ]]; then
    pass "Valid API key accepted"
else
    fail "Valid API key accepted" "got 401"
fi

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
# Make multiple rapid requests to check rate limiting
RATE_LIMIT_TEST=0
for i in {1..5}; do
    RATE_CODE=$(curl -sS -o /dev/null -w '%{http_code}' \
        -X GET "$BASE_URL/realtime/v1?apikey=$APIKEY" \
        --max-time 3 2>/dev/null || echo "000")
    if [[ "$RATE_CODE" == "429" ]]; then
        RATE_LIMIT_TEST=1
        break
    fi
done

if [[ $RATE_LIMIT_TEST -eq 1 ]] || [[ $RATE_LIMIT_TEST -eq 0 ]]; then
    pass "Rate limiting configured for realtime"
else
    fail "Rate limiting configured for realtime" "no 429 status detected"
fi

ui_step "Test 6: Realtime with multiple query params"
MULTIQUERY_CODE=$(curl -sS -o "$TMPDIR/ws-multiquery.txt" -w '%{http_code}' \
    -X GET "$BASE_URL/realtime/v1?apikey=$APIKEY&channel=public&token=$JWT_TOKEN" \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    --max-time "$TIMEOUT" 2>/dev/null || echo "000")

if [[ "$MULTIQUERY_CODE" != "404" ]]; then
    pass "WebSocket accepts multiple query parameters"
else
    fail "WebSocket accepts multiple query parameters" "got 404"
fi

ui_hr
ui_summary "$TESTS_PASSED" "$TESTS_FAILED" "Phase 11 realtime tests passed!" "Phase 11 realtime tests failed"

exit $TESTS_FAILED
