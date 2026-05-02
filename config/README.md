# mini-baas-infra configuration

The config system is additive and non-breaking. Missing keys fall back to defaults in the Compose files or service images.

## Files

- `mini-baas-infra.conf`: global environment, domains, and port defaults.
- `services.conf`: service toggles consumed by `scripts/mini-baas-config.sh`.
- `postgres.conf`: PostgreSQL defaults and project SQL init paths.
- `kong.conf`: Kong gateway defaults and CORS origins.
- `profiles/<name>/*.conf`: project-specific overrides loaded after root config.

## Service toggles

Values accepted as enabled: `true`, `yes`, `1`, `on`, `enabled`.
Anything else is disabled.

The `track-binocle` profile enables only:

- `postgres`
- `supavisor`
- `postgrest`
- `pg-meta`
- `kong`
- `redis`

One-shot initialization containers may run as dependencies, but long-running disabled services are not started.

## Important keys

| Key | File | Default | Description |
| --- | --- | --- | --- |
| `ENV` | `mini-baas-infra.conf` | `development` | Deployment environment label. |
| `LOG_LEVEL` | `mini-baas-infra.conf` | `info` | Shared service logging level. |
| `BASE_DOMAIN` | `mini-baas-infra.conf` | `localhost` | Base local domain. |
| `API_EXTERNAL_URL` | `mini-baas-infra.conf` | `http://localhost:8000` | Public API gateway URL. |
| `FRONTEND_URL` | `mini-baas-infra.conf` | `http://localhost:4321` | Frontend origin used for CORS. |
| `KONG_HTTP_PORT` | `kong.conf` / `mini-baas-infra.conf` | `8000` | Public SDK/API gateway port. |
| `KONG_ADMIN_PORT` | `kong.conf` / `mini-baas-infra.conf` | `8001` | Local Kong admin port. |
| `PG_PORT` | `mini-baas-infra.conf` | `55432` | Optional localhost-only Postgres admin port. |
| `POSTGRES_USER` | `postgres.conf` / `.env` | `postgres` | PostgreSQL user. |
| `POSTGRES_DB` | `postgres.conf` / `.env` | `postgres` | PostgreSQL database. |
| `SCHEMA_FILE` | `postgres.conf` | `../../../models/user.sql` | Project schema source. |
| `SEED_FILE` | `postgres.conf` | `../../../models/seeds.sql` | Project seed source. |
| `PROJECT_INIT_MARKER` | `postgres.conf` | `track_binocle_20260503` | Idempotency marker stored in Postgres. |

## Commands

```bash
make config-services PROFILE=track-binocle
make config-up PROFILE=track-binocle
make config-down PROFILE=track-binocle
```

The SDK and frontend should use Kong only, for example `http://localhost:8000`.
