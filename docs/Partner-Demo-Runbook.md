# Partner Demo Runbook: Dynamic CRUD Across 5 Schemas

## Purpose

This runbook explains how to demo dynamic CRUD across both data planes in the playground:

- PostgreSQL models
- MongoDB models

The demo shows one shared UI generating CRUD actions for five different schema models and proving records exist per model.

## Demo Scope

The dynamic CRUD panel currently demonstrates these models:

1. PostgreSQL - mock_orders
2. PostgreSQL - projects
3. MongoDB - inventory_item
4. MongoDB - sensor_telemetry
5. MongoDB - customer_events

## Prerequisites

- Docker and Docker Compose available locally
- Node/npm available for playground CSS build
- Ports available: 8000, 3100, 5432, 27017

## Environment Setup

From repository root:

```bash
make compose-up
make playground-up
make compose-ps
```

Optional health checks:

```bash
curl -sS http://localhost:8000/auth/v1/health -H "apikey: public-anon-key"
curl -sS http://localhost:8000/rest/v1/ -H "apikey: public-anon-key"
curl -sS http://localhost:8000/mongo/v1/health -H "apikey: public-anon-key"
```

Open:

- Playground: http://localhost:3100

## Playground Demo Flow

1. Open the "Dual Data Planes" view.
2. In "Dynamic 5-Schema CRUD (Demo)", click "Authenticate Session".
3. Select a schema model from the dropdown.
4. Fill generated fields and click "Create".
5. Click "List" to confirm model-specific records.
6. Repeat create/list for at least one PostgreSQL model and one MongoDB model.
7. Click "List All 5 Schemas" to output consolidated proof.
8. Optionally pick a returned record id and run "Update" and "Delete".

## Proof Output (What To Show Partners)

The "List All 5 Schemas" output contains:

- current authenticated user id
- timestamp
- one entry per schema model with:
  - plane (postgres or mongo)
  - resource name
  - HTTP status
  - record count
  - sample record ids

This is the primary proof that different schema models are active and independently queryable.

## Suggested 7-Minute Script

1. Explain architecture:
   - one gateway
   - one auth flow
   - two data planes
   - one dynamic CRUD UI
2. Authenticate session once.
3. Create a PostgreSQL record (projects).
4. Create a MongoDB record (inventory_item).
5. List each model individually.
6. Run "List All 5 Schemas" and show per-model counts and ids.
7. Close with update/delete on one model to prove full CRUD.

## Expected Responses

- PostgreSQL create: usually 201/200 depending table and PostgREST behavior
- PostgreSQL list: 200 with array body
- Mongo create: 201 with `{ success: true, data: { id, ... } }`
- Mongo list: 200 with `{ success: true, data: [...], meta: ... }`

## Troubleshooting

### Auth session fails

- Verify gateway and GoTrue:

```bash
curl -i http://localhost:8000/auth/v1/health -H "apikey: public-anon-key"
```

### PostgreSQL CRUD fails

- Verify PostgREST route and auth:

```bash
curl -i http://localhost:8000/rest/v1/ -H "apikey: public-anon-key"
```

- Verify bootstrap created tables/policies:

```bash
docker exec mini-baas-postgres psql -U postgres -d postgres -c "\\dt public.mock_orders"
docker exec mini-baas-postgres psql -U postgres -d postgres -c "\\dt public.projects"
```

### Mongo CRUD fails

- Verify Mongo API health:

```bash
curl -i http://localhost:8000/mongo/v1/health -H "apikey: public-anon-key"
```

- Verify mongo-api logs:

```bash
make compose-logs SERVICE=mongo-api
```

### Playground issues

- Rebuild playground assets and restart container:

```bash
make playground-down
make playground-up
```

## Demo Wrap-Up Statement

"This demo shows runtime CRUD generation across five distinct models spanning PostgreSQL and MongoDB, with shared gateway security and shared auth context, while preserving model-specific storage behavior."
