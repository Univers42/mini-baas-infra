#!/usr/bin/env bash
# ============================================================
# init.sh — Bootstrap the Savanna Park Zoo in the BaaS stack
#
# Runs against an already-running mini-baas infrastructure:
#   1. Creates zoo tables in PostgreSQL
#   2. Installs triggers / functions
#   3. Seeds data (animals, events, tickets, messages, staff)
#   4. Registers staff users in GoTrue (auth)
#
# Usage:  ./infra/init.sh              (uses .env defaults)
#         FORCE=1 ./infra/init.sh      (drops + recreates)
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR"
BAAS_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# ─── Config (override via env) ────────────────────────────────
# Try to source root .env for PG password and API key
if [ -f "$BAAS_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -a
  . "$BAAS_ROOT/.env"
  set +a
fi

PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${POSTGRES_USER:-${PG_USER:-postgres}}"
PG_PASS="${POSTGRES_PASSWORD:-${PG_PASS:-postgres}}"
PG_DB="${POSTGRES_DB:-${PG_DB:-postgres}}"
KONG_URL="${KONG_URL:-http://localhost:8000}"
API_KEY="${KONG_PUBLIC_API_KEY:-${API_KEY:-public-anon-key}}"
FORCE="${FORCE:-0}"

export PGPASSWORD="$PG_PASS"

# ─── Helpers ──────────────────────────────────────────────────
log()  { printf '\033[1;32m[zoo-init]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[zoo-init]\033[0m %s\n' "$*" >&2; }
psql_run() {
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" \
       -v ON_ERROR_STOP=1 --no-psqlrc -q "$@"
}

wait_for_pg() {
  log "Waiting for PostgreSQL at $PG_HOST:$PG_PORT …"
  local i=0
  while ! pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -q 2>/dev/null; do
    i=$((i + 1))
    if [ $i -ge 30 ]; then
      err "PostgreSQL not ready after 30s"; exit 1
    fi
    sleep 1
  done
  log "PostgreSQL is ready."
}

wait_for_kong() {
  log "Waiting for Kong gateway at $KONG_URL …"
  local i=0
  while ! curl -s -o /dev/null -w '' "$KONG_URL/" 2>/dev/null; do
    i=$((i + 1))
    if [ $i -ge 30 ]; then
      err "Kong not ready after 30s"; exit 1
    fi
    sleep 1
  done
  log "Kong is ready."
}

# ─── Optional reset ──────────────────────────────────────────
maybe_reset() {
  if [ "$FORCE" = "1" ]; then
    log "FORCE=1 → dropping zoo tables …"
    psql_run <<'SQL'
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
}

# ─── 1. PostgreSQL schema + data ─────────────────────────────
init_postgres() {
  wait_for_pg
  maybe_reset

  log "Running 001_zoo_tables.sql …"
  psql_run -f "$INFRA_DIR/001_zoo_tables.sql"

  log "Running 002_zoo_functions.sql …"
  psql_run -f "$INFRA_DIR/002_zoo_functions.sql"

  log "Running 003_zoo_seed.sql …"
  psql_run -f "$INFRA_DIR/003_zoo_seed.sql"

  local count
  count=$(psql_run -t -c "SELECT count(*) FROM public.animals;" | tr -d ' ')
  log "✓ animals seeded: $count rows"
  count=$(psql_run -t -c "SELECT count(*) FROM public.tickets;" | tr -d ' ')
  log "✓ tickets seeded: $count rows"
  count=$(psql_run -t -c "SELECT count(*) FROM public.staff;" | tr -d ' ')
  log "✓ staff seeded:   $count rows"
}

# ─── 2. PostgREST schema reload ──────────────────────────────
reload_postgrest() {
  log "Asking PostgREST to reload schema cache …"
  # PostgREST reloads on NOTIFY pgrst
  psql_run -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true
  log "✓ PostgREST schema reload requested."
}

# ─── 3. GoTrue users ─────────────────────────────────────────
register_user() {
  local email="$1" password="$2" name="$3" role="$4"
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$KONG_URL/auth/v1/signup" \
    -H "Content-Type: application/json" \
    -H "apikey: $API_KEY" \
    -d "{
      \"email\": \"$email\",
      \"password\": \"$password\",
      \"data\": {
        \"full_name\": \"$name\",
        \"role\": \"$role\"
      }
    }")

  if [ "$status" = "200" ] || [ "$status" = "201" ] || [ "$status" = "422" ]; then
    log "  ✓ $email (HTTP $status)"
  else
    err "  ✗ $email (HTTP $status)"
  fi
}

init_auth() {
  wait_for_kong
  log "Registering zoo staff in GoTrue …"
  local ZOO_PASS="${ZOO_PASSWORD:-zoo-admin-2024}"

  register_user "sophie.laurent@savanna-zoo.com"  "$ZOO_PASS" "Sophie Laurent"   "admin"
  register_user "marcus.osei@savanna-zoo.com"     "$ZOO_PASS" "Marcus Osei"      "zookeeper"
  register_user "elena.moreau@savanna-zoo.com"    "$ZOO_PASS" "Elena Moreau"     "zookeeper"
  register_user "yuki.tanaka@savanna-zoo.com"     "$ZOO_PASS" "Dr. Yuki Tanaka"  "vet"
  register_user "lucas.petit@savanna-zoo.com"     "$ZOO_PASS" "Lucas Petit"      "reception"

  log "✓ Auth users registered (password: $ZOO_PASS)"
}

# ─── Main ─────────────────────────────────────────────────────
main() {
  log "═══════════════════════════════════════════════"
  log " Savanna Park Zoo — BaaS Initialisation"
  log "═══════════════════════════════════════════════"

  init_postgres
  reload_postgrest
  init_auth

  log ""
  log "═══════════════════════════════════════════════"
  log " ✓ Zoo initialisation complete!"
  log ""
  log "   Frontend:   http://localhost:5173"
  log "   BaaS API:   $KONG_URL/rest/v1/"
  log "   Auth:       $KONG_URL/auth/v1/"
  log "   Staff login: sophie.laurent@savanna-zoo.com"
  log "   Password:    ${ZOO_PASSWORD:-zoo-admin-2024}"
  log "═══════════════════════════════════════════════"
}

main "$@"
