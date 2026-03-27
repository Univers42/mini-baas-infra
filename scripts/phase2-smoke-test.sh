#!/bin/bash

# Phase 2 Smoke Test: Kong gateway security controls
# Validates key-auth enforcement and storage request-size-limiting

BASE_URL="${BASE_URL:-http://localhost:8000}"
TIMEOUT="${TIMEOUT:-10}"
PUBLIC_APIKEY="${PUBLIC_APIKEY:-public-anon-key}"
INVALID_APIKEY="${INVALID_APIKEY:-invalid-key}"
RUN_RATE_LIMIT_TEST="${RUN_RATE_LIMIT_TEST:-false}"
RATE_LIMIT_BURST="${RATE_LIMIT_BURST:-70}"
TMPDIR="/tmp/phase2_smoke"

mkdir -p "$TMPDIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

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

echo "========================================"
echo "Phase 2 Smoke Test Suite"
echo "========================================"
echo "Base URL: $BASE_URL"
echo "Public API key: $PUBLIC_APIKEY"
echo "Run rate limit stress test: $RUN_RATE_LIMIT_TEST"
echo ""

# 1) Missing apikey must be blocked by Kong key-auth
MISSING_CODE=$(curl -sS -o "$TMPDIR/no_apikey.json" -w '%{http_code}' \
  -X GET "$BASE_URL/auth/v1/health" \
  --max-time "$TIMEOUT" 2>/dev/null || echo "000")

if [[ "$MISSING_CODE" == "401" ]]; then
    pass "Missing apikey rejected on /auth/v1"
else
    fail "Missing apikey rejected on /auth/v1" "expected 401, got $MISSING_CODE"
fi

# 2) Invalid apikey must be blocked by Kong key-auth
INVALID_CODE=$(curl -sS -o "$TMPDIR/invalid_apikey.json" -w '%{http_code}' \
  -X GET "$BASE_URL/auth/v1/health" \
  -H "apikey: $INVALID_APIKEY" \
  --max-time "$TIMEOUT" 2>/dev/null || echo "000")

if [[ "$INVALID_CODE" == "401" ]]; then
    pass "Invalid apikey rejected on /auth/v1"
else
    fail "Invalid apikey rejected on /auth/v1" "expected 401, got $INVALID_CODE"
fi

# 3) Valid apikey must pass gateway auth and reach upstream
VALID_CODE=$(curl -sS -o "$TMPDIR/valid_apikey.json" -w '%{http_code}' \
  -X GET "$BASE_URL/auth/v1/health" \
  -H "apikey: $PUBLIC_APIKEY" \
  --max-time "$TIMEOUT" 2>/dev/null || echo "000")

if [[ "$VALID_CODE" == "200" ]]; then
    pass "Valid apikey accepted on /auth/v1"
else
    fail "Valid apikey accepted on /auth/v1" "expected 200, got $VALID_CODE"
fi

# 4) Storage route request-size-limiting should reject >10MB payload
# Build a deterministic payload once to avoid memory spikes during curl.
LARGE_PAYLOAD="$TMPDIR/payload_11mb.bin"
if [[ ! -f "$LARGE_PAYLOAD" ]]; then
    dd if=/dev/zero of="$LARGE_PAYLOAD" bs=1M count=11 status=none
fi

SIZE_CODE=$(curl -sS -o "$TMPDIR/storage_size_limit.json" -w '%{http_code}' \
  -X POST "$BASE_URL/storage/v1/phase2-size-check" \
  -H "apikey: $PUBLIC_APIKEY" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary "@$LARGE_PAYLOAD" \
  --max-time "$TIMEOUT" 2>/dev/null || echo "000")

if [[ "$SIZE_CODE" == "413" ]]; then
    pass "Storage payload >10MB rejected with 413"
else
    fail "Storage payload >10MB rejected with 413" "expected 413, got $SIZE_CODE"
fi

# 5) Optional stress test for route rate-limiting (disabled by default)
if [[ "$RUN_RATE_LIMIT_TEST" == "true" ]]; then
    echo -e "${YELLOW}[INFO]${NC} Running rate-limit burst test with $RATE_LIMIT_BURST requests..."
    HIT_429=false

    for i in $(seq 1 "$RATE_LIMIT_BURST"); do
        code=$(curl -sS -o /dev/null -w '%{http_code}' \
          -X GET "$BASE_URL/auth/v1/health" \
          -H "apikey: $PUBLIC_APIKEY" \
          --max-time "$TIMEOUT" 2>/dev/null || echo "000")

        if [[ "$code" == "429" ]]; then
            HIT_429=true
            break
        fi
    done

    if [[ "$HIT_429" == "true" ]]; then
        pass "Rate limit triggers 429 under burst traffic"
    else
        fail "Rate limit triggers 429 under burst traffic" "no 429 seen in $RATE_LIMIT_BURST requests"
    fi
else
    echo -e "${YELLOW}[SKIP]${NC} Rate-limit burst test skipped (set RUN_RATE_LIMIT_TEST=true to enable)"
fi

echo ""
echo "========================================"
echo "Summary"
echo "========================================"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo "========================================"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}Phase 2 gateway controls validated.${NC}"
    exit 0
else
    echo -e "${RED}Phase 2 gateway controls have failures.${NC}"
    exit 1
fi
