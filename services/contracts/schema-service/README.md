# schema-service Contract

Defines the schema catalog API contract.

- All schema definitions are stored in MongoDB, independent of target database engine.
- Supported schema `engine` values: `postgresql`, `mysql`, `mongodb`, `sqlite`.
- Service must expose `/health`, `/schemas`, `/schemas/:idOrKey`, and `/docs`.
- Health checks must fail readiness when MongoDB is unavailable.
