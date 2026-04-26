# Fly.io Production Deployment

This guide explains how to deploy mini-BaaS as a distributed production system on Fly.io.

## Deployment Model

mini-BaaS uses a **multi-app Fly.io topology**.

Each service is deployed as an independent Fly app:

| Logical service    | Default Fly app                |
| ------------------ | ------------------------------ |
| gateway            | `mini-baas-gateway`            |
| auth               | `mini-baas-auth`               |
| postgrest          | `mini-baas-postgrest`          |
| mongo-api          | `mini-baas-mongo-api`          |
| adapter-registry   | `mini-baas-adapter-registry`   |
| query-router       | `mini-baas-query-router`       |
| schema-service     | `mini-baas-schema-service`     |
| storage-router     | `mini-baas-storage-router`     |
| permission-engine  | `mini-baas-permission-engine`  |
| analytics-service  | `mini-baas-analytics-service`  |
| gdpr-service       | `mini-baas-gdpr-service`       |
| newsletter-service | `mini-baas-newsletter-service` |
| ai-service         | `mini-baas-ai-service`         |
| log-service        | `mini-baas-log-service`        |
| session-service    | `mini-baas-session-service`    |
| realtime           | `mini-baas-realtime`           |

The gateway is the only public Fly app. Other apps are reachable only via Fly private networking.

## Files

Fly deployment files live in [deploy/fly](../deploy/fly):

- `gateway.fly.toml`
- one `*.fly.toml` per microservice
- `gateway.Dockerfile`
- `render-kong-config.sh`
- `services.env`

Automation lives in [scripts/fly](../scripts/fly):

- `deploy.sh`
- `secrets-from-env.sh`
- `status.sh`
- `smoke.sh`

## Prerequisites

Install and authenticate Fly CLI:

```bash
flyctl auth login
```

Use managed backing services for production where possible:

- PostgreSQL: Fly Postgres or managed Postgres
- MongoDB: MongoDB Atlas or compatible managed provider
- Redis: Upstash or managed Redis
- Object storage: S3, Cloudflare R2, Tigris, Backblaze B2, or managed MinIO

## Naming

Default app prefix is `mini-baas`.

Override it for a real deployment:

```bash
export FLY_APP_PREFIX=my-company-baas
export FLY_ORG=my-fly-org
export FLY_REGION=cdg
```

Then apps become:

```text
my-company-baas-gateway
my-company-baas-auth
my-company-baas-query-router
...
```

## Deployment Order

Deploy infrastructure and core services before the gateway:

```text
1. managed databases / Redis / S3
2. adapter-registry
3. auth
4. postgrest
5. mongo-api
6. permission-engine
7. query-router
8. schema-service
9. storage-router
10. optional product services
11. realtime
12. gateway last
```

The default `scripts/fly/deploy.sh` order follows [deploy/fly/services.env](../deploy/fly/services.env), where gateway is last.

## Secrets

Never commit production secrets.

For a first deployment, fill `.env` with production-equivalent values or use `ENV_FILE=/path/to/prod.env`.

Dry-run secret loading:

```bash
DRY_RUN=1 FLY_APP_PREFIX=my-company-baas bash scripts/fly/secrets-from-env.sh
```

Push secrets:

```bash
FLY_APP_PREFIX=my-company-baas bash scripts/fly/secrets-from-env.sh
```

Push secrets for one service:

```bash
SERVICE=query-router FLY_APP_PREFIX=my-company-baas make fly-secrets
```

Important secrets include:

- `JWT_SECRET`
- `KONG_PUBLIC_API_KEY`
- `KONG_SERVICE_API_KEY`
- `DATABASE_URL`
- `PGRST_DB_URI`
- `MONGO_URI`
- `ADAPTER_REGISTRY_SERVICE_TOKEN`
- `VAULT_ENC_KEY`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- SMTP credentials
- LLM credentials if AI service is enabled

## Deploy

Deploy every service:

```bash
FLY_APP_PREFIX=my-company-baas make fly-deploy
```

Deploy one service:

```bash
SERVICE=query-router FLY_APP_PREFIX=my-company-baas make fly-deploy
```

Deploy gateway after all private services are healthy:

```bash
SERVICE=gateway FLY_APP_PREFIX=my-company-baas make fly-deploy
```

## Status

Show status for all apps:

```bash
FLY_APP_PREFIX=my-company-baas make fly-status
```

Show one service:

```bash
SERVICE=gateway FLY_APP_PREFIX=my-company-baas make fly-status
```

## Smoke Test

After pointing DNS to the gateway app:

```bash
BAAS_URL=https://api.example.com make fly-smoke
```

The smoke test checks gateway-routed health endpoints using the anon key from `.env` unless `APIKEY` is explicitly provided.

## Gateway Routing on Fly

The gateway image renders the existing Kong declarative config at runtime.

Compose upstreams such as:

```text
http://query-router:4001
```

are rewritten to Fly private DNS upstreams such as:

```text
http://my-company-baas-query-router.internal:4001
```

The `secrets-from-env.sh` script sets those upstream URLs based on `FLY_APP_PREFIX`.

## Production Notes

- Keep `min_machines_running = 2` for the gateway.
- Keep internal services private-only.
- Scale query-router and realtime independently.
- Use managed databases unless strict self-hosting is required.
- Add OpenTelemetry tracing before serious production load.
- Add central JSON log ingestion and alerting.
