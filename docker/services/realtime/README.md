# Supabase Realtime

Supabase Realtime — Elixir-based WebSocket server that streams PostgreSQL changes (inserts, updates, deletes) to connected clients in real time via Phoenix Channels.

## Quick Start

```bash
docker compose up realtime
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `postgres` | PostgreSQL hostname |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `postgres` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | — | Database password |
| `DB_SSL` | `false` | Enable SSL for DB connection |
| `JWT_SECRET` | — | Shared JWT secret for token verification |
| `PORT` | `4000` | HTTP/WebSocket server port |
| `REPLICATION_MODE` | `RLS` | Replication mode (`RLS` for row-level security) |
| `SECURE_CHANNELS` | `true` | Require JWT for channel subscriptions |
| `SECRET_KEY_BASE` | — | Phoenix secret key base |

## Endpoints

| Protocol | Path | Description |
|----------|------|-------------|
| WebSocket | `/socket/websocket` | Phoenix Channel WebSocket endpoint |
| HTTP | `/` | Health / info endpoint |

## CLI Examples

### Using wscat

```bash
# Install wscat
npm install -g wscat

# Connect to the Realtime WebSocket
wscat -c "ws://localhost:4000/socket/websocket?apikey=<your-anon-key>&vsn=1.0.0"

# Once connected, join a channel (send as JSON):
# {"topic":"realtime:public:todos","event":"phx_join","payload":{"user_token":"<jwt>"},"ref":"1"}

# Listen for changes — inserts/updates/deletes on the "todos" table
# will appear as messages on the channel.
```

### Using JavaScript (supabase-js)

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient('http://localhost:8000', '<anon-key>')

const channel = supabase.channel('public:todos')
channel
  .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, (payload) => {
    console.log('Change received:', payload)
  })
  .subscribe()
```

### Testing with curl

```bash
# Check if realtime is responding
curl -s http://localhost:4000/ | jq .
```

## Health Check

```bash
curl -sf http://localhost:4000/
```

Returns a `200` status when the Realtime server is ready to accept WebSocket connections.

## Docker

- **Image:** `supabase/realtime`
- **Port:** `4000`
- **Depends on:** `postgres`
- **Networks:** Internal `baas` network
