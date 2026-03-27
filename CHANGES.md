# Infrastructure Change Log

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
