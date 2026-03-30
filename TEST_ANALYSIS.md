# Mini-BaaS Test Coverage Analysis (Current)

## Status Summary

The repository currently includes automated phase tests for gateway routing, auth flows, database access, storage operations, realtime gateway behavior, rate limiting, and CORS.

Current implemented phases:
- Phase 1: Routing, signup/login, and JWT issuance through Kong
- Phase 2: Gateway key-auth and security controls
- Phase 3: Authenticated database access through PostgREST
- Phase 4: User isolation and RLS-oriented checks
- Phase 5: Database metadata endpoint validation with REST fallback
- Phase 6: HTTP methods and data mutation coverage
- Phase 7: Error handling and edge-case validation
- Phase 8: Token lifecycle and refresh behavior
- Phase 9: Storage operations and payload limit checks
- Phase 10: Complex queries and mutation patterns
- Phase 11: Realtime route and WebSocket gateway checks
- Phase 12: Rate-limiting policy behavior checks
- Phase 13: CORS preflight and cross-origin header checks

The aggregate Make target runs all phases via:
- make tests

## CI Coverage

CI currently validates:
- shell syntax and shellcheck for scripts
- full compose bring-up
- gateway health wait loop
- complete phase suite execution via make tests
- compose artifact capture on success and failure

## What Is Strongly Covered

- Gateway path enforcement with API key controls
- Auth signup/login/token handling
- JWT-protected REST access patterns
- Basic and advanced CRUD/query patterns
- Storage bucket/object lifecycle checks
- Realtime route reachability and upgrade-path validation
- CORS and preflight behavior on key routes

## Current Gaps (Hardening Phase)

1. Some late-phase checks are permissive and should fail harder on weak behavior.
2. SQL route behavior (`/sql/v1/info`) versus REST metadata fallback should be formalized.
3. Production-oriented policy checks (strict CORS origin strategy, key rotation workflows) are not yet codified as tests.
4. Service-contract-level assertions for non-core services are still limited.

## Recommended Next Additions

1. Tighten phase assertions where optional checks currently count as pass.
2. Add explicit regression test for whichever metadata route policy is chosen.
3. Add environment-profile tests (local permissive vs production restrictive CORS/policies).
4. Add targeted validation for pg-meta and studio integration health paths.

## Bottom Line

The suite is broad enough for active local development and integration confidence. The next quality step is assertion strictness and policy hardening, not foundational coverage expansion.
