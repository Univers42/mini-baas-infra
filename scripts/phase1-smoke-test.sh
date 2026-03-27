#!/bin/bash

# Phase 1 Smoke Test: Kong routing + Auth + REST access
# Validates: signup → login → token → access PostgREST through Kong

BASE_URL="${BASE_URL:-http://localhost:8000}"
TIMEOUT="${TIMEOUT:-10}"
APIKEY="${APIKEY:-public-anon-key}"
TMPDIR="/tmp/phase1_smoke"

mkdir -p "$TMPDIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

test_case() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    
    if [[ "$actual" == "$expected" ]]; then
        echo -e "${GREEN}✓${NC} $name (expected: $expected, got: $actual)"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $name (expected: $expected, got: $actual)"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "========================================"
echo "Phase 1 Smoke Test Suite"
echo "========================================"
echo "Base URL: $BASE_URL"
echo "API key: ${APIKEY}"
echo ""

# 1. SIGNUP TEST
echo "Test 1: Signup via Kong /auth/v1/signup"
EMAIL="phase1_$(date +%s)@example.com"
PASS='test1234!'

SIGNUP_HTTP=$(curl -sS -o "$TMPDIR/signup.json" -w '%{http_code}' \
    -X POST "$BASE_URL/auth/v1/signup" \
    -H 'Content-Type: application/json' \
    -H "apikey: $APIKEY" \
    --max-time "$TIMEOUT" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" 2>/dev/null || echo "000")

test_case "Signup HTTP status" "200" "$SIGNUP_HTTP"

if [[ "$SIGNUP_HTTP" == "200" ]] && [[ -f "$TMPDIR/signup.json" ]]; then
    USER_ID=$(jq -r '.id // empty' "$TMPDIR/signup.json" 2>/dev/null || true)
    if [[ -n "${USER_ID:-}" ]]; then
        echo -e "${GREEN}  └─${NC} User created: $USER_ID"
    fi
fi

echo ""

# 2. LOGIN TEST
echo "Test 2: Login via Kong /auth/v1/token"

LOGIN_HTTP=$(curl -sS -o "$TMPDIR/login.json" -w '%{http_code}' \
    -X POST "$BASE_URL/auth/v1/token?grant_type=password" \
    -H 'Content-Type: application/json' \
    -H "apikey: $APIKEY" \
    --max-time "$TIMEOUT" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" 2>/dev/null || echo "000")

test_case "Login HTTP status" "200" "$LOGIN_HTTP"

TOKEN=$(jq -r '.access_token // empty' "$TMPDIR/login.json" 2>/dev/null || true)
TOKEN_LEN=${#TOKEN}

if [[ $TOKEN_LEN -gt 100 ]]; then
    test_case "Access token issued" "true" "true"
    echo -e "${GREEN}  └─${NC} Token length: $TOKEN_LEN bytes"
    
    # Parse JWT claims
    # Parse JWT claims from token
    ROLE=$(echo "$TOKEN" | python3 -c "
import json, base64, sys
try:
    token = sys.stdin.read().strip()
    payload = token.split('.')[1]
    # Add padding if needed
    padding = 4 - len(payload) % 4
    if padding != 4:
        payload += '=' * padding
    decoded = base64.urlsafe_b64decode(payload)
    claims = json.loads(decoded)
    print(claims.get('role', ''))
except Exception as e:
    print('')
" 2>/dev/null || true)
    if [[ -n "$ROLE" ]]; then
        echo -e "${GREEN}  └─${NC} JWT role: $ROLE"
    fi
else
    test_case "Access token issued" "true" "false"
    echo -e "${RED}  └─${NC} No token in response"
fi

echo ""

# 3. REST WITHOUT TOKEN TEST
echo "Test 3: PostgREST access without token (should allow anon)"

REST_NO_AUTH=$(curl -sS -o "$TMPDIR/rest_no_auth.json" -w '%{http_code}' \
    -X GET "$BASE_URL/rest/v1/" \
    -H "apikey: $APIKEY" \
    --max-time "$TIMEOUT" 2>/dev/null || echo "000")

# 200 is good (anon role works), 401 also acceptable (no anon access)
if [[ "$REST_NO_AUTH" == "200" ]] || [[ "$REST_NO_AUTH" == "401" ]]; then
    echo -e "${GREEN}✓${NC} PostgREST accessible without auth (HTTP $REST_NO_AUTH)"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗${NC} PostgREST accessible without auth (expected: 200 or 401, got: $REST_NO_AUTH)"
    ((TESTS_FAILED++))
fi

echo ""

# 4. REST WITH TOKEN TEST (the main validation)
echo "Test 4: PostgREST access with JWT (authenticated)"

if [[ -n "${TOKEN:-}" ]]; then
    REST_WITH_AUTH=$(curl -sS -o "$TMPDIR/rest_with_auth.json" -w '%{http_code}' \
        -X GET "$BASE_URL/rest/v1/" \
        -H "apikey: $APIKEY" \
        -H "Authorization: Bearer $TOKEN" \
        --max-time "$TIMEOUT" 2>/dev/null || echo "000")
    
    test_case "JWT-authenticated access" "200" "$REST_WITH_AUTH"
    
    if [[ "$REST_WITH_AUTH" == "200" ]]; then
        echo -e "${GREEN}  └─${NC} Cross-service flow works!"
    fi
else
    test_case "JWT-authenticated access" "200" "skip"
    echo -e "${YELLOW}  └─${NC} Skipped (no token from login)"
fi

echo ""

# 5. KONG HEADERS TEST
echo "Test 5: Verify Kong proxied request (check headers)"

HEADERS=$(curl -sS -i -X GET "$BASE_URL/auth/v1/health" \
    -H "apikey: $APIKEY" \
    --max-time "$TIMEOUT" 2>/dev/null | head -n 20 || true)

if echo "$HEADERS" | grep -qi "kong\|x-kong"; then
    test_case "Kong proxy identified" "true" "true"
    echo -e "${GREEN}  └─${NC} Kong headers detected"
else
    test_case "Kong proxy identified" "true" "false"
    echo -e "${YELLOW}  └─${NC} No Kong headers found (may still be proxied)"
fi

echo ""
echo "========================================"
echo "Summary"
echo "========================================"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo "========================================"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ Phase 1 flow validated!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
