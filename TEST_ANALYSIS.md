# Mini-BaaS Test Coverage Analysis (Dual Data Planes)

## Scope

This document describes what is currently tested across both data planes:

- PostgreSQL plane (GoTrue + PostgREST via Kong)
- MongoDB plane (Mongo HTTP API via Kong)

Primary test entrypoints:

- `make tests` (runs phases 1-15)
- `make test-phase<N>` (runs individual phase)
- `make flow-postgres-mvp` (focused PostgreSQL MVP flow)

## Current Automated Phases

- Phase 1: Kong routing + auth + REST smoke
- Phase 2: key-auth, gateway security controls, payload limits
- Phase 3: authenticated PostgreSQL access
- Phase 4: PostgreSQL user isolation / access-control behavior
- Phase 5: REST metadata reachability
- Phase 6: PostgreSQL CRUD methods and mutations
- Phase 7: error handling and edge cases
- Phase 8: token lifecycle and refresh
- Phase 9: storage operations and payload checks
- Phase 10: advanced PostgreSQL mutations and query semantics
- Phase 11: realtime route and websocket checks
- Phase 12: rate limiting behavior
- Phase 13: CORS preflight and cross-origin behavior
- Phase 14: Mongo MVP gateway + CRUD + isolation (shell)
- Phase 15: Mongo MVP comprehensive integration (Python)

## Coverage By Data Plane

### PostgreSQL Data Plane Coverage

Primary scripts:

- `scripts/phase3-authenticated-db-test.sh`
- `scripts/phase4-user-isolation-test.sh`
- `scripts/phase6-http-methods-test.sh`
- `scripts/phase10-data-mutation-complex-queries-test.sh`
- `scripts/postgres-mvp-flow.sh`

What is tested:

- Authenticated access to `/rest/v1/*` with JWT + apikey
- Read behavior on relational tables (`users`, `user_profiles`, `posts`)
- CRUD mutation flow: create, read, patch, delete
- Query semantics: filters, OR conditions, ordering, pagination
- Upsert and conflict handling (`on_conflict` behavior)
- HEAD/count behavior (`Content-Range` checks)
- Validation/error behavior (invalid UUID filters, malformed JWT, unauthorized requests)
- Multi-user isolation checks through separate JWT sessions

### MongoDB Data Plane Coverage

Primary scripts:

- `scripts/phase14-mongo-mvp-test.sh`
- `scripts/phase15-mongo-mvp-test.py`

What is tested:

- Key-auth protection on `/mongo/v1/health` (missing, invalid, valid apikey)
- Auth bootstrap for two users (signup/login) and JWT acquisition
- CRUD on `/mongo/v1/collections/:name/documents`
	- create document
	- list documents
	- get by id
	- patch document
	- delete document
- Multi-tenant isolation (user B cannot GET/PATCH/DELETE user A document)
- Post-delete behavior (GET returns not found)
- Validation and security checks
	- forbidden fields (`owner_id`) rejected
	- missing Authorization rejected
	- invalid object id rejected

Phase 15 currently executes 19 explicit test checks and is included in `make tests`.

### Dynamic Data Generation Status (Playground MVP)

- PostgreSQL demo data is dynamically generated in the playground flow (`order_number`, totals, status, auth user context).
- MongoDB demo data is dynamically generated in the playground flow (`sku`, name, category, price, tags, stock state, auth user context).
- Both planes are created through gateway calls at runtime, not pre-seeded static demo rows/documents.

## Shared Cross-Plane Controls Coverage

These tests apply to platform behavior used by both data planes:

- Auth route behavior and token issuance (`/auth/v1/*`)
- Gateway key-auth enforcement
- Rate-limiting headers and enforcement behavior
- CORS preflight and cross-origin behavior
- Common error handling for invalid/malformed requests

Primary scripts:

- `scripts/phase1-smoke-test.sh`
- `scripts/phase2-smoke-test.sh`
- `scripts/phase7-error-handling-test.sh`
- `scripts/phase8-token-lifecycle-test.sh`
- `scripts/phase12-rate-limiting-test.sh`
- `scripts/phase13-cors-preflight-test.sh`

## Coverage Matrix (MVP)

| Capability | PostgreSQL Plane | MongoDB Plane | Automated In |
|---|---|---|---|
| Kong key-auth | Yes | Yes | Phases 1, 2, 14, 15 |
| JWT login/signup | Yes | Yes | Phases 1, 3, 4, 8, 14, 15 |
| CRUD happy path | Yes | Yes | Phases 6, 10, 14, 15 |
| User isolation | Yes (JWT/RLS behavior checks) | Yes (owner-scoped 404 behavior) | Phases 4, 14, 15 |
| Validation failures | Yes (filters/tokens/errors) | Yes (forbidden fields, invalid id, missing auth) | Phases 7, 10, 15 |
| CORS behavior | Yes | Indirect via gateway policy | Phase 13 |
| Rate limiting | Yes | Indirect (gateway-level policy) | Phase 12 |

## CI Integration

`make tests` executes all 15 phases in CI/local runs and aggregates pass/fail counts.

Current CI confidence level is strong for MVP integration because both planes are validated through Kong with auth, CRUD, and isolation checks.

## Known Gaps / Next Hardening Targets

1. Some PostgreSQL phases still allow permissive status ranges where stricter assertions could catch regressions earlier.
2. Contract parity tests between PostgreSQL and Mongo response envelopes are not formalized yet.
3. Load/performance and concurrency tests are not part of the phase suite.
4. Failure-injection scenarios (service restarts/network faults) are not yet automated.
5. Mongo aggregation/query-complexity limits are not yet covered in dedicated tests.

## Bottom Line

For the MVP, automated coverage is now present for both data planes, including gateway security, auth, CRUD behavior, and tenant isolation. The next step is hardening assertion strictness and adding performance/resilience coverage rather than expanding core functional scope.
