# Realtime Engine — Integration Guide

> **mini-BaaS Realtime** is a high-performance WebSocket event engine written in
> Rust. It provides real-time pub/sub, database change-data-capture (CDC) for
> both PostgreSQL and MongoDB, server-side filtering, and a REST API for
> publishing events.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [How It Runs in mini-BaaS](#how-it-runs-in-mini-baas)
3. [Endpoints](#endpoints)
4. [WebSocket Protocol](#websocket-protocol)
5. [Authentication](#authentication)
6. [Subscribing to Events](#subscribing-to-events)
7. [Publishing Events](#publishing-events)
8. [Server-Side Filters](#server-side-filters)
9. [Database CDC (Change Data Capture)](#database-cdc-change-data-capture)
10. [Frontend Integration (JavaScript)](#frontend-integration-javascript)
11. [Backend Integration (Node.js / NestJS)](#backend-integration-nodejs--nestjs)
12. [REST API Reference](#rest-api-reference)
13. [Configuration Reference](#configuration-reference)
14. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────┐  WS   ┌─────────────────────────────────────────────────┐
│  Browser /  │───────►│            Realtime Engine (Rust)               │
│  Mobile App │◄───────│                                                 │
└─────────────┘        │  ┌──────────┐  ┌─────────┐  ┌──────────────┐  │
                       │  │ Gateway  │  │ Engine  │  │  Event Bus   │  │
┌─────────────┐  REST  │  │ (axum)   │  │ (router │  │ (broadcast)  │  │
│  Backend    │───────►│  │          │  │  +index)│  │              │  │
│  Service    │◄───────│  └──────────┘  └─────────┘  └──────┬───────┘  │
└─────────────┘        │                                     │          │
                       │  ┌──────────────────────────────────┘          │
                       │  │                                             │
                       │  ▼               ▼                             │
                       │  ┌──────────┐  ┌──────────┐                   │
                       │  │ PG CDC   │  │Mongo CDC │                   │
                       │  │(LISTEN/  │  │(Change   │                   │
                       │  │ NOTIFY)  │  │ Streams) │                   │
                       │  └────┬─────┘  └────┬─────┘                   │
                       └───────┼──────────────┼────────────────────────┘
                               ▼              ▼
                          PostgreSQL       MongoDB
```

**Crates** (all compiled into one binary):

| Crate                    | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `realtime-core`          | Shared types, traits, protocol definitions        |
| `realtime-engine`        | Subscription registry, event router, filter index |
| `realtime-gateway`       | WebSocket handler, REST API, connection manager   |
| `realtime-bus-inprocess` | In-process event bus (broadcast channels)         |
| `realtime-auth`          | JWT and no-auth providers                         |
| `realtime-db-postgres`   | PostgreSQL CDC via LISTEN/NOTIFY                  |
| `realtime-db-mongodb`    | MongoDB CDC via Change Streams                    |
| `realtime-server`        | Binary entrypoint, wires everything together      |
| `realtime-client`        | Rust client SDK (for backend services)            |

---

## How It Runs in mini-BaaS

The realtime engine runs as the `realtime` service in `docker-compose.yml`:

```yaml
realtime:
  image: dlesieur/realtime-agnostic:latest
  environment:
    REALTIME_HOST: 0.0.0.0
    REALTIME_PORT: 4000
    REALTIME_JWT_SECRET: ${JWT_SECRET}
    REALTIME_PG_URL: postgres://postgres:postgres@postgres:5432/postgres
    REALTIME_PG_CHANNEL: realtime_events
    REALTIME_MONGO_URI: mongodb://mongo:mongo@mongo:27017
    REALTIME_MONGO_DB: syncspace
    RUST_LOG: info
```

**Internal port**: `4000` (no host port mapping — accessed through Kong)

**Kong routes**:

- `http://localhost:8000/realtime/v1/*` → REST API (health, publish)
- `ws://localhost:8000/realtime/ws` → WebSocket endpoint

---

## Endpoints

| Method | Path                | Description                                     |
| ------ | ------------------- | ----------------------------------------------- |
| `GET`  | `/v1/health`        | Health check with connection/subscription stats |
| `POST` | `/v1/publish`       | Publish a single event                          |
| `POST` | `/v1/publish/batch` | Publish up to 1000 events in one request        |
| `GET`  | `/ws`               | WebSocket upgrade endpoint                      |

Through **Kong** (add your API key / JWT):

- `GET http://localhost:8000/realtime/v1/health`
- `POST http://localhost:8000/realtime/v1/publish`
- `WS ws://localhost:8000/realtime/ws`

---

## WebSocket Protocol

All messages are JSON with a `"type"` discriminator field.

### Message Flow

```
Client                              Server
  │── AUTH { token }  ────────────► │
  │◄── AUTH_OK { conn_id }  ─────── │
  │── SUBSCRIBE { sub_id, topic } ► │
  │◄── SUBSCRIBED { sub_id, seq } ─ │
  │                                  │  (events flow as they occur)
  │◄── EVENT { sub_id, event }  ──── │
  │◄── EVENT { sub_id, event }  ──── │
  │── PUBLISH { topic, payload } ─► │  (broadcast to all subscribers)
  │── UNSUBSCRIBE { sub_id }  ────► │
  │◄── UNSUBSCRIBED { sub_id }  ─── │
  │── PING  ──────────────────────► │
  │◄── PONG  ──────────────────────  │
```

### Client → Server Messages

#### AUTH (must be first message)

```json
{
  "type": "AUTH",
  "token": "<jwt-token>"
}
```

#### SUBSCRIBE

```json
{
  "type": "SUBSCRIBE",
  "sub_id": "my-sub-1",
  "topic": "orders/*",
  "filter": { "event_type": { "eq": "created" } },
  "options": {
    "overflow": "drop_oldest",
    "resume_from": 42,
    "rate_limit": 100
  }
}
```

- `sub_id` — Client-chosen ID, scoped to this connection
- `topic` — Topic pattern (see [Topic Patterns](#topic-patterns))
- `filter` — Optional server-side filter (see [Filters](#server-side-filters))
- `options` — Optional: `overflow` (`drop_oldest` | `drop_newest` | `disconnect`), `resume_from` (sequence), `rate_limit` (events/sec)

#### SUBSCRIBE_BATCH

```json
{
  "type": "SUBSCRIBE_BATCH",
  "subscriptions": [
    { "sub_id": "pg-changes", "topic": "pg/**" },
    { "sub_id": "mongo-changes", "topic": "mongo/**" },
    { "sub_id": "chat", "topic": "channel:general:chat/*" }
  ]
}
```

#### PUBLISH (over WebSocket)

```json
{
  "type": "PUBLISH",
  "topic": "chat/general",
  "event_type": "message.sent",
  "payload": {
    "userId": "user-123",
    "text": "Hello world!"
  }
}
```

#### UNSUBSCRIBE

```json
{
  "type": "UNSUBSCRIBE",
  "sub_id": "my-sub-1"
}
```
