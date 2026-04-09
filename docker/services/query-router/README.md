# Query Router

Universal query gateway that routes CRUD operations to registered databases. Resolves database connections through the **Adapter Registry**, then proxies requests to the appropriate engine (PostgreSQL, MongoDB, etc.). Provides a unified REST interface regardless of the underlying database type.

## Quick Start

```bash
docker compose up query-router
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADAPTER_REGISTRY_URL` | `http://adapter-registry:3020` | URL of the Adapter Registry service |
| `JWT_SECRET` | — | Shared JWT secret for token verification |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `PORT` | `4001` | HTTP server port |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:dbId/tables` | List tables/collections in a registered database |
| `GET` | `/:dbId/tables/:table` | Read rows/documents from a table or collection |
| `POST` | `/:dbId/tables/:table` | Insert rows/documents |
| `PATCH` | `/:dbId/tables/:table` | Update rows/documents |
| `DELETE` | `/:dbId/tables/:table` | Delete rows/documents |
| `GET` | `/health` | Health check |

## CLI Examples

```bash
# Prerequisite: register a database in the adapter registry first
# and note the returned database ID (e.g., "db_abc123")

# List tables in a registered database
curl -s http://localhost:4001/db_abc123/tables \
  -H "Authorization: Bearer <jwt>" | jq .

# Read rows from a table
curl -s http://localhost:4001/db_abc123/tables/users \
  -H "Authorization: Bearer <jwt>" | jq .

# Read with query parameters (filtering)
curl -s 'http://localhost:4001/db_abc123/tables/users?name=Alice&limit=10' \
  -H "Authorization: Bearer <jwt>" | jq .

# Insert a row/document
curl -s -X POST http://localhost:4001/db_abc123/tables/users \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "alice@example.com"}' | jq .

# Update rows/documents
curl -s -X PATCH http://localhost:4001/db_abc123/tables/users \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {"name": "Alice"},
    "update": {"email": "alice@updated.com"}
  }' | jq .

# Delete rows/documents
curl -s -X DELETE http://localhost:4001/db_abc123/tables/users \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"filter": {"name": "Alice"}}' | jq .

# Health check
curl -sf http://localhost:4001/health
```

## How It Works

1. Client sends a request to `/:dbId/tables/:table`
2. Query Router calls the Adapter Registry to resolve `dbId` → connection details
3. Based on the engine type (`postgresql`, `mongodb`, etc.), the router delegates to the appropriate driver
4. Results are returned in a unified JSON format

```
Client → Query Router → Adapter Registry (lookup)
                      → PostgreSQL / MongoDB / ... (execute)
                      → Client (response)
```

## Health Check

```bash
curl -sf http://localhost:4001/health
```

Returns `200 OK` with `{"status":"ok"}` when the service is running.

## Docker

- **Image:** Custom build (`docker/services/query-router`)
- **Port:** `4001`
- **Depends on:** `adapter-registry`
- **Networks:** Internal `baas` network
