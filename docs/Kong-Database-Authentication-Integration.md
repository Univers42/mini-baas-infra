# Kong Gateway with Database Authentication Integration

## Overview

This document describes the integration of Kong API Gateway with authenticated database users via GoTrue and PostgREST.

## Architecture

```
Client
  ↓
Kong Gateway (port 8000)
  ├─ /auth/v1 → GoTrue (9999)  [API Key Auth]
  ├─ /rest/v1 → PostgREST (3000) [API Key Auth + JWT]
  └─ /realtime/v1 → Realtime (4000) [API Key Auth]
  
Components:
  - PostgreSQL: Main database with user auth schema
  - GoTrue: OAuth/JWT token issuer
  - PostgREST: REST API to database with JWT validation
  - Kong: API gateway with key-auth and JWT validation
```

## Authentication Flow

### 1. User Registration/Login
```
POST /auth/v1/signup or /auth/v1/token
├─ Client provides: email, password
├─ Kong checks: apikey header (must be valid)
├─ GoTrue validates credentials against postgres auth schema
└─ Returns: JWT access token
```

### 2. REST API Access with JWT
```
GET /rest/v1/users
├─ Client provides: Authorization: Bearer <JWT> + apikey header
├─ Kong validates: apikey is present and valid
├─ Kong validates: JWT signature (if present)
├─ Kong transforms: Removes apikey, adds Authorization header to upstream
├─ PostgREST validates: JWT signature against shared JWT_SECRET
├─ PostgREST maps: JWT 'sub' claim to authenticated database role
└─ Database: Enforces RLS policies based on authenticated user
```

## Configuration Details

### Kong Configuration (deployments/base/kong/kong.yml)

**Key-Auth Plugin**: On all routes
```yaml
plugins:
  - name: key-auth
    config:
      key_names: [apikey]
      hide_credentials: false
```

**JWT Plugin**: On /rest/v1 route (optional, can be enforced per-route)
```yaml
plugins:
  - name: jwt
    config:
      key_claim_name: sub
      secret_is_base64: false
      algorithms: [HS256]
```

**Request Transformer**: Converts apikey auth to JWT header
```yaml
plugins:
  - name: request-transformer
    config:
      remove:
        headers: [apikey]
      add:
        headers: ["Authorization: Bearer $(jwt)"]
```

### Environment Variables

**Docker Compose (.env)**:
```bash
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres

# OAuth/JWT secret (must be 32+ chars)
JWT_SECRET=replace-with-32-plus-char-secret

# PostgREST
PGRST_DB_URI=postgres://postgres:postgres@postgres:5432/postgres
PGRST_DB_SCHEMA=public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=${JWT_SECRET}

# Kong API Keys
KONG_PUBLIC_API_KEY=public-anon-key
KONG_SERVICE_API_KEY=service-role-key

# GoTrue
API_EXTERNAL_URL=http://localhost:8000/auth/v1
GOTRUE_SITE_URL=http://localhost:3001
GOTRUE_JWT_SECRET=${JWT_SECRET}
GOTRUE_MAILER_AUTOCONFIRM=true
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
```

### Database Schema (scripts/db-bootstrap.sql)

**Roles Created**:
- `anon`: Public/unauthenticated users
- `authenticated`: Logged-in users
- `supabase_admin`: Database admin role

**Tables for Testing**:
- `users`: User profiles
- `user_profiles`: Extended user information
- `posts`: User-generated posts with visibility control

**Row-Level Security (RLS)**:
- Enabled on all test tables
- Policies restrict access based on authenticated user (JWT 'sub' claim)

**JWT Extraction**:
```sql
CREATE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
$$ LANGUAGE SQL STABLE;
```

## Test Suites

### Phase 1: Routing & Auth Flow
- Tests Kong routing to GoTrue
- Tests signup and login endpoints
- Tests JWT token generation

**Run**: `make test-phase1`

### Phase 2: Gateway Security
- Tests API key enforcement
- Tests CORS headers
- Tests rate limiting

**Run**: `make test-phase2`

### Phase 3: Authenticated Database Access
- Tests full signup → login → REST API flow
- Tests JWT validation at REST endpoint
- Tests InvalidToken rejection

**Run**: `make test-phase3`

### Phase 4: User Data Isolation
- Tests multi-user authentication
- Tests RLS policies
- Tests data isolation between users

**Run**: `make test-phase4`

## Running All Tests

```bash
make tests
# Or individual phases:
make test-phase1 test-phase2 test-phase3 test-phase4
```

## Common Issues & Solutions

### Issue: 401 Unauthorized on /rest/v1
**Cause**: Missing or invalid API key
**Solution**: Ensure `apikey: public-anon-key` header is present in requests

### Issue: 403 Forbidden after login
**Cause**: JWT validation failed or JWT_SECRET mismatch
**Solution**: 
1. Verify JWT_SECRET in docker-compose.yml
2. Ensure same secret is used by GoTrue and PostgREST
3. Check Kong JWT plugin configuration

### Issue: JWT token rejected in gateway
**Cause**: Token validation failure or expired token
**Solution**:
1. Check token expiration: `JWT_EXP` in GoTrue config
2. Verify JWT signature algorithm (should be HS256)
3. Look at Kong logs: `make compose-logs SERVICE=kong`

### Issue: PostgREST cannot access database roles
**Cause**: Database bootstrap script did not run successfully
**Solution**:
1. Check if db-bootstrap container completed successfully
2. Verify roles exist: `psql -U postgres -c "\du"`
3. Check search_path: `SHOW search_path;`

## Security Considerations

1. **JWT Secret**: Must be 32+ characters, Keep in .env (never commit)
2. **API Keys**: Public and service keys are visible in Kong config (acceptable for local dev)
3. **HTTPS**: In production, all routes must be HTTPS
4. **JWT Expiration**: Default 3600s (1 hour); adjust based on security policy
5. **RLS Policies**: Ensure all sensitive tables have RLS enabled
6. **Rate Limiting**: Configure per-route based on expected traffic patterns

## Extending for Production

1. Move JWT_SECRET to secure vault (e.g., HashiCorp Vault, AWS Secrets Manager)
2. Add HTTPS/TLS termination (Kong has built-in ACL plugin)
3. Implement token refresh flow for long-lived sessions
4. Add audit logging for sensitive operations
5. Consider Keycloak or Okta for enterprise OAuth
6. Add rate limiting per authenticated user (not just IP)
7. Implement token revocation/blacklist for logout
