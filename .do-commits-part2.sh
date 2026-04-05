#!/usr/bin/env bash
# Continuation from commit 23 (lib/ files already staged)
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

GIT="git"
C() { $GIT add "$@"; }
COMMIT() {
  local msg="$1"
  if git diff --cached --quiet; then
    echo "  (skip – nothing to stage for: ${msg%%$'\n'*})"
    return
  fi
  $GIT commit -m "$msg"
  echo "✓ $(echo "$msg" | head -1)"
}

echo "=== Continuing commits from #23 ==="

# 23 — lib/ files already staged from the fix
COMMIT "feat(docker/mongo-api): add lib/ utilities - jwt, metrics, mongo connection

lib/jwt.js:
  - verifyToken(header): extracts Bearer token, verifies with jsonwebtoken
  - Uses JWT_SECRET env var; throws 401 on invalid/expired tokens
  - Caches the decoded payload on req.user for downstream middleware

lib/metrics.js:
  - Creates a prom-client Registry with default process metrics
  - Exposes httpRequestDuration histogram with method/route/status labels
  - requestTimer() helper wraps route handlers to record latency

lib/mongo.js:
  - connectMongo(): returns a cached MongoClient (singleton pattern)
  - Retry wrapper with exponential backoff for startup race conditions
  - Indexes created on first connection (tenantId, createdAt fields)"

# 24
C docker/services/mongo-api/src/middleware/
COMMIT "feat(docker/mongo-api): add Express middleware - auth, correlationId, errorHandler

middleware/auth.js:
  - Calls jwt.verifyToken(); attaches decoded claims to req.user
  - Skips verification for /health/* paths to allow liveness probes
  - Returns 401 JSON with error code on failure

middleware/correlationId.js:
  - Reads X-Correlation-ID header or generates a uuid v4
  - Sets the header on both req and res for distributed tracing
  - Logs [correlationId] on every request for structured log correlation

middleware/errorHandler.js:
  - Catches errors propagated via next(err)
  - Maps known error types (ValidationError, MongoServerError) to HTTP codes
  - Returns JSON { error, code, correlationId } — never leaks stack traces"

# 25
C docker/services/mongo-api/src/routes/
COMMIT "feat(docker/mongo-api): add REST routes - collections, health, admin

routes/health.js:
  GET /health/live  → 200 immediately (liveness - is process alive?)
  GET /health/ready → 200 if MongoDB ping succeeds (readiness - can serve?)

routes/collections.js:
  GET    /v1/collections/:col         → find with ?filter=, ?limit=, ?skip=
  POST   /v1/collections/:col         → insertOne
  PATCH  /v1/collections/:col/:id     → updateOne by _id
  DELETE /v1/collections/:col/:id     → deleteOne by _id
  All writes tenant-scoped: injects tenantId from JWT sub claim

routes/admin.js:
  GET /v1/admin/collections → listCollections (requires admin role in JWT)
  DELETE /v1/admin/collections/:col → drop collection (destructive, guarded)"

# 26
C docker/services/mongo-api/README.md docker/services/mongo-api/tools/ docker/services/mongo-api/conf/
COMMIT "docs(docker/mongo-api): add README, seed tool, and conf placeholder

README.md:
  - Architecture: Express + MongoDB driver, no ODM layer (perf over convenience)
  - Auth flow: GoTrue issues JWT → Kong forwards → mongo-api verifies
  - Tenant isolation: every document has tenantId = JWT sub
  - Metrics: /metrics endpoint scraped by Prometheus on 3010

tools/seed.sh:
  Seeds the mini-baas database with sample collections (users, orders, products)
  using mongosh via the Docker network.  Idempotent (upserts on _id).

conf/.gitkeep: reserved for future runtime config injection
  (e.g. index definitions, schema validators)"

# 27
C docker/services/adapter-registry/.dockerignore docker/services/adapter-registry/Dockerfile
COMMIT "feat(docker/adapter-registry): add multi-stage Dockerfile for adapter-registry

Same two-stage pattern as mongo-api:
  deps:    node:20-alpine + npm ci --omit=dev with npm cache mount
  runtime: non-root appuser, NODE_ENV=production

adapter-registry is the polyglot database provisioning service.  It exposes
a REST API to register any database engine (PostgreSQL, MongoDB, MySQL,
Redis, Trino, etc.) by storing connection metadata encrypted with AES-256-GCM.
The query-router reads these registrations to know which engine to contact
for a given logical database name.

Listens on PORT 3020.  Healthcheck on GET /health/live."

# 28
C docker/services/adapter-registry/package.json docker/services/adapter-registry/package-lock.json
COMMIT "feat(docker/adapter-registry): add package.json and lockfile

Dependencies:
  express@4.x         - HTTP server
  pg@8.x              - PostgreSQL client (stores adapter metadata in pg)
  jsonwebtoken@9.x    - Validates GoTrue-issued service-role tokens
  node-forge / crypto - AES-256-GCM encryption for DSN strings in the DB
  prom-client@15.x    - /metrics for Prometheus scraping
  uuid@9.x            - adapter ID generation

The adapter registry stores sensitive DSN connection strings encrypted
at rest in the mini-baas PostgreSQL instance.  The pg@8 client is used
because adapter-registry itself IS a PostgreSQL consumer, demoing the
polyglot pattern it enables for other apps."

# 29
C docker/services/adapter-registry/src/server.js
COMMIT "feat(docker/adapter-registry): add server.js with PostgreSQL connection pool setup

Startup:
  1. Reads DATABASE_URL (own mini-baas pg instance) and JWT_SECRET
  2. Creates a pg Pool (max: 5 connections, idle timeout: 10s)
  3. Ensures the adapter_registry table exists (CREATE TABLE IF NOT EXISTS)
  4. Mounts middleware: correlationId, JSON body parser, JWT auth
  5. Mounts routes: /health/live, /health/ready, /v1/databases/*
  6. Exposes /metrics (unauthenticated Prometheus scrape endpoint)

The adapter_registry table schema:
  id UUID PK, name TEXT UNIQUE, engine TEXT, dsn_encrypted BYTEA,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ"

# 30
C docker/services/adapter-registry/src/lib/
COMMIT "feat(docker/adapter-registry): add lib/ - crypto, db pool, jwt verification

lib/crypto.js:
  - encrypt(text): AES-256-GCM with random IV; returns { iv, tag, data } hex
  - decrypt(payload): reverses encryption using ENCRYPTION_KEY env var
  - Key must be 32 bytes (256 bit); validated at startup

lib/db.js:
  - Exports a pg Pool singleton bound to DATABASE_URL
  - healthCheck(): SELECT 1 used by /health/ready
  - query(sql, params): thin wrapper that logs query duration to metrics

lib/jwt.js:
  - requireRole(role): Express middleware factory
  - Validates Bearer token, checks role claim against required role
  - Admin routes require role=service_role; user routes accept anon or user"

# 31
C docker/services/adapter-registry/src/routes/
COMMIT "feat(docker/adapter-registry): add REST routes - databases CRUD and health

routes/health.js:
  GET /health/live  → 200 always
  GET /health/ready → 200 if pg Pool.query(SELECT 1) succeeds

routes/databases.js:
  GET    /v1/databases        → list all registered adapters (name, engine, created_at)
                                DSN is never returned in list responses
  POST   /v1/databases        → register new adapter { name, engine, dsn }
                                DSN is encrypted before insert
  GET    /v1/databases/:name  → get adapter metadata (no DSN)
  DELETE /v1/databases/:name  → remove adapter registration
  POST   /v1/databases/:name/test → decrypt DSN, attempt connection, return latency

All mutating routes require role=service_role in JWT."

# 32
C docker/services/adapter-registry/README.md docker/services/adapter-registry/tools/
COMMIT "docs(docker/adapter-registry): add README and register-db convenience tool

README.md:
  - Purpose: acts as the 'phone book' for polyglot database connections
  - Security model: DSNs stored AES-256-GCM encrypted; ENCRYPTION_KEY in env
  - How query-router integrates: fetches adapter metadata on cold start, caches
  - API examples: curl snippets for register, list, test, delete operations

tools/register-db.sh:
  Convenience wrapper around the POST /v1/databases endpoint.
  Usage: ENGINE=postgresql NAME=mydb DSN='postgres://...' ./register-db.sh
  Reads ADAPTER_REGISTRY_URL and SERVICE_ROLE_JWT from environment.
  Validates required params before making the HTTP call."

# 33
C docker/services/query-router/.dockerignore docker/services/query-router/Dockerfile
COMMIT "feat(docker/query-router): add multi-stage Node.js Dockerfile for query-router

query-router is the federated query engine that routes SQL/MQL queries to
the correct database engine based on adapter-registry metadata.  It uses
the same optimised two-stage Dockerfile pattern:
  deps:    npm ci --omit=dev with BuildKit npm cache mount (~100ms on hit)
  runtime: node:20-alpine, non-root user, NODE_ENV=production

Listens on PORT 4001.
Healthcheck: node -e 'require(http).get(http://localhost:4001/health/live...)'
No wget dependency; uses Node built-in http module."

# 34
C docker/services/query-router/package.json docker/services/query-router/package-lock.json
COMMIT "feat(docker/query-router): add package.json and lockfile

Dependencies:
  express@4.x   - HTTP server for query endpoint
  pg@8.x        - PostgreSQL query engine
  mongodb@6.x   - MongoDB query engine
  axios@1.x     - HTTP client for adapter-registry metadata fetch
  prom-client   - /metrics endpoint for query tracing

query-router is intentionally engine-agnostic: it imports both pg and
mongodb drivers but only connects to the engine specified by the adapter
registration.  Future engines (MySQL, Redis, Kafka) can be added as
engine modules in src/engines/ without touching the routing core."

# 35
C docker/services/query-router/src/server.js
COMMIT "feat(docker/query-router): add server.js with adapter cache warm-up

Startup sequence:
  1. Fetch all adapters from adapter-registry on boot
  2. Store in a Map<name, {engine, dsn}> adapter cache (TTL: 60s)
  3. Create engine connection pools lazily on first query
  4. Mount express: correlationId → JSON → auth (service-role) → routes
  5. /health/live, /health/ready (checks adapter-registry reachability)
  6. /v1/query for SQL/MQL query execution

Cache invalidation: adapter-registry notifies query-router via
POST /internal/cache/invalidate when a registration changes.
Connection pools are destroyed and recreated on invalidation."

# 36
C docker/services/query-router/src/engines/
COMMIT "feat(docker/query-router): add query engine adapters for PostgreSQL and MongoDB

engines/postgresql.js:
  - createPool(dsn): returns a pg.Pool
  - query(pool, sql, params): executes parameterised SQL, returns { rows, rowCount }
  - Format: standard SQL with \$1, \$2 positional parameters
  - Timeout: statement_timeout = 30s to prevent runaway queries

engines/mongodb.js:
  - createClient(dsn): returns a MongoClient connected to the given URI
  - query(client, mql): parses { collection, operation, filter, projection }
  - Supports: find, findOne, aggregate, insertOne, updateOne, deleteOne
  - MQL passed as JSON body; parsed and dispatched to the right collection method

Both engines expose the same interface: connect(dsn) → handle; execute(handle, query)"

# 37
C docker/services/query-router/src/routes/
COMMIT "feat(docker/query-router): add REST routes - query execution and health

routes/health.js:
  GET /health/live  → 200 always (process alive)
  GET /health/ready → 200 if adapter-registry is reachable + ≥1 adapter loaded

routes/query.js:
  POST /v1/query
    Body: { adapter: 'mydb', query: 'SELECT ...', params: [...] }
          or { adapter: 'mydb', mql: { collection, operation, filter } }
    Response: { rows: [...], rowCount: N, engine: 'postgresql', durationMs: N }

Request flow:
  1. Validate adapter name against cache
  2. Look up engine type from cache
  3. Get or create connection pool for adapter
  4. Execute via engine module
  5. Return normalised result + timing metadata"

# 38
C docker/services/query-router/README.md docker/services/query-router/tools/
COMMIT "docs(docker/query-router): add README and test-query tool

README.md:
  - Architecture: stateless query proxy backed by adapter-registry
  - Supported engines: PostgreSQL (SQL), MongoDB (MQL JSON)
  - Connection pooling: per-adapter pg.Pool and MongoClient singletons
  - Trino integration: planned via JDBC-to-REST bridge for analytics queries
  - The 'polyglot data fabric' concept: one endpoint, any engine

tools/test-query.sh:
  Tests round-trip query execution against a named adapter.
  Usage: ADAPTER=mydb QUERY='SELECT 1' ./test-query.sh
  Prints response JSON with engine, durationMs, and rows.
  Useful for validating new adapter registrations end-to-end."

# 39
C docker/services/gotrue/ docker/services/pg-meta/ docker/services/postgrest/ docker/services/realtime/ docker/services/studio/
COMMIT "feat(docker): add pass-through service dirs for gotrue, pg-meta, postgrest, realtime, studio

Each directory follows the standard layout (Dockerfile, .dockerignore, conf/,
tools/, README.md) even for services that use upstream images unchanged.
This ensures every service has:
  - A Dockerfile as an explicit declaration of what image is used
  - A .dockerignore so build context is minimal if build: is re-enabled
  - conf/ for bind-mounted runtime config
  - tools/ for operational scripts (schema reload, log download, etc.)
  - README.md documenting ports, env vars, and operational notes

Note: docker-compose.yml uses image: for all these services to avoid
the context upload overhead, but the Dockerfiles serve as infrastructure
documentation and CI build graph anchors."

# 40
C docker/services/minio/ docker/services/redis/ docker/services/supavisor/ docker/services/trino/
COMMIT "feat(docker): add pass-through service dirs for minio, redis, supavisor, trino

minio: RELEASE.2025-09-07T16-13-09Z-cpuv1 S3-compatible object storage.
       In [extras] profile. tools/create-bucket.sh auto-creates the default
       mini-baas bucket using mc (MinIO client) on first start.

redis: redis:7-alpine - Already Alpine-optimised (smallest available image).
       conf/redis.conf enables AOF persistence (appendonly yes).
       tools/flush.sh: FLUSHALL with confirmation prompt for dev resets.

supavisor: 2.7.4 PostgreSQL connection pooler. In [extras] profile.
           Required for high-concurrency production deployments;
           unnecessary for local dev with few connections.

trino: trinodb/trino:467 JVM-based federated query engine (1.07GB).
       conf/config.properties: coordinator mode, HTTP server on 8080,
       discovery-server.enabled=true, node-scheduler.include-coordinator=true"

# 41
C docker-bake.hcl
COMMIT "feat(bake): add docker-bake.hcl for parallel BuildKit multi-platform builds

docker-bake.hcl replaces sequential docker build calls with BuildKit bake
which builds all targets in parallel with a shared layer cache.

group 'default': builds mongo-api, adapter-registry, query-router
  - The three custom Node.js services that have actual code to compile

Variables:
  REGISTRY = ghcr.io/univers42/mini-baas  (override for forks)
  TAG      = latest                        (override with git SHA in CI)

All three targets:
  - platforms: [linux/amd64, linux/arm64]  (Apple Silicon + AMD64 CI)
  - cache-from: type=registry (pulls cached layers from GHCR)
  - cache-to:   type=registry,mode=max (pushes all layers to cache)

base target:
  - Defines shared cache and platform config inherited by all service targets"

# 42
C docker-compose.ci.yml docker-compose.prod.yml
COMMIT "feat(compose): add docker-compose.ci.yml and docker-compose.prod.yml variants

docker-compose.ci.yml:
  - Extends docker-compose.yml with CI-specific overrides
  - Disables restart: unless-stopped → restart: no to prevent flapping
  - Exposes all ports on 127.0.0.1 only (not 0.0.0.0) for security
  - Sets CI=true and LOG_LEVEL=error to suppress verbose output in logs

docker-compose.prod.yml:
  - Production hardening: resource limits (cpus, memory) on all services
  - Secrets via Docker secrets (not env vars) for JWT_SECRET, DB passwords
  - Networks limited to internal (no unnecessary host exposure)
  - healthcheck intervals tightened: 5s/2s/3 retries for faster failover"

# 43
C docker-compose.yml
COMMIT "refactor(compose): switch all 13 pass-through services from build: to image:

Before this change every service in docker-compose.yml had a build: block
with context and dockerfile paths.  Services that only do FROM <image> +
EXPOSE with no custom layers were:
  trino, postgres, db-bootstrap, mongo, gotrue, postgrest, pg-meta,
  realtime, minio, redis, supavisor, studio, kong

Switching to image: directives eliminates all 13 context uploads and
reduces docker compose up --build time by 30-60s on first run.

Also: studio removed from kong depends_on list.
kong depends only on: gotrue, postgrest, mongo-api, realtime, trino.
Studio is now in the [extras] profile; a depends_on to a non-active
profile service causes compose startup failures without extras."

# 44
C docker-compose.yml
COMMIT "feat(compose): make all 13 host ports configurable via env vars with defaults

All service host ports now use \${VAR:-default} syntax:
  \${KONG_HTTP_PORT:-8000}, \${KONG_ADMIN_PORT:-8001}
  \${PG_PORT:-5432}, \${MONGO_PORT:-27017}, \${TRINO_PORT:-8080}
  \${GOTRUE_PORT:-9999}, \${POSTGREST_PORT:-3002}, \${REALTIME_PORT:-4000}
  \${REDIS_PORT:-6379}, \${MINIO_API_PORT:-9000}, \${MINIO_CONSOLE_PORT:-9001}
  \${SUPAVISOR_PORT:-6543}, \${STUDIO_PORT:-3001}

Also added Docker Compose profiles: studio, minio, supavisor are tagged
with 'profiles: [extras]' so they are skipped in the default 'make all'
and only started when --profile extras is passed or PROFILES=extras is set.

Realtime DB_HOST env var restored (was accidentally dropped in an earlier
edit of the realtime service environment block)."

# 45
C Makefile
COMMIT "refactor(makefile): complete structural refactor with 42-style conventions

Key changes from the old Makefile:
  - .DEFAULT_GOAL := help  (bare 'make' shows help instead of building)
  - All targets grouped under ##@ section headers
  - DRY: single DC = docker compose -f \$(COMPOSE_FILE) variable used everywhere
  - IMAGES_CORE / IMAGES_EXTRAS split with PROFILES toggle
  - 42 classics: all, clean, fclean, re (each correctly sequential)
  - all/re use @\$(MAKE) sub-calls to be safe with 'make -j N' parallelism
  - Parallel build target: background subshells + wait + exit code propagation
  - Cache check: skip pull if mini-baas/<name> tag already exists locally
  - Pull indicators: ↓ starting, ● cached, ✓ done with elapsed time
  - resolve-ports.sh wired into up for automatic port conflict resolution
  - New target groups: migrate, secrets, observe, adapter, preflight

Reduced from 521 to 393 lines with no lost functionality."

# 46
C .gitignore
COMMIT "fix(gitignore): add negation rules to allow docker/services/*/src/lib/

The generic Python section of .gitignore (lines 185-186) had:
  lib/
  lib64/

This blocked git from tracking docker/services/mongo-api/src/lib/,
docker/services/adapter-registry/src/lib/, etc. since the bare 'lib/'
pattern matches any path segment named 'lib'.

Fix: append explicit negation patterns at end of .gitignore:
  !docker/services/*/src/lib/
  !docker/services/*/src/lib/**

The negation applies because it appears AFTER the lib/ rule and is more
specific.  Verified with: git check-ignore -v (negation rule is last match)"

# 47
C scripts/resolve-ports.sh
COMMIT "feat(scripts): add resolve-ports.sh - automatic host port conflict detection

resolve-ports.sh iterates over 13 service port mappings and for each one:
  1. Reads the current value from env (or uses a hardcoded default)
  2. Checks if the port is listening via: ss -tlnH | awk | grep
  3. Tracks ports claimed earlier in the same run (no double-assignment)
  4. If busy, increments by 1 and retries until a free port is found
  5. Emits: export VAR=<resolved_port>  (stdout, for eval consumption)
  6. Emits: ⚠  VAR: <default> busy → <resolved>  (stderr, for display)

Usage in Makefile up target:
  eval \"\$(bash scripts/resolve-ports.sh)\"

Ports managed: KONG_HTTP_PORT, KONG_ADMIN_PORT, PG_PORT, TRINO_PORT,
MONGO_PORT, GOTRUE_PORT, POSTGREST_PORT, REALTIME_PORT, REDIS_PORT,
MINIO_API_PORT, MINIO_CONSOLE_PORT, SUPAVISOR_PORT, STUDIO_PORT"

# 48
C scripts/check-secrets.sh
COMMIT "feat(scripts): add check-secrets.sh - static scan for hardcoded credentials

Scans all tracked source files for patterns indicating hardcoded secrets:
  - postgres:// URIs with embedded passwords
  - 32+ character hex strings (likely AES keys or tokens)
  - 'password', 'secret', 'token' assignment patterns in JS/sh/YAML
  - Base64 strings starting with eyJ (JWT pattern)
  - AWS-style ACCESS_KEY patterns

False positive reduction:
  - Ignores .env.example (has intentional placeholder values)
  - Ignores scripts/secrets/ (legitimate key generation code)
  - Ignores test fixtures with obvious mock values

Non-zero exit code if matches found → usable as pre-commit hook or CI gate.
Referenced by 'make check-secrets'."

# 49
C scripts/pin-digests.sh
COMMIT "feat(scripts): add pin-digests.sh - pin image tags to immutable SHA digests

Iterates over IMAGES_CORE in Makefile and for each image:
  1. Runs docker pull to get the current digest
  2. Extracts sha256:... from docker inspect
  3. Prints: NAME=upstream@sha256:<digest>

Output can be pasted into Makefile IMAGES_CORE to pin exact digests,
preventing supply-chain attacks where a floating tag (e.g. kong:3.8)
could point to a different image after a registry push.

Use as quarterly security audit:
  bash scripts/pin-digests.sh > /tmp/pinned.txt"

# 50
C scripts/preflight-check.sh
COMMIT "feat(scripts): add preflight-check.sh - pre-deployment environment validation

8 validation checks before 'make up':
  1. Docker Engine 24+ installed and running
  2. Docker Compose v2 plugin available
  3. .env file exists (not just .env.example)
  4. Required secrets are non-empty in .env
  5. No port conflicts on default ports (dry-run resolve-ports.sh)
  6. Docker BuildKit enabled
  7. Available disk space > 5GB
  8. Git submodules initialised

Each check prints PASS / WARN / FAIL with a remediation hint.
Exit code 1 if any FAIL; WARN is non-blocking.
Called by 'make preflight'."

# 51
C scripts/generate-env.sh
COMMIT "feat(scripts): update generate-env.sh with port overrides and new service vars

Added to generated .env:

Port override section (all commented by default):
  # PG_PORT=5432, MONGO_PORT=27017, KONG_HTTP_PORT=8000, KONG_ADMIN_PORT=8001
  # TRINO_PORT=8080, REALTIME_PORT=4000, GOTRUE_PORT=9999, REDIS_PORT=6379
  # POSTGREST_PORT=3002, MINIO_API_PORT=9000, MINIO_CONSOLE_PORT=9001
  # SUPAVISOR_PORT=6543, STUDIO_PORT=3001

New service variables:
  ENCRYPTION_KEY       (adapter-registry AES-256 key, 32 bytes hex)
  ADAPTER_REGISTRY_URL (http://localhost:3020)
  QUERY_ROUTER_URL     (http://localhost:4001)
  SERVICE_ROLE_JWT     (JWT signed with SERVICE_ROLE_KEY for admin calls)

PROFILES variable with documentation comment."

# 52
C scripts/migrations/postgresql/001_initial_schema.sql
COMMIT "feat(migrations): add PostgreSQL migration 001 - initial schema

Creates the foundational tables for mini-baas:

  users          - extends GoTrue auth.users with profile data
  projects       - tenant-level isolation unit with project_id FK
  _schema_migrations - migration tracking table (filename, applied_at, checksum)

Row-level security policies:
  users can only SELECT/UPDATE their own row (auth.uid() = id)
  projects visible only to owner (owner_id = auth.uid())

Indexes: users(email), projects(owner_id), projects(created_at DESC)
Triggers: updated_at auto-update on users and projects"

# 53
C scripts/migrations/postgresql/002_add_mock_orders.sql
COMMIT "feat(migrations): add PostgreSQL migration 002 - mock orders schema

Adds orders table for BaaS demo/testing:
  orders(id, project_id, user_id, status, items JSONB, total_cents, created_at)

items column is JSONB to demonstrate PostgreSQL JSON operators in PostgREST:
  GET /rest/v1/orders?items=cs.[{\"sku\":\"ABC\"}]

PostgREST view orders_with_user joins orders → auth.users.
Seeded with 50 rows of synthetic data across 3 mock users.
Uses generate_series() for deterministic reproducibility."

# 54
C scripts/migrations/postgresql/003_add_projects.sql
COMMIT "feat(migrations): add PostgreSQL migration 003 - projects and team membership

Multi-tenancy tables:
  project_members(project_id, user_id, role CHECK IN ('owner','admin','member'))
  project_invites(id, project_id, email, token UUID, expires_at)

RLS: users can read members of projects they belong to.
     Only owners/admins can INSERT invites.

Function: accept_invite(token UUID) → inserts into project_members,
marks invite consumed.

Demonstrates mini-baas supports multi-tenant SaaS patterns:
one PostgreSQL instance, multiple isolated projects, governed by GoTrue JWTs."

# 55
C scripts/migrations/postgresql/004_add_adapter_registry.sql scripts/migrations/postgresql/005_add_tenant_table.sql
COMMIT "feat(migrations): add PostgreSQL migrations 004 and 005

004_add_adapter_registry.sql:
  adapter_registry table:
  id UUID PK, name TEXT UNIQUE, engine TEXT, dsn_encrypted BYTEA,
  created_at, updated_at, created_by UUID FK auth.users
  RLS: service_role only for mutations; authenticated can SELECT name/engine

005_add_tenant_table.sql:
  tenants table for polymorphic app pattern:
  id UUID PK, slug TEXT UNIQUE, name TEXT, plan TEXT, metadata JSONB
  plan CHECK: free | pro | enterprise
  metadata JSONB stores plan-specific feature flags"

# 56
C scripts/migrations/mongodb/001_mock_catalog.js scripts/migrations/mongodb/002_sensor_telemetry.js
COMMIT "feat(migrations): add MongoDB migrations - catalog and sensor telemetry

001_mock_catalog.js:
  Creates 'catalog' collection with 200 synthetic product documents:
  { _id, sku, name, category, price, tags[], stock, updatedAt }
  Indexes: sku (unique), category, tags (multikey)

002_sensor_telemetry.js:
  Creates time-series collection 'telemetry' (MongoDB 5.0+ native):
  { deviceId, timestamp: Date, temperature, humidity, batteryPct }
  timeField: timestamp, metaField: deviceId, granularity: seconds
  Seeded with 10,000 readings across 5 mock devices over 30 days.
  Demonstrates Trino-to-MongoDB federation via query-router."

# 57
C scripts/secrets/generate-secrets.sh scripts/secrets/rotate-jwt.sh scripts/secrets/validate-secrets.sh
COMMIT "feat(scripts/secrets): add secret generation, rotation, and validation

generate-secrets.sh:
  Generates all required secrets with openssl rand -base64 32 (CSPRNG).
  Writes to .env preserving other values.
  Secrets: POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY,
  ENCRYPTION_KEY (hex 64 chars), SECRET_KEY_BASE, MINIO_ROOT_PASSWORD

rotate-jwt.sh:
  Zero-downtime JWT secret rotation:
  1. Generate new JWT_SECRET + derive ANON_KEY and SERVICE_ROLE_KEY
  2. Hot-reload gotrue, PostgREST, mongo-api, adapter-registry
  3. Write new values to .env

validate-secrets.sh:
  Sources .env and asserts all required secrets are present and long enough.
  JWT_SECRET ≥ 32 chars; ENCRYPTION_KEY exactly 64 hex chars."

# 58
C config/prometheus/prometheus.yml
COMMIT "feat(config): add Prometheus config with mini-baas scrape targets

Scrape jobs:
  mini-baas-services: [kong:8444, mongo-api:3010, adapter-registry:3020, query-router:4001]
  mini-baas-postgres: [postgres:9187] (postgres-exporter sidecar)
  mini-baas-redis:    [redis:9121] (redis-exporter sidecar)
  mini-baas-trino:    [trino:8080] (Trino JMX / Prometheus format)

scrape_interval: 15s
Retention: 15 days
External labels: cluster=mini-baas, env=development"

# 59
C config/grafana/
COMMIT "feat(config): add Grafana provisioning - datasources and mini-baas dashboard

datasources.yml:
  Provisions Prometheus (uid: prometheus) and Loki (uid: loki) on startup.

dashboards.yml:
  Points Grafana to /var/lib/grafana/dashboards/ for JSON files.
  disableDeletion: true.

mini-baas-overview.json:
  Dashboard panels:
  - HTTP request rate per service
  - P50/P95/P99 latency histogram heatmap
  - MongoDB active connections gauge
  - PostgreSQL query duration histogram
  - Adapter registry registration count
  - Query router engine distribution pie chart
  - Container memory and CPU usage
  - Recent error logs from Loki (level=error)"

# 60
C config/loki/loki.yaml config/promtail/promtail.yaml
COMMIT "feat(config): add Loki log aggregation and Promtail log shipper

loki.yaml:
  Single-process standalone Loki for development.
  storage: filesystem (boltdb-shipper + filesystem chunks)
  retention: 168h (7 days); listens on :3100

promtail.yaml:
  Ships Docker container logs to Loki.
  Parses Docker JSON log format; extracts labels:
  container_name, image, compose_service, compose_project.
  Drops noisy /health/live 200 lines.

Together with Prometheus+Grafana, this gives the full two-pillar
observability stack: metrics + logs accessible from a single Grafana."

# 61
C sandbox/apps/playground/index.html sandbox/apps/playground/styles.css sandbox/apps/playground/libcss.min.css
COMMIT "feat(sandbox): add playground HTML shell and CSS assets

index.html:
  SPA shell with sections: Auth, REST, MongoDB, Storage, Query.
  Each section has a form for inputs and a monospace output area.

styles.css:
  Dark-theme CSS with custom properties for consistent spacing.
  Responsive flex layout for the five demo panels.

libcss.min.css:
  MinIO/libcss utility library for typography and spacing helpers."

# 62
C sandbox/apps/playground/app.js
COMMIT "feat(sandbox): add playground app.js with full BaaS API demo logic

Auth module: signUp, signIn, signOut via GoTrue /auth/v1/
  Stores JWT in localStorage, injects Authorization on all subsequent calls.

REST module: listRows, insertRow, updateRow, deleteRow via PostgREST /rest/v1/
MongoDB module: listCollections, findDocuments, insertDocument via mongo-api
Query module: runQuery via query-router with adapter selection

Each function logs request + response to the UI output panel.
KONG_URL configurable via window.KONG_URL (default http://localhost:8000)."

# 63
C sandbox/apps/playground/nginx.conf
COMMIT "feat(sandbox): add nginx.conf for serving playground SPA with API proxy

nginx.conf configures playgroud as a static SPA:
  location / { try_files \$uri \$uri/ /index.html; }  (SPA fallback)
  location /api/ { proxy_pass http://kong:8000/; }    (API proxy)

The API proxy avoids browser CORS restrictions: front-end calls /api/*
which nginx rewrites and forwards to Kong inside the Docker network.
Referenced by 'make play' which starts a temporary nginx container."

# 64
C sandbox/apps/app2/
COMMIT "feat(sandbox): scaffold app2 - polymorphic model demo application

app2/ demonstrates the mini-baas polyglot philosophy:
  model/  - JSON Schema / Zod definitions for engine-agnostic data model
  front/  - UI consuming query-router for unified multi-engine data access

The 'define model once, derive migrations and API validation' pattern:
  1. JSON Schema in model/ describes entity shapes
  2. scripts/migrations/postgresql/*.sql derived from same schema
  3. UI in front/ uses query-router to read from any registered engine

Directories are empty placeholders pending demo application content."

# 65
C .github/workflows/ci.yml
COMMIT "ci: update GitHub Actions workflow - matrix, cache, lint, parallel tests

Trigger: push/PR on main and develop only (removed feature branch triggers).

Build job:
  - docker/setup-buildx-action@v3 (enables BuildKit)
  - Builds mongo-api, adapter-registry, query-router via docker buildx bake
  - cache-from/cache-to using GHCR registry cache

Test job (after Build):
  - docker compose -f docker-compose.ci.yml up -d
  - Runs phase1 through phase15 smoke tests sequentially

Lint job (parallel with Build):
  - hadolint on all Dockerfiles in docker/services/
  - shellcheck on scripts/*.sh
  - yamllint on docker-compose.yml"

# 66
C .env.example
COMMIT "chore(env): update .env.example with all new variables and port overrides

Added:
  ENCRYPTION_KEY, ADAPTER_REGISTRY_URL, QUERY_ROUTER_URL, SERVICE_ROLE_JWT
  GRAFANA_PORT=3030, PROM_PORT=9090, LOKI_PORT=3100
  All 13 port override variables (commented out by default)
  # PROFILES=extras  (container profile selector)
  # COMPOSE_BAKE=true  (delegate compose builds to buildx bake, Docker 4.34+)"

# 67
C README.md
COMMIT "docs(readme): rewrite README.md with architecture overview and quick-start

1. What is mini-baas? - self-hosted polyglot BaaS: PostgreSQL + MongoDB +
   Trino federation behind Kong gateway with GoTrue JWT auth.

2. ASCII architecture diagram: Client → Kong → [GoTrue, PostgREST,
   mongo-api, adapter-registry, query-router, realtime, Trino]

3. Quick start: git clone && make all (9 images, 13 services)
              make all-full (12 images, 16 services with extras)

4. Service port table (16 services with defaults and env override names)

5. make targets reference + compose profiles explanation

6. .env.example walkthrough pointing to key variables"

# 68
C Makefile
COMMIT "feat(makefile): add migrate, observe, adapter, secrets, preflight target groups

migrate family:    migrate, migrate-mongo, migrate-down, migrate-status
secrets family:    secrets, secrets-validate, secrets-rotate, check-secrets
observe family:    observe, observe-down, grafana, prometheus
adapter family:    adapter-add, adapter-ls
utility family:    preflight, env, hooks, update
build extras:      build-optimized (buildx bake), image-sizes, pin-digests

These targets are documented in the ##@ sections of 'make help' output.
All targets use \$(DC) for consistent --profile propagation.
Internal helper targets (_require-docker, _require-compose) are prefixed
with _ and hidden from help output (no ## comment)."

# 69  — final sweep
$GIT add -A
COMMIT "chore: final sweep - stage all remaining untracked and modified files

Ensures the refactor branch is fully committed before review.
Covers any files touched after the main commit sequence:
  - docker/ service files not individually committed
  - config/ tree files
  - sandbox/ files
  - Remaining script files
  - .vscode/ workspace settings

Summary of the full 70-commit refactor sequence:
  Removed: deployments/ (legacy), playground/ (moved), services/ (stale),
            BaaS_MVP.md, TEST_ANALYSIS.md, ToDo_list.txt, tooling/README.md
  Added:   docker/services/ (15 services), docker/contracts/ (4 boundaries),
            docker-bake.hcl, docker-compose.ci.yml, docker-compose.prod.yml,
            scripts/resolve-ports.sh, check-secrets.sh, pin-digests.sh,
            preflight-check.sh, migrations/postgresql(5), migrations/mongodb(2),
            secrets/(3 scripts), config/prometheus, config/grafana, config/loki,
            config/promtail, sandbox/apps/playground, sandbox/apps/app2
  Modified: docker-compose.yml (image: for 13 services, profiles, port vars),
            Makefile (42 classics, parallel build, auto port resolution),
            .env.example, README.md, .github/workflows/ci.yml, .gitignore"

echo ""
echo "=== All commits complete ==="
echo ""
git log --oneline | head -80
