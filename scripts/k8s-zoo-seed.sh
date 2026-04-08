#!/usr/bin/env bash
# scripts/k8s-zoo-seed.sh — Seed the Savanna Park Zoo into K8s mini-baas
# Runs SQL files against K8s PostgreSQL and registers auth users via Kong.
#
# Usage: bash scripts/k8s-zoo-seed.sh [KONG_URL] [API_KEY]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ZOO_DIR="$ROOT_DIR/sandbox/apps/app2"
INFRA_DIR="$ZOO_DIR/infra"

KONG_URL="${1:-http://localhost:8000}"
API_KEY="${2:-anon-key-placeholder}"
ZOO_PASS="${ZOO_PASSWORD:-zoo-admin-2024}"
NS="${K8S_NS:-mini-baas}"
KUBECTL="${KUBECTL:-kubectl}"
FORCE="${FORCE:-0}"

G='\033[1;32m' Y='\033[1;33m' R='\033[0;31m' D='\033[0m'
log()  { printf "${G}[zoo-seed]${D} %s\n" "$*"; }
err()  { printf "${R}[zoo-seed]${D} %s\n" "$*" >&2; }

psql_k8s() {
  $KUBECTL exec -i -n "$NS" postgresql-0 -- \
    env PGPASSWORD=postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"
}

# ── Optional reset ──────────────────────────────────────────────
if [ "$FORCE" = "1" ]; then
  log "FORCE=1 → dropping zoo tables…"
  psql_k8s <<'SQL'
SET search_path TO public;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS visitor_stats CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS ticket_types CASCADE;
DROP TABLE IF EXISTS visitor_messages CASCADE;
DROP TABLE IF EXISTS health_records CASCADE;
DROP TABLE IF EXISTS feeding_logs CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS animals CASCADE;
DROP TABLE IF EXISTS staff CASCADE;
SQL
  log "Tables dropped."
fi

# ── 1. SQL schema + functions + seed data ───────────────────────
log "Running 001_zoo_tables.sql…"
psql_k8s < "$INFRA_DIR/001_zoo_tables.sql"

log "Running 002_zoo_functions.sql…"
psql_k8s < "$INFRA_DIR/002_zoo_functions.sql"

log "Running 003_zoo_seed.sql…"
psql_k8s < "$INFRA_DIR/003_zoo_seed.sql"

# Reload PostgREST schema cache
psql_k8s -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true
log "PostgREST schema reload requested."

# Verify counts
ANIMALS=$($KUBECTL exec -n "$NS" postgresql-0 -- \
  env PGPASSWORD=postgres psql -U postgres -d postgres -t -c \
  "SELECT count(*) FROM public.animals;" | tr -d ' ')
STAFF=$($KUBECTL exec -n "$NS" postgresql-0 -- \
  env PGPASSWORD=postgres psql -U postgres -d postgres -t -c \
  "SELECT count(*) FROM public.staff;" | tr -d ' ')
log "✓ Seeded: ${ANIMALS} animals, ${STAFF} staff"

# ── 2. Register auth users ──────────────────────────────────────
log "Registering zoo staff in GoTrue…"
register() {
  local email="$1" name="$2" role="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$KONG_URL/auth/v1/signup" \
    -H "Content-Type: application/json" \
    -H "apikey: $API_KEY" \
    -d "{\"email\":\"$email\",\"password\":\"$ZOO_PASS\",\"data\":{\"full_name\":\"$name\",\"role\":\"$role\"}}")
  if [ "$code" = "200" ] || [ "$code" = "422" ]; then
    log "  ✓ $email (HTTP $code)"
  else
    err "  ✗ $email (HTTP $code)"
  fi
}

register "sophie.laurent@savanna-zoo.com"  "Sophie Laurent"  "admin"
register "marcus.osei@savanna-zoo.com"     "Marcus Osei"     "zookeeper"
register "elena.moreau@savanna-zoo.com"    "Elena Moreau"    "zookeeper"
register "yuki.tanaka@savanna-zoo.com"     "Dr. Yuki Tanaka" "vet"
register "lucas.petit@savanna-zoo.com"     "Lucas Petit"     "reception"

# ── Done ────────────────────────────────────────────────────────
echo ""
log "═══════════════════════════════════════════════"
log " ✓ Savanna Park Zoo — seeding complete!"
log ""
log "   Zoo website:  http://localhost:5180"
log "   Staff login:  sophie.laurent@savanna-zoo.com"
log "   Password:     $ZOO_PASS"
log "═══════════════════════════════════════════════"
