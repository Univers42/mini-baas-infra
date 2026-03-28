# Infrastructure Change Log

## 2026-03-28

### Kong Database Authentication Integration (Phase 3 & 4)

**Kong Gateway Enhancements**:
- Added `jwt` plugin to `/rest/v1` route for JWT validation against GoTrue tokens.
- Added `request-transformer` to `/rest/v1` that:
  - Removes `apikey` header after validation
  - Adds `Authorization: Bearer $(jwt)` header for PostgREST JWT validation
- JWT configuration uses HS256 algorithm with `sub` claim for user identification.

**Database Bootstrap Enhancements**:
- Created test tables for authenticated flow validation:
  - `users`: User profiles with email and metadata
  - `user_profiles`: Extended user information (bio, avatar)
  - `posts`: User-generated content with visibility control (`is_public`)
- Enabled Row-Level Security (RLS) on all test tables.
- Created RLS policies for authenticated role:
  - Users can read/write their own data (based on JWT `sub` claim)
  - Public posts visible to all authenticated users
  - Sensitive data restricted to owner
- Added `auth.uid()` function to extract UUID from JWT claims:
  ```sql
  SELECT (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
  ```

**Test Suites**:
- **Phase 3: Authenticated Database Access** (`phase3-authenticated-db-test.sh`):
  - Tests complete flow: signup → login → JWT token → REST API access
  - Validates JWT token structure and claims
  - Tests invalid/malformed token rejection
  - Validates authenticated REST endpoint access
  
- **Phase 4: User Data Isolation** (`phase4-user-isolation-test.sh`):
  - Creates multiple test users concurrently
  - Verifies RLS policies enforce user data isolation
  - Tests JWT token swap prevention
  - Validates malformed JWT rejection
  - Confirms access control enforcement

**Makefile Updates**:
- Added `test-phase3` target: `bash ./scripts/phase3-authenticated-db-test.sh`
- Added `test-phase4` target: `bash ./scripts/phase4-user-isolation-test.sh`
- Updated `tests` target to run all 4 phases sequentially
- Updated `.PHONY` declarations to include new test targets

**Documentation**:
- Created `docs/Kong-Database-Authentication-Integration.md` with:
  - Complete architecture diagram
  - End-to-end authentication flow documentation
  - Kong plugin configuration reference
  - Environment variable requirements
  - Database schema and RLS policy details
  - All 4 test phase descriptions
  - Common troubleshooting guide
  - Production readiness checklist

### Validation

- Kong declarative config includes JWT validation without breaking existing routes.
- Phase 1 (routing) and Phase 2 (security) tests remain compatible.
- Phase 3 tests verify authenticated access to database through Kong.
- Phase 4 tests verify user data isolation via RLS policies.
- JWT token generation, validation, and claims extraction fully functional.
- `make tests` runs all 4 phases for comprehensive validation.

## 2026-03-27

### Phase 2 Gateway Hardening (Kong)

- Enabled route-level `key-auth` on `auth`, `rest`, `realtime`, and `storage` routes.
- Added declarative Kong consumers and API keys for local usage:
  - `anon` -> `public-anon-key`
  - `service_role` -> `service-role-key`
- Added route-level `rate-limiting` policies for `auth`, `rest`, `realtime`, and `storage`.
- Added `request-size-limiting` on `storage` routes (10 MB).
- Updated smoke test script to send `apikey` header by default so end-to-end validation remains green under Phase 2.
- Updated `.env.example` with local Kong API key defaults.

### Validation

- Kong declarative config parses successfully with `kong config parse`.
- `rest` route returns `401` without `apikey` and `200` with valid `apikey`.
- Full signup -> login -> JWT -> PostgREST smoke test passes through Kong with Phase 2 controls enabled.
- Added dedicated `scripts/phase2-smoke-test.sh` to validate missing/invalid API key behavior and storage request-size-limiting.
- Added `make test-phase2` target for repeatable local and CI validation.

## 2026-03-25

### Switched To Docker Compose-Only Management

- Replaced the root `Makefile` with a Docker Compose-first workflow.
- Removed all orchestration targets tied to cluster-based deployment tooling.
- Added clear Compose lifecycle targets:
  - `compose-up`
  - `compose-up-build`
  - `compose-ps`
  - `compose-logs`
  - `compose-down`
  - `compose-down-volumes`
  - `compose-restart`
  - `compose-pull`
  - `compose-health`
- Kept Docker image preparation and publishing workflows:
  - `docker-build`
  - `docker-build-<service>`
  - `docker-tag`
  - `docker-push`
  - `build-and-push`
- Updated `README.md` to align with local Docker Compose operations.

### Outcome

The repository is now documented and automated around Docker Compose as the runtime and operations entrypoint.
