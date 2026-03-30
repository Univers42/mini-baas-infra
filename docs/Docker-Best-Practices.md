# Docker Best Practices (Current Repository)

This document captures practical Docker guidance for the current mini-baas-infra stack.

## Operating Model

- Runtime orchestration is Docker Compose (`docker-compose.yml`).
- Primary operator interface is Make targets in `Makefile`.
- Most services run from upstream/prebuilt infrastructure images.
- Kong is configured declaratively from `deployments/base/kong/kong.yml`.

## Daily Workflow Recommendations

1. Use Make targets first (`make compose-up`, `make compose-down`, `make tests`).
2. Use direct `docker compose` only for debugging or targeted inspection.
3. Keep `.env` generated and consistent before integration test runs.
4. Prefer `make compose-down-volumes` before credential resets to avoid stale DB state.

## Image Management Practices

- Keep explicit image tags via `IMAGE_TAG` when publishing.
- Avoid mutable production tags in release pipelines.
- Use `make docker-build` to normalize local image names (`mini-baas/<service>:<tag>`).
- Use `make docker-tag` and `make docker-push` for registry publish flows.

## Kong Configuration Practices

- Treat `deployments/base/kong/kong.yml` as the source of truth.
- Validate declarative config before restart.
- Keep policy changes incremental: routing first, then auth, then limits.
- Re-test route behavior after every plugin update.

Validation command:

```bash
docker run --rm -e KONG_DATABASE=off \
  -e KONG_DECLARATIVE_CONFIG=/tmp/kong.yml \
  -v "$PWD/deployments/base/kong/kong.yml:/tmp/kong.yml:ro" \
  kong:3.8 kong config parse /tmp/kong.yml
```

## Compose and Container Hygiene

- Use health checks and startup ordering (`depends_on` with conditions) for core services.
- Keep container names stable for predictable diagnostics.
- Mount config files read-only whenever possible.
- Separate persistent volumes by service domain (`postgres-data`, `minio-data`, `redis-data`).

## Security and Secrets

- Keep generated secrets in `.env` and never commit them.
- Rotate JWT and service keys for shared environments.
- Restrict CORS origins in non-local profiles.
- Treat static local API keys as development-only defaults.

## Testing and CI Practices

- Use `make tests` as the integration gate (phases 1-13).
- Keep shell scripts lint-clean (`bash -n`, `shellcheck`).
- Capture compose logs on failures for deterministic triage.
- Avoid weakening assertions in tests; prefer explicit failures over optional pass notes.

## Troubleshooting Patterns

### Stack starts but auth flow fails
- Verify `JWT_SECRET` alignment across GoTrue and PostgREST.
- Check Kong route policies and key-auth behavior.
- Inspect logs with `make compose-logs SERVICE=gotrue` and `make compose-logs SERVICE=postgrest`.

### Bootstrap/auth errors after env changes
- Stop and remove volumes, then restart clean:

```bash
make compose-down-volumes
make compose-up
```

### Route mismatch errors
- Re-validate `kong.yml`.
- Confirm route paths in tests and docs match current declarative config.

## Quick Checklist

- [ ] `make compose-up` succeeds.
- [ ] `make compose-health` succeeds for expected endpoints.
- [ ] `make tests` passes.
- [ ] `kong config parse` succeeds after route/plugin edits.
- [ ] Docs are updated when commands/routes change.
