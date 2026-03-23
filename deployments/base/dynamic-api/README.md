# dynamic-api

MVP dynamic API service with pluggable storage engines.

## Supported Engines

- postgres (default)
- mongodb

The service selects its adapter at startup using `DB_ENGINE`.

## Environment Variables

- `PORT`: HTTP port (default `8080`)
- `DB_ENGINE`: `postgres` or `mongodb` (default `postgres`)
- `DB_DSN`: PostgreSQL DSN for the postgres adapter
- `MONGODB_URI`: MongoDB connection URI
- `MONGODB_DATABASE`: MongoDB database name
- `MONGODB_COLLECTION`: MongoDB collection used by the MVP

## Endpoints

- `GET /health`: service and selected engine status
- `POST /records`: create a record from arbitrary JSON payload
- `GET /records?limit=20`: list recent records (max limit 100)

## Local Quick Start

Run with Docker Compose and default PostgreSQL mode:

```bash
docker compose -f docker-compose.build.yml up -d postgres mongo dynamic-api
```

Switch to MongoDB mode:

```bash
DB_ENGINE=mongodb docker compose -f docker-compose.build.yml up -d dynamic-api
```

Create a record:

```bash
curl -sS -X POST http://localhost:8002/records \
	-H "content-type: application/json" \
	-d '{"entity":"orders","status":"pending","total":123.45}'
```

List records:

```bash
curl -sS "http://localhost:8002/records?limit=10"
```
