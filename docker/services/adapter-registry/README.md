# Adapter Registry

Database credential management service with **AES-256-GCM** encryption. Allows tenants to register external database connections (PostgreSQL, MongoDB, etc.) and securely retrieve connection details at runtime. Credentials are encrypted at rest using a vault encryption key.

## Quick Start

```bash
docker compose up adapter-registry
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string for storing registry data |
| `JWT_SECRET` | — | Shared JWT secret for token verification |
| `VAULT_ENC_KEY` | — | AES-256 encryption key for credential storage |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `PORT` | `3020` | HTTP server port |

## Endpoints

### Database Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/databases` | Register a new database connection |
| `GET` | `/databases` | List all registered databases (for current tenant) |
| `GET` | `/databases/:id` | Get details of a specific database |
| `DELETE` | `/databases/:id` | Remove a registered database |
| `GET` | `/databases/:id/connect` | Get decrypted connection info for a database |

### Health & Observability

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health/live` | Liveness probe |
| `GET` | `/health/ready` | Readiness probe (checks DB connectivity) |
| `GET` | `/metrics` | Prometheus metrics |

## CLI Examples

```bash
# Register a PostgreSQL database
curl -s -X POST http://localhost:3020/databases \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-postgres",
    "engine": "postgresql",
    "host": "external-db.example.com",
    "port": 5432,
    "database": "myapp",
    "username": "admin",
    "password": "s3cret"
  }' | jq .

# Register a MongoDB database
curl -s -X POST http://localhost:3020/databases \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-mongo",
    "engine": "mongodb",
    "host": "mongo.example.com",
    "port": 27017,
    "database": "analytics",
    "username": "admin",
    "password": "s3cret"
  }' | jq .

# List all registered databases
curl -s http://localhost:3020/databases \
  -H "Authorization: Bearer <jwt>" | jq .

# Get a specific database
curl -s http://localhost:3020/databases/<database_id> \
  -H "Authorization: Bearer <jwt>" | jq .

# Get decrypted connection info
curl -s http://localhost:3020/databases/<database_id>/connect \
  -H "Authorization: Bearer <jwt>" | jq .

# Delete a registered database
curl -s -X DELETE http://localhost:3020/databases/<database_id> \
  -H "Authorization: Bearer <jwt>"

# Liveness probe
curl -sf http://localhost:3020/health/live

# Readiness probe
curl -sf http://localhost:3020/health/ready

# Prometheus metrics
curl -s http://localhost:3020/metrics
```

## Health Check

```bash
# Liveness (service is running)
curl -sf http://localhost:3020/health/live

# Readiness (service + database connection OK)
curl -sf http://localhost:3020/health/ready
```

Both return `200 OK` when healthy.

## Docker

- **Image:** Custom build (`docker/services/adapter-registry`)
- **Port:** `3020`
- **Depends on:** `postgres`
- **Networks:** Internal `baas` network
