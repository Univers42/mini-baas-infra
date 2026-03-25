# mini-baas-infra

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

## Notes

- Use a `.env` file for production-like values.
- Some service defaults are placeholders for fast local bootstrapping.
- For a full reset, run `make fclean`.
