#!/usr/bin/env bash
# scripts/k8s-e2e-test.sh — End-to-end smoke test against K8s mini-baas
# Hits every Kong route via the gateway, validates JSON responses.
# Usage: bash scripts/k8s-e2e-test.sh [GATEWAY_URL]
set -euo pipefail

GATEWAY="${1:-http://localhost:8000}"
APIKEY="${2:-anon-key-placeholder}"

# ── Colors ──────────────────────────────────────────────────────
G='\033[0;32m' R='\033[0;31m' Y='\033[1;33m' C='\033[0;36m' B='\033[1m' D='\033[0m'
pass=0 fail=0 total=0

check() {
  local label="$1" url="$2" expect_code="${3:-200}" expect_body="${4:-}"
  total=$((total + 1))
  local code body
  body=$(curl -s --max-time 10 -o /tmp/e2e_resp.txt -w "%{http_code}" \
    -H "apikey: $APIKEY" -H "Accept: application/json" "$url" 2>/dev/null) || body="000"
  code="$body"
  body=$(cat /tmp/e2e_resp.txt 2>/dev/null || echo "")

  local ok=true
  if [ "$code" != "$expect_code" ]; then ok=false; fi
  if [ -n "$expect_body" ] && ! echo "$body" | grep -q "$expect_body"; then ok=false; fi

  if $ok; then
    pass=$((pass + 1))
    printf "  ${G}✔${D} %-35s ${D}HTTP %s${D}\n" "$label" "$code"
  else
    fail=$((fail + 1))
    printf "  ${R}✖${D} %-35s ${R}HTTP %s${D}" "$label" "$code"
    if [ -n "$expect_body" ] && ! echo "$body" | grep -q "$expect_body"; then
      printf " ${Y}(missing: %s)${D}" "$expect_body"
    fi
    printf "\n"
  fi
}

echo ""
echo -e "${B}${C}╔══════════════════════════════════════════════╗${D}"
echo -e "${B}${C}║  mini-baas  K8s  End-to-End  Test Suite      ║${D}"
echo -e "${B}${C}╚══════════════════════════════════════════════╝${D}"
echo -e "  Gateway: ${B}$GATEWAY${D}"
echo ""

# ── 1. Auth (GoTrue) ───────────────────────────────────────────
echo -e "${B}Auth (GoTrue)${D}"
check "GET /auth/v1/health" "$GATEWAY/auth/v1/health" 200 "GoTrue"

# signup with a new random user
RAND=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' ')
SIGNUP_BODY="{\"email\":\"test_${RAND}@e2e.local\",\"password\":\"Test1234!\"}"
SIGNUP_RESP=$(curl -s --max-time 10 -X POST \
  -H "apikey: $APIKEY" -H "Content-Type: application/json" \
  -d "$SIGNUP_BODY" "$GATEWAY/auth/v1/signup" 2>/dev/null)
if echo "$SIGNUP_RESP" | grep -q "access_token"; then
  total=$((total + 1)); pass=$((pass + 1))
  printf "  ${G}✔${D} %-35s ${D}signup → got access_token${D}\n" "POST /auth/v1/signup"
  ACCESS_TOKEN=$(echo "$SIGNUP_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")
else
  total=$((total + 1)); fail=$((fail + 1))
  printf "  ${R}✖${D} %-35s ${R}no access_token${D}\n" "POST /auth/v1/signup"
  ACCESS_TOKEN=""
fi
echo ""

# ── 2. REST (PostgREST) ────────────────────────────────────────
echo -e "${B}REST (PostgREST)${D}"
check "GET /rest/v1/ (OpenAPI)" "$GATEWAY/rest/v1/" 200 "swagger"
check "GET /rest/v1/users" "$GATEWAY/rest/v1/users" 200
check "GET /rest/v1/posts" "$GATEWAY/rest/v1/posts" 200
check "GET /rest/v1/mock_orders" "$GATEWAY/rest/v1/mock_orders" 200
echo ""

# ── 3. Mongo API ───────────────────────────────────────────────
echo -e "${B}Mongo API${D}"
check "GET /mongo/v1/health/live" "$GATEWAY/mongo/v1/health/live" 200 "ok"
echo ""

# ── 4. pg-meta ─────────────────────────────────────────────────
echo -e "${B}pg-meta${D}"
check "GET /meta/v1/tables" "$GATEWAY/meta/v1/tables" 200 "schema"
check "GET /meta/v1/health" "$GATEWAY/meta/v1/health" 200
echo ""

# ── 5. Query Router ────────────────────────────────────────────
echo -e "${B}Query Router${D}"
check "GET /query/v1/health/live" "$GATEWAY/query/v1/health/live" 200 "ok"
echo ""

# ── 6. Realtime ────────────────────────────────────────────────
echo -e "${B}Realtime${D}"
check "GET /realtime/v1/v1/health" "$GATEWAY/realtime/v1/v1/health" 200 "ok"
echo ""

# ── 7. Adapter Registry ────────────────────────────────────────
echo -e "${B}Adapter Registry${D}"
check "GET /admin/v1/health/live" "$GATEWAY/admin/v1/health/live" 200 "ok"
echo ""

# ── 8. Trino ───────────────────────────────────────────────────
echo -e "${B}Trino${D}"
check "GET /sql/v1/info" "$GATEWAY/sql/v1/info" 200 "coordinator"
echo ""

# ── 9. Authenticated flow (if signup worked) ───────────────────
if [ -n "$ACCESS_TOKEN" ]; then
  echo -e "${B}Authenticated CRUD${D}"
  # Extract user_id (sub claim) from JWT
  USER_ID=$(echo "$ACCESS_TOKEN" | cut -d. -f2 | python3 -c "
import sys, base64, json
p = sys.stdin.read().strip()
p += '=' * (-len(p) % 4)
print(json.loads(base64.urlsafe_b64decode(p))['sub'])" 2>/dev/null || echo "")

  # Create a post (include user_id for RLS)
  POST_BODY="{\"title\":\"e2e test\",\"content\":\"hello from k8s\",\"user_id\":\"$USER_ID\"}"
  POST_RESP=$(curl -s --max-time 10 -X POST \
    -H "apikey: $APIKEY" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$POST_BODY" "$GATEWAY/rest/v1/posts" 2>/dev/null)
  if echo "$POST_RESP" | grep -q "e2e test"; then
    total=$((total + 1)); pass=$((pass + 1))
    printf "  ${G}✔${D} %-35s ${D}created post${D}\n" "POST /rest/v1/posts"
  else
    total=$((total + 1)); fail=$((fail + 1))
    printf "  ${R}✖${D} %-35s ${R}failed${D}\n" "POST /rest/v1/posts"
  fi

  # Read back
  READ_RESP=$(curl -s --max-time 10 \
    -H "apikey: $APIKEY" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    "$GATEWAY/rest/v1/posts?title=eq.e2e%20test" 2>/dev/null)
  if echo "$READ_RESP" | grep -q "e2e test"; then
    total=$((total + 1)); pass=$((pass + 1))
    printf "  ${G}✔${D} %-35s ${D}found post${D}\n" "GET /rest/v1/posts?title=..."
  else
    total=$((total + 1)); fail=$((fail + 1))
    printf "  ${R}✖${D} %-35s ${R}not found${D}\n" "GET /rest/v1/posts?title=..."
  fi
  echo ""
fi

# ── 10. Playground (if available) ──────────────────────────────
if [ -n "${PLAYGROUND_URL:-}" ]; then
  echo -e "${B}Playground UI${D}"
  PLAY_CODE=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "$PLAYGROUND_URL/" 2>/dev/null)
  if [ "$PLAY_CODE" = "200" ]; then
    total=$((total + 1)); pass=$((pass + 1))
    printf "  ${G}✔${D} %-35s ${D}HTTP %s${D}\n" "GET / (playground)" "$PLAY_CODE"
  else
    total=$((total + 1)); fail=$((fail + 1))
    printf "  ${R}✖${D} %-35s ${R}HTTP %s${D}\n" "GET / (playground)" "$PLAY_CODE"
  fi

  # Verify API proxy works through playground
  PROXY_CODE=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" \
    -H "apikey: $APIKEY" "$PLAYGROUND_URL/api/auth/v1/health" 2>/dev/null)
  if [ "$PROXY_CODE" = "200" ]; then
    total=$((total + 1)); pass=$((pass + 1))
    printf "  ${G}✔${D} %-35s ${D}HTTP %s${D}\n" "GET /api/auth/v1/health" "$PROXY_CODE"
  else
    total=$((total + 1)); fail=$((fail + 1))
    printf "  ${R}✖${D} %-35s ${R}HTTP %s${D}\n" "GET /api/auth/v1/health" "$PROXY_CODE"
  fi
  echo ""
fi

# ── 11. Zoo App (if available) ─────────────────────────────────
if [ -n "${ZOO_URL:-}" ]; then
  echo -e "${B}Zoo App (Savanna Park Zoo)${D}"

  # Zoo frontend serves HTML
  ZOO_CODE=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "$ZOO_URL/" 2>/dev/null)
  if [ "$ZOO_CODE" = "200" ]; then
    total=$((total + 1)); pass=$((pass + 1))
    printf "  ${G}✔${D} %-35s ${D}HTTP %s${D}\n" "GET / (zoo frontend)" "$ZOO_CODE"
  else
    total=$((total + 1)); fail=$((fail + 1))
    printf "  ${R}✖${D} %-35s ${R}HTTP %s${D}\n" "GET / (zoo frontend)" "$ZOO_CODE"
  fi

  # Zoo animals table via Kong REST
  check "GET /rest/v1/animals (zoo)" "$GATEWAY/rest/v1/animals?select=name&limit=1" 200 "name"

  # Zoo events table
  check "GET /rest/v1/events (zoo)" "$GATEWAY/rest/v1/events?select=title&limit=1" 200 "title"

  # Zoo auth — login as staff
  ZOO_LOGIN=$(curl -s --max-time 10 \
    -H "apikey: $APIKEY" \
    -H "Content-Type: application/json" \
    -d '{"email":"sophie.laurent@savanna-zoo.com","password":"zoo-admin-2024"}' \
    "$GATEWAY/auth/v1/token?grant_type=password" 2>/dev/null)
  if echo "$ZOO_LOGIN" | grep -q "access_token"; then
    total=$((total + 1)); pass=$((pass + 1))
    printf "  ${G}✔${D} %-35s ${D}authenticated${D}\n" "POST zoo staff login"

    # Authenticated read of staff table
    ZOO_TOKEN=$(echo "$ZOO_LOGIN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
    STAFF_RESP=$(curl -s --max-time 10 \
      -H "apikey: $APIKEY" \
      -H "Authorization: Bearer $ZOO_TOKEN" \
      "$GATEWAY/rest/v1/staff?select=full_name&limit=1" 2>/dev/null)
    if echo "$STAFF_RESP" | grep -q "full_name"; then
      total=$((total + 1)); pass=$((pass + 1))
      printf "  ${G}✔${D} %-35s ${D}found staff${D}\n" "GET /rest/v1/staff (auth)"
    else
      total=$((total + 1)); fail=$((fail + 1))
      printf "  ${R}✖${D} %-35s ${R}no data${D}\n" "GET /rest/v1/staff (auth)"
    fi
  else
    total=$((total + 1)); fail=$((fail + 1))
    printf "  ${R}✖${D} %-35s ${R}failed${D}\n" "POST zoo staff login"
  fi
  echo ""
fi

# ── Summary ────────────────────────────────────────────────────
echo -e "${B}${C}╔══════════════════════════════════════════════╗${D}"
echo -e "${B}${C}║  Results                                     ║${D}"
echo -e "${B}${C}╠══════════════════════════════════════════════╣${D}"
echo -e "${B}${C}║${D}  ${G}${B}✔ Passed:${D} ${G}$pass${D}"
echo -e "${B}${C}║${D}  ${R}${B}✖ Failed:${D} ${R}$fail${D}"
echo -e "${B}${C}║${D}  Total:  $total"
echo -e "${B}${C}╚══════════════════════════════════════════════╝${D}"

if [ "$fail" -eq 0 ]; then
  echo -e "${G}${B}✔ All tests passed${D}"
  exit 0
else
  echo -e "${R}${B}✖ $fail test(s) failed${D}"
  exit 1
fi
