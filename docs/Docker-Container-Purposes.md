# Docker Container Purposes

This document describes the role of every Docker container in the local mini-baas stack defined in docker-compose.yml.

## Core Routing and API

- kong: API gateway that routes and secures access to auth, REST, realtime, storage, and other upstream services.
- gotrue: Authentication service responsible for signup, login, token issuance, and token refresh.
- postgrest: Auto-generated REST API over PostgreSQL schemas.
- realtime: Realtime event and WebSocket service for live updates.
- mongo-api: JWT-protected HTTP API layer for MongoDB-backed MVP endpoints.

## Data and Storage

- postgres: Primary relational database for platform data and auth-related persistence.
- mongo: Document database used by Mongo-focused MVP flows.
- minio: S3-compatible object storage backend for file and bucket operations.
- redis: In-memory key-value store used for cache and low-latency state.

## Management and Developer Experience

- pg-meta: PostgreSQL metadata/admin API consumed by Studio.
- studio: Web UI for project and database operations.
- supavisor: Database connection pooling and session orchestration service.
- trino: Distributed SQL query engine for federated and analytical queries.

## Bootstrap and Utility Containers

- db-bootstrap: One-shot initialization container that waits for PostgreSQL and applies bootstrap SQL (schema, roles, and seed setup).
- playground: Nginx container serving the local frontend playground and visual test surface.
