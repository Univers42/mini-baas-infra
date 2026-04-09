# MongoDB REST API

Custom MongoDB REST API service with **pino** structured logging and **Prometheus** metrics. Provides a full CRUD interface over MongoDB collections via HTTP, with JWT-based authentication and JSON Schema validation.

## Quick Start

```bash
docker compose up mongo-api
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | — | MongoDB connection string |
| `MONGO_DB_NAME` | `baas` | Default database name |
| `JWT_SECRET` | — | Shared JWT secret for token verification |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `MONGO_MAX_POOL_SIZE` | `10` | Maximum MongoDB connection pool size |
| `PORT` | `3010` | HTTP server port |

## Endpoints

### Data Operations

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/collections/:name/documents` | Insert a document |
| `GET` | `/collections/:name/documents` | List documents (supports query params) |
| `GET` | `/collections/:name/documents/:id` | Get a single document by ID |
| `PATCH` | `/collections/:name/documents/:id` | Update a document |
| `DELETE` | `/collections/:name/documents/:id` | Delete a document |

### Admin Operations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/collections` | List all collections |
| `PUT` | `/admin/schemas/:name` | Create or update a JSON Schema for a collection |
| `DELETE` | `/admin/schemas/:name` | Remove a collection's schema |
| `POST` | `/admin/indexes/:name` | Create an index on a collection |

### Observability

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/metrics` | Prometheus metrics |

## CLI Examples

```bash
# Health check
curl -s http://localhost:3010/health | jq .

# Insert a document
curl -s -X POST http://localhost:3010/collections/users/documents \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "alice@example.com"}' | jq .

# List documents
curl -s http://localhost:3010/collections/users/documents \
  -H "Authorization: Bearer <jwt>" | jq .

# List with query filter
curl -s 'http://localhost:3010/collections/users/documents?name=Alice' \
  -H "Authorization: Bearer <jwt>" | jq .

# Get a single document
curl -s http://localhost:3010/collections/users/documents/<document_id> \
  -H "Authorization: Bearer <jwt>" | jq .

# Update a document
curl -s -X PATCH http://localhost:3010/collections/users/documents/<document_id> \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@updated.com"}' | jq .

# Delete a document
curl -s -X DELETE http://localhost:3010/collections/users/documents/<document_id> \
  -H "Authorization: Bearer <jwt>"

# List all collections (admin)
curl -s http://localhost:3010/admin/collections \
  -H "Authorization: Bearer <jwt>" | jq .

# Set a JSON Schema on a collection
curl -s -X PUT http://localhost:3010/admin/schemas/users \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "bsonType": "object",
    "required": ["name", "email"],
    "properties": {
      "name": { "bsonType": "string" },
      "email": { "bsonType": "string" }
    }
  }' | jq .

# Create an index
curl -s -X POST http://localhost:3010/admin/indexes/users \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"keys": {"email": 1}, "options": {"unique": true}}' | jq .

# Prometheus metrics
curl -s http://localhost:3010/metrics
```

## Health Check

```bash
curl -sf http://localhost:3010/health
```

Returns `200 OK` with `{"status":"ok"}` when the service and MongoDB connection are healthy.

## Docker

- **Image:** Custom build (`docker/services/mongo-api`)
- **Port:** `3010`
- **Depends on:** `mongo`
- **Networks:** Internal `baas` network
