# Kong Gateway Configuration Guide

This guide explains how to add and manage API endpoints in Kong using the prebuilt-image approach with declarative configuration.

## Overview

Kong runs as a prebuilt Docker image and is configured entirely through:
- **Declarative config file**: `deployments/base/kong/kong.yml`
- **Environment variables**: Set in `docker-compose.yml`
- **Mounted volumes**: Config mounted read-only at `/etc/kong/kong.yml`

No source code modification is required. Changes are purely declarative and applied at startup.

## Current Setup

### Kong image location
- **File**: `docker-compose.yml` service `kong`
- **Config file**: `deployments/base/kong/kong.yml`
- **Mode**: Database-off (declarative only)

### Current endpoints (and their upstreams)

| Public Path | Service | Internal Target |
|-------------|---------|-----------------|
| `/auth/v1` | GoTrue | `http://gotrue:9999` |
| `/rest/v1` | PostgREST | `http://postgrest:3000` |
| `/realtime/v1` | Realtime | `http://realtime:4000` |
| `/storage/v1` | MinIO | `http://minio:9000` |
| `/meta/v1` | PG Meta | `http://pg-meta:8080` |
| `/studio` | Studio | `http://studio:3000` |

## Structure of Kong declarative config (YAML)

The Kong config follows this structure:

```yaml
_format_version: "3.0"
_transform: true

# Global plugins (apply to all routes)
plugins:
  - name: cors
    config: { ... }

services:
  - name: my-service
    url: http://upstream-host:port
    # Service-level plugins (optional)
    plugins:
      - name: plugin-name
        config: { ... }
    routes:
      - name: route-name
        paths:
          - /public-path-1
          - /public-path-2
        strip_path: true
        methods:
          - GET
          - POST
```

## How to Add a New Endpoint

### Option 1: Add a route to an existing service

If your new endpoint goes to a service that already has Kong routes, add a new entry to its `paths`:

**Example**: Add `/auth/admin` to the GoTrue service

```yaml
services:
  - name: gotrue
    url: http://gotrue:9999
    routes:
      - name: gotrue-route
        paths:
          - /auth/v1
          - /auth
          - /auth/admin          # <- New path
        strip_path: true
        methods:
          - GET
          - POST
          - PUT
          - PATCH
          - DELETE
          - OPTIONS
```

### Option 2: Add a new service with routes

If your endpoint goes to a service Kong doesn't yet proxy, add a new service block:

**Example**: Add a new microservice answering at `/api/custom`

```yaml
services:
  # ... existing services ...

  - name: custom-service
    url: http://custom-service:3000
    routes:
      - name: custom-route
        paths:
          - /api/custom
          - /api/custom/v1
        strip_path: true
        methods:
          - GET
          - POST
          - PUT
          - PATCH
          - DELETE
          - OPTIONS
```

### Option 3: Add service-level plugins (e.g., auth, rate limiting)

If you need to protect or transform requests to a specific service, add plugins under the service:

**Example**: Add API key auth to a service

```yaml
services:
  - name: protected-service
    url: http://internal-service:8080
    plugins:
      - name: key-auth
        config:
          key_names:
            - apikey
          hide_credentials: true
    routes:
      - name: protected-route
        paths:
          - /protected
```

## Common parameters

### `strip_path`
- `true`: Kong removes the matched path prefix before forwarding to upstream
  - Request: `GET /auth/v1/health` → Upstream receives: `GET /health`
- `false`: Path is forwarded as-is (less common)

### `methods`
List of HTTP methods the route should accept. Omit to accept all methods.

### `protocols`
Allowed protocols for the route:
- `http`, `https` (standard)
- WebSocket proxying should use `http`/`https` routes plus Upgrade headers

### `hosts`
Optional: match on Host header
```yaml
routes:
  - name: example
    paths:
      - /api
    hosts:
      - api.example.com
```

## Plugin configuration

### Global CORS plugin (already configured)

All routes inherit CORS settings. Current config allows:
- All origins (`*`)
- All standard methods
- Headers: `Authorization`, `Content-Type`, `apikey`, `x-client-info`
- Credentials enabled

To restrict, modify the global plugin in `kong.yml`:

```yaml
plugins:
  - name: cors
    config:
      origins:
        - https://myapp.com
        - https://myapp.staging.com
      credentials: true
```

### Adding security plugins

**API Key authentication** (protect a service with API keys):

```yaml
services:
  - name: secure-api
    url: http://api:8000
    plugins:
      - name: key-auth
        config:
          key_names:
            - apikey
          hide_credentials: true
    routes:
      - name: secure-route
        paths:
          - /secure
```

**Rate limiting** (limit requests per consumer):

```yaml
services:
  - name: rate-limited-api
    url: http://api:8000
    plugins:
      - name: rate-limiting
        config:
          minute: 100
          policy: local
    routes:
      - name: limited-route
        paths:
          - /api
```

## Request transformation plugins

### Remove headers

Use `request-transformer` to strip problematic headers for an upstream service:

```yaml
services:
  - name: internal-service
    url: http://internal-service:8080
    plugins:
      - name: request-transformer
        config:
          remove:
            headers:
              - x-forwarded-for
    routes:
      - name: internal-route
        paths:
          - /internal
        strip_path: true
```

### Add headers

```yaml
plugins:
  - name: request-transformer
    config:
      add:
        headers:
          - x-custom-header:custom-value
```

## Validating configuration

Before deploying, validate the Kong config syntax:

```bash
cd /home/daniel/projects/mini-baas-infra

# Validate the declarative config
docker run --rm -e KONG_DATABASE=off \
  -e KONG_DECLARATIVE_CONFIG=/tmp/kong.yml \
  -v "$PWD/deployments/base/kong/kong.yml:/tmp/kong.yml:ro" \
  kong:3.8 kong config parse /tmp/kong.yml
```

Expected output on success:
```
parse successful
```

## Applying changes

1. **Edit** `deployments/base/kong/kong.yml` with your new endpoint
2. **Validate** using the command above
3. **Restart Kong** to load the new config:
   ```bash
   docker compose restart kong
   ```
4. **Test** your new route:
   ```bash
   curl -v http://localhost:8000/your/new/path
   ```

## Checking Kong admin API

Kong 3.8 runs with an admin API at `http://localhost:8001` for debugging (read-only in declarative mode):

```bash
# List all services
curl http://localhost:8001/services

# List all routes
curl http://localhost:8001/routes

# List active plugins
curl http://localhost:8001/plugins
```

## Testing a new endpoint

After adding and restarting Kong:

```bash
# Simple health check
curl -i http://localhost:8000/your/new/path

# Verbose (show headers)
curl -i -v http://localhost:8000/your/new/path

# With auth headers (if protected)
curl -H "apikey: your-key" http://localhost:8000/your/new/path
```

## Best practices for this setup

1. **Always validate before deploying**. A syntax error in `kong.yml` breaks the entire gateway.

2. **Use versioned paths** (e.g., `/api/v1/endpoint`). Makes a future API version migration cleaner.

3. **Document upstream expectations**:
   - Required headers
   - Authentication schemes
   - Expected response formats

4. **Test strip_path behavior**.
   - If `strip_path: true`, the upstream must handle the path without the prefix.
   - If uncertain, check logs: `docker compose logs kong`

5. **Use plugins consistently**. If auth is needed, apply it at the service level so all routes inherit it.

6. **Mount config read-only**. The volume in `docker-compose.yml` is `:ro` to prevent accidental modification inside the container.

## Upstream service considerations

### GoTrue (Auth)
- **Port**: 9999
- **Expects**: `/` prefix (strip_path works well)
- **Note**: Responds to `/health` for health checks

### PostgREST (SQL REST API)
- **Port**: 3000
- **Expects**: Postgres authentication headers or JWT
- **Note**: In the current stack, PostgREST validates JWTs directly via `PGRST_JWT_SECRET`

### Realtime (WebSocket)
- **Port**: 4000
- **Expects**: HTTP Upgrade headers for WebSocket
- **Note**: Test with WebSocket client library

### Trino (SQL federation)
- **Port**: 8080
- **Note**: Not exposed via Kong gateway in the near-term product contract

### PG Meta (Schema introspection)
- **Port**: 8080
- **Expects**: No special headers
- **Note**: Used by Studio for schema browsing

### Studio (Admin UI)
- **Port**: 3000
- **Expects**: Environment URLs pointing to Kong gateway
- **Note**: Needs `SUPABASE_URL` and `SUPABASE_PUBLIC_URL` set to Kong entrypoint

## Troubleshooting

### Route not responding
1. Verify config syntax: `docker run ... kong config parse`
2. Check Kong is restarted: `docker compose logs kong | tail -30`
3. Verify upstream is healthy: `docker compose logs <service-name>`
4. Check if path matches exactly (case-sensitive)

### 502 Bad Gateway
- Upstream service is down or misconfigured
- Check: `docker compose ps` to see if upstream is running
- Check upstream logs: `docker compose logs <service-name>`

### 404 Not Found
- Path doesn't match any Kong route
- Check path in `kong.yml` (case-sensitive)
- Verify `strip_path` behavior

## Example: Adding a new BaaS module endpoint

Here's a complete example of adding a custom internal route:

```yaml
# In deployments/base/kong/kong.yml, add:

services:
  - name: internal-service
    url: http://internal-service:8080
    plugins:
      - name: request-transformer
        config:
          add:
            headers:
              - x-internal-origin: gateway
    routes:
      - name: internal-route
        paths:
          - /internal/v1
        strip_path: true
        methods:
          - GET
          - POST
          - OPTIONS
```

Then:
1. Ensure your target service is available in `docker-compose.yml`
2. Validate: `docker run ... kong config parse`
3. Restart: `docker compose restart kong`
4. Test: `curl http://localhost:8000/internal/v1/health`

## Further reading

- [Kong official documentation](https://docs.konghq.com/gateway/latest/)
- [Kong declarative config format](https://docs.konghq.com/gateway/latest/reference/configuration/#declarative_config)
- [Kong plugins reference](https://docs.konghq.com/hub/)
