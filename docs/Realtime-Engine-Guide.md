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

#### PING

```json
{ "type": "PING" }
```

### Server → Client Messages

#### AUTH_OK

```json
{
  "type": "AUTH_OK",
  "conn_id": "42",
  "server_time": "2026-04-11T15:30:00.000Z"
}
```

#### SUBSCRIBED

```json
{
  "type": "SUBSCRIBED",
  "sub_id": "my-sub-1",
  "seq": 0
}
```

#### EVENT

```json
{
  "type": "EVENT",
  "sub_id": "pg-changes",
  "event": {
    "event_id": "01965abc-1234-7def-8901-234567890abc",
    "topic": "pg/public/orders",
    "event_type": "INSERT",
    "sequence": 7,
    "timestamp": "2026-04-11T15:30:01.123Z",
    "payload": {
      "id": 42,
      "customer": "alice",
      "total": 99.99
    }
  }
}
```

#### ERROR

```json
{
  "type": "ERROR",
  "code": "AUTH_FAILED",
  "message": "Invalid or expired token"
}
```

Error codes: `AUTH_FAILED`, `CAPACITY_EXCEEDED`, `PAYLOAD_TOO_LARGE`

---

## Authentication

The realtime server supports two auth modes:

### JWT Mode (production — default in mini-BaaS)

When `REALTIME_JWT_SECRET` is set, the server validates HMAC-SHA256 JWTs.

1. Client opens WebSocket to `/ws`
2. Client sends `AUTH` message with a valid JWT token
3. Server verifies the signature, checks `exp` claim
4. Server responds with `AUTH_OK` or `ERROR { code: "AUTH_FAILED" }`

The JWT is the same one issued by GoTrue (`/auth/v1/token`).

**Getting a token for the realtime server**:

```bash
# 1. Sign up / sign in via GoTrue
TOKEN=$(curl -s http://localhost:8000/auth/v1/signup \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{"email":"user@example.com","password":"secret123"}' \
  | jq -r '.access_token')

# 2. Use the token for WebSocket AUTH
```

### No-Auth Mode (development only)

When `REALTIME_JWT_SECRET` is **not** set, the server accepts any token string.
Useful for local development and testing.

---

## Subscribing to Events

### Topic Patterns

Topics are hierarchical paths separated by `/`:

| Pattern          | Type                  | Matches                                |
| ---------------- | --------------------- | -------------------------------------- |
| `orders/created` | Exact                 | Only `orders/created`                  |
| `orders/*`       | Prefix (single level) | `orders/created`, `orders/updated`     |
| `orders/**`      | Prefix (recursive)    | `orders/created`, `orders/us/west/new` |
| `pg/**`          | Prefix (recursive)    | All PostgreSQL CDC events              |
| `mongo/**`       | Prefix (recursive)    | All MongoDB CDC events                 |

### Common Subscription Patterns

```javascript
// PostgreSQL table changes (all tables)
{ sub_id: "pg-all", topic: "pg/**" }

// PostgreSQL specific table
{ sub_id: "pg-orders", topic: "pg/public/orders/*" }

// MongoDB collection changes (all collections)
{ sub_id: "mongo-all", topic: "mongo/**" }

// MongoDB specific collection
{ sub_id: "mongo-users", topic: "mongo/syncspace/users/*" }

// Custom application events
{ sub_id: "chat-general", topic: "chat/general/*" }
{ sub_id: "presence", topic: "presence/*" }
```

---

## Publishing Events

### Via WebSocket (low latency — ephemeral events)

Best for cursor positions, typing indicators, presence updates:

```javascript
ws.send(
  JSON.stringify({
    type: "PUBLISH",
    topic: "cursors/board-1",
    event_type: "cursor.move",
    payload: { x: 150, y: 320, userId: "user-123" },
  }),
);
```

### Via REST API (reliable — from backend services)

Best for business events, notifications, data mutations:

```bash
# Single event
curl -X POST http://localhost:8000/realtime/v1/publish \
  -H "Content-Type: application/json" \
  -H "apikey: <API_KEY>" \
  -H "Authorization: Bearer <JWT>" \
  -d '{
    "topic": "notifications/user-123",
    "event_type": "order.shipped",
    "payload": { "orderId": 42, "trackingUrl": "https://..." }
  }'

# Response:
# { "event_id": "01965abc-...", "sequence": 1, "delivered_to_bus": true }
```

```bash
# Batch (up to 1000 events)
curl -X POST http://localhost:8000/realtime/v1/publish/batch \
  -H "Content-Type: application/json" \
  -H "apikey: <API_KEY>" \
  -H "Authorization: Bearer <JWT>" \
  -d '{
    "events": [
      { "topic": "alerts/sys", "event_type": "cpu.high", "payload": { "pct": 95 } },
      { "topic": "alerts/sys", "event_type": "mem.high", "payload": { "pct": 88 } }
    ]
  }'
```

---

## Server-Side Filters

Filters are evaluated on the server so only matching events are delivered,
saving bandwidth and client CPU.

### Supported Operators

| Operator | Syntax                            | Description            |
| -------- | --------------------------------- | ---------------------- |
| `eq`     | `{ "field": { "eq": value } }`    | Field equals value     |
| `ne`     | `{ "field": { "ne": value } }`    | Field not equal        |
| `in`     | `{ "field": { "in": [v1, v2] } }` | Field is one of values |

Multiple conditions are implicitly **ANDed**.

### Filter Examples

```javascript
// Only INSERT events
ws.send(
  JSON.stringify({
    type: "SUBSCRIBE",
    sub_id: "pg-inserts",
    topic: "pg/**",
    filter: { event_type: { eq: "INSERT" } },
  }),
);

// Only events for a specific user
ws.send(
  JSON.stringify({
    type: "SUBSCRIBE",
    sub_id: "my-orders",
    topic: "pg/public/orders/*",
    filter: { "payload.customer_id": { eq: "user-123" } },
  }),
);

// Events matching multiple event types
ws.send(
  JSON.stringify({
    type: "SUBSCRIBE",
    sub_id: "mutations",
    topic: "pg/**",
    filter: { event_type: { in: ["INSERT", "UPDATE"] } },
  }),
);
```

### Filterable Fields

| Field         | Type   | Description                                    |
| ------------- | ------ | ---------------------------------------------- |
| `event_type`  | string | Event type (e.g. `INSERT`, `UPDATE`, `DELETE`) |
| `topic`       | string | Full topic path                                |
| `source.kind` | string | Source kind (`cdc`, `api`, `websocket`)        |
| `payload.*`   | any    | Any field inside the JSON payload              |

---

## Database CDC (Change Data Capture)

