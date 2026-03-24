# schema-service

Schema catalog service for storing database schemas in MongoDB.

The catalog is engine-agnostic: schema definitions for PostgreSQL, MySQL, MongoDB, and SQLite are all persisted in one MongoDB collection.

## Environment Variables

- `PORT`: HTTP port (default `3001`)
- `MONGODB_URI`: MongoDB connection URI (default `mongodb://mongo:27017`)
- `MONGODB_DATABASE`: MongoDB database name (default `mini_baas`)
- `MONGODB_COLLECTION`: schema collection name (default `schema_catalog`)

## Endpoints

- `GET /health`: service and MongoDB readiness
- `GET /schemas`: list catalog schemas (`?engine=postgresql|mysql|mongodb|sqlite` optional)
- `GET /schemas/:idOrKey`: fetch one schema by Mongo id or business key
- `POST /schemas`: create/update schema by key
- `GET /docs`: Swagger UI
- `GET /openapi.json`: OpenAPI document

## Seeded Schemas

On startup the service inserts starter schemas if missing:

- `public-commerce-postgres-v1`
- `analytics-mongodb-v1`
- `inventory-mysql-v1`
