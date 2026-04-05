# Realtime Engine (Agnostic)

Realtime Engine — Rust-based, database-agnostic WebSocket server that streams changes (inserts, updates, deletes) from both PostgreSQL and MongoDB to connected clients in real time. Replaces the Supabase Realtime (Elixir) service with a lightweight, high-performance engine.

## Quick Start

```bash
docker compose up realtime
```

## Environment Variables

| Variable              | Default   | Description                                  |
| --------------------- | --------- | -------------------------------------------- |
| `REALTIME_HOST`       | `0.0.0.0` | Bind address                                 |
| `REALTIME_PORT`       | `4000`    | HTTP/WebSocket server port                   |
| `REALTIME_JWT_SECRET` | —         | Shared JWT secret for token verification     |
| `REALTIME_PG_URL`     | —         | PostgreSQL connection string for CDC         |
| `REALTIME_MONGO_URL`  | —         | MongoDB connection string for change streams |
| `RUST_LOG`            | `info`    | Log level (`debug`, `info`, `warn`, `error`) |

## Endpoints

| Protocol  | Path         | Description                          |
| --------- | ------------ | ------------------------------------ |
| HTTP      | `/v1/health` | Health & metrics endpoint (JSON)     |
| WebSocket | `/v1/ws`     | WebSocket endpoint for subscriptions |

## CLI Examples

### Health Check

```bash
curl -sf http://localhost:4000/v1/health | jq .
```

### Using wscat

```bash
# Install wscat
npm install -g wscat

# Connect to the Realtime WebSocket
wscat -c "ws://localhost:4000/v1/ws"

# Subscribe to a channel (send as JSON):
# {"action":"subscribe","channel":"public.todos","adapter":"postgresql"}
```

### Using JavaScript (EventSource / SSE)

```javascript
const ENDPOINT = "http://localhost:8000";
const API_KEY = "public-anon-key";

const params = new URLSearchParams({ event: "*", apikey: API_KEY });
const es = new EventSource(`${ENDPOINT}/realtime/v1/todos?${params}`);
es.onmessage = (e) => console.log("Change:", JSON.parse(e.data));
```

## Health Check

```bash
curl -sf http://localhost:4000/v1/health
```

Returns a `200` status with JSON metrics when the Realtime server is ready to accept WebSocket connections.

## Docker

- **Image:** `dlesieur/realtime-agnostic`
- **Port:** `4000`
- **Depends on:** `postgres`, `mongo`
- **Networks:** Internal `baas` network
