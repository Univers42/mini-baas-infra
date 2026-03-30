# mini-baas-infra

![CI](https://github.com/Univers42/mini-baas-infra/actions/workflows/ci.yml/badge.svg)

Docker Compose infrastructure repository for the mini-baas platform.

## Purpose

This repository centralizes local infrastructure orchestration, image workflows, and service contracts for the platform.

## Structure

- `docs/`: architecture decisions and operational notes.
- `services/contracts/`: per-service contract documentation.
- `deployments/base/`: service source code, Dockerfiles, and runtime configuration.
- `scripts/`: helper scripts.
- `docker-compose.yml`: prebuilt stack definition.
- `docker-compose.build.yml`: build-from-source stack definition.

## Services in Scope

- `api-gateway`
- `auth-service`
- `dynamic-api`
- `schema-service`
- `kong`
- `trino`
- `postgres`
- `mongo`
- `gotrue`
- `postgrest`
- `realtime`
- `minio`
- `redis`
- `supavisor`
- `studio`
- `playground`

## Quick Start

```bash
make compose-up
make compose-ps
make compose-logs
```

Stop the stack:

```bash
make compose-down
```

## Build Workflow

Pull and tag prebuilt images:

```bash
make docker-build IMAGE_TAG=latest
```

Start build-enabled stack (builds app services from source):

```bash
make compose-up-build
```

## Useful Endpoints

- Gateway: `http://localhost:8000/`
- Auth health: `http://localhost:8000/auth/health`
- SQL info (via gateway): `http://localhost:8000/sql/v1/info`
- Studio: `http://localhost:3001/`
- Playground: `http://localhost:3100/`

## Frontend Playground (libcss Submodule)

The repository includes a visual playground frontend in `playground/` that uses CSS built from the `vendor/libcss` submodule.

Start it with:

```bash
make playground-up
```

This target:

- installs `vendor/libcss` dependencies,
- builds `vendor/libcss/dist/css/libcss.min.css`,
- starts an nginx container serving the playground at `http://localhost:3100`.

Useful playground commands:

```bash
make playground-logs
make playground-down
```

## Gateway Security (Phase 2)

Kong now enforces API key auth on core BaaS routes:
- `/auth/v1`
- `/rest/v1`
- `/realtime/v1`
- `/storage/v1`

Local default keys are defined in `.env.example` and declarative Kong config:
- Public key: `public-anon-key`
- Service key: `service-role-key`

Example:

```bash
curl -i http://localhost:8000/rest/v1/ \
	-H "apikey: public-anon-key"
```

Phase 2 security smoke test:

```bash
make test-phase2
```

Optional rate-limit stress check:

```bash
RUN_RATE_LIMIT_TEST=true RATE_LIMIT_BURST=70 make test-phase2
```

Phase 5 database info retrieval test:

```bash
make test-phase5
```

## Expanded Test Suites (Phases 6-10)

**Phase 6: HTTP Methods & Data Mutations** — Tests CRUD operations (POST, GET, PATCH, PUT, DELETE)

```bash
make test-phase6
```

**Phase 7: Error Handling & Edge Cases** — Tests validation, error responses, security boundaries

```bash
make test-phase7
```

**Phase 8: Token Lifecycle & Refresh** — Tests JWT token generation, claims, refresh, and expiration

```bash
make test-phase8
```

**Phase 9: Storage Service Operations (MinIO)** — Tests bucket/object lifecycle plus storage gateway limits

```bash
make test-phase9
```

**Phase 10: Data Mutations & Complex Queries** — Tests batch insert, upsert, pagination, ordering, filters, and count headers

```bash
make test-phase10
```

## Running All Tests

`make tests` executes all 10 test phases and prints an overall summary with aggregated passed/failed counts across all phases.

## Continuous Integration

GitHub Actions now runs CI on push and pull requests:

- Shell checks (`bash -n` and `shellcheck`) for all scripts in `scripts/`
- Full Docker Compose integration run with `make tests`
- Automatic compose log artifact upload on success/failure

Workflow file: `.github/workflows/ci.yml`

## Notes

- Use a `.env` file for production-like values.
- Some service defaults are placeholders for fast local bootstrapping.
- For a full reset, run `make fclean`.
