# mini-baas-infra

Tool-agnostic Kubernetes infrastructure repository for the mini-baas platform.

## Purpose

This repository is intentionally independent from Kustomize or Helm.
It centralizes environment contracts, service deployment conventions, and delivery workflows.

## Structure

- `docs/`: architecture decisions and operational notes.
- `platform/`: cluster and namespace-level conventions.
- `services/contracts/`: per-service deployment contract docs.
- `deployments/base/`: canonical Kubernetes resource definitions.
- `deployments/overlays/`: environment-specific customizations.
- `tooling/kustomize/`: optional Kustomize entrypoints.
- `tooling/helm/`: optional Helm entrypoints.
- `argocd/applications/`: optional GitOps app manifests.
- `scripts/`: platform bootstrap and promotion helpers.

## Services in Scope

- `api-gateway`
- `auth-service`
- `dynamic-api`
- `schema-service`

`shared-library` is treated as a build-time dependency unless it evolves into a network service.

## Local Infrastructure With Docker Compose

This repository now includes a root `docker-compose.yml` that mirrors the service images used in `Makefile`:

- `trinodb/trino`
- `supabase/gotrue:v2.188.1`
- `postgrest/postgrest:devel`
- `supabase/realtime`
- `minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1`
- `redis:trixie`
- `supabase/supavisor:2.7.4`
- `supabase/studio`

### Start and Stop

Use Make targets:

```bash
make compose-up
make compose-ps
make compose-logs
make compose-down
```

Or run Compose directly:

```bash
docker compose up -d
```

### Notes

- Some services (GoTrue, PostgREST, Realtime, Supavisor, Studio) expect external dependencies, especially PostgreSQL.
- The compose file ships with default placeholder environment values so the stack can be bootstrapped quickly.
- For a fully functional setup, provide real values via shell environment variables or a `.env` file.