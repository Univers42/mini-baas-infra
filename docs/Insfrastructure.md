# Infrastructure Overview

This document describes the Compose-first infrastructure model for mini-baas.

## Core Runtime

- Container runtime: Docker
- Service orchestration: Docker Compose
- Network model: single internal bridge network (`mini-baas`)
- Primary ingress: Kong (`localhost:8000`)

## Main Services

- API gateway: Kong
- Authentication: GoTrue
- REST API layer: PostgREST
- Realtime: Supabase Realtime
- SQL federation: Trino
- Relational database: PostgreSQL
- Document database: MongoDB
- Object storage: MinIO
- Cache: Redis
- Pooling: Supavisor
- Admin UI: Studio

## Operational Model

- Local startup: `make compose-up`
- Logs: `make compose-logs` or `make compose-logs SERVICE=<service>`
- Health check: `make compose-health`
- Shutdown: `make compose-down`
- Full reset: `make fclean`

## Image Strategy

- Prefer official, stable upstream images for infrastructure services.
- Keep local image tags explicit (`IMAGE_TAG`) for reproducibility.
- Use `build-and-push` when preparing registry images.

## Next Steps

1. Add a `.env` with real secrets and service URLs.
2. Tighten permissive assertions in realtime/rate-limit/CORS phase tests.
3. Keep endpoint documentation aligned with active Kong declarative routes.
