# Kong Gateway Blocker — Critical Analysis & Recommendations

*Independent technical review for the mini-baas-infra team.*

*March 2026 · Prepared by dlesieur with AI assistance*

---

## Table of Contents

- [1. Understanding the Blocker](#1-understanding-the-blocker)
- [2. The Real Problem (It's Not Kong)](#2-the-real-problem-its-not-kong)
- [3. Evaluating the Three Proposed Options](#3-evaluating-the-three-proposed-options)
- [4. The Option Nobody Mentioned — Use Supabase's Own Kong Config](#4-the-option-nobody-mentioned--use-supabases-own-kong-config)
- [5. Recommended Strategy — Progressive Approach](#5-recommended-strategy--progressive-approach)
- [6. How QA Can Help Right Now](#6-how-qa-can-help-right-now)
- [7. Tradeoff Summary](#7-tradeoff-summary)
- [8. Concrete Action Plan](#8-concrete-action-plan)

---

## 1. Understanding the Blocker

The blocker is described as "Kong API gateway configuration is not yet functional for our BaaS flow." Let me restate it more precisely after reading the full technical context:

**What works today:**
- All 10+ services start correctly via Docker Compose
- Kong routes `/auth` to GoTrue and `/rest` to PostgREST individually
- Basic CORS plugin is configured globally
- PostgreSQL bootstraps with correct schemas and roles

**What does not work:**
- Cross-service flows (e.g., authenticate via GoTrue, then use JWT to access PostgREST)
- Kong does not validate JWTs or inject the correct headers that PostgREST expects
- Request/response transformation between services is incomplete
- Some Supabase-specific behaviors require custom Kong plugins that are not in vanilla Kong

**The perceived constraint:**
Prebuilt images cannot have their source code modified, so Kong customization is limited to declarative YAML, environment variables, and volume mounts.

---

## 2. The Real Problem (It's Not Kong)

After reviewing the technical summary and the blocker document, my honest assessment is that the problem is not "Kong is hard to configure." The problem is a mismatch between the project's ambition and its approach.

### The ambition

Build a Supabase-compatible BaaS stack from individual Docker images, where Kong acts as the intelligent gateway that ties everything together.

### The approach

Use vanilla Kong 3.8 with declarative YAML to replicate what Supabase does with custom plugins and a purpose-built Kong configuration.

### Why this creates a blocker

Supabase's production setup uses Kong with custom Lua plugins that do things vanilla Kong cannot do declaratively. Specifically:

```
┌──────────────────────────────────────────────────────────────┐
│  What Supabase's Kong does (custom plugins)                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Reads the JWT from the Authorization header              │
│  2. Validates it against the SUPABASE_JWT_SECRET             │
│  3. Extracts the 'role' claim (anon / authenticated)         │
│  4. Sets a PostgreSQL-compatible header:                     │
│     request.headers["X-Hasura-Role"] = role                  │
│     or injects it as a custom claim for PostgREST             │
│  5. Forwards to the correct upstream                         │
│                                                              │
│  This is NOT standard Kong behavior.                         │
│  Vanilla Kong's jwt plugin validates JWTs but does NOT       │
│  extract claims and inject them as upstream headers.          │
│  That requires a custom plugin or request-transformer.       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

This is why "routes work individually but cross-service flows don't." Each service works when called directly, but the glue between them — the header transformation, JWT claim extraction, and role injection — is missing because it lives in Supabase's custom Kong plugins.

---

## 3. Evaluating the Three Proposed Options

The blocker document proposes three options. Here is my honest evaluation of each.

### Option A — Strict prebuilt images, better YAML config

```
Proposal: Stay with kong:3.8, write more sophisticated declarative YAML.
```

**Verdict: Partially viable, but has a hard ceiling.**

Kong's declarative YAML supports the `jwt` plugin (validates tokens) and the `request-transformer` plugin (adds/removes/renames headers). In theory, you can chain them:

```yaml
# This is possible in vanilla Kong declarative config:
plugins:
  - name: jwt
    config:
      key_claim_name: iss
      secret_is_base64: false

  - name: request-transformer
    config:
      add:
        headers:
          - "X-Hasura-Role:authenticated"
```

**The problem:** the `request-transformer` plugin can only add static values. It cannot read a JWT claim and inject its value dynamically. So you can add `X-Hasura-Role: authenticated` to every request, but you cannot add `X-Hasura-Role: <value from JWT role claim>`. This is exactly what Supabase needs for PostgREST's row-level security.

**Where this option works:** simple routing, CORS, rate limiting, basic auth validation.
**Where it fails:** any flow that requires dynamic header injection based on JWT claims.

### Option B — Custom image layers (build your own Kong image)

```
Proposal: Create a Dockerfile that extends kong:3.8 with custom Lua plugins.
```

**Verdict: This is the correct technical solution, but the document frames it as risky.**

A custom Kong image is simply:

```dockerfile
FROM kong:3.8
COPY plugins/supabase-auth /usr/local/share/lua/5.1/kong/plugins/supabase-auth
ENV KONG_PLUGINS=bundled,supabase-auth
```

This is NOT "changing internal source code." It is adding a plugin — the standard, documented, supported way to extend Kong. The "prebuilt-only" policy is creating an artificial constraint. Every production Kong deployment uses custom plugins. That is how Kong is designed to be used.

**The tradeoff the document mentions — "greater complexity, maintenance overhead" — is overstated.** A single Lua plugin that reads a JWT claim and sets a header is approximately 50 lines of code. The maintenance burden is near zero because it only depends on Kong's plugin API, which is stable across versions.

### Option C — Sidecar/companion proxy

```
Proposal: Keep vanilla Kong for routing, add a separate proxy that does the transformations.
```

**Verdict: The worst option. Adds latency, complexity, and a new failure point for no benefit.**

```
Client → Kong → Sidecar proxy → Upstream service
         ↑ routing    ↑ transformation
```

This turns one hop into two, doubles the configuration surface, and creates a service that does what Kong is designed to do. If you need custom behavior in the gateway, put it in the gateway — don't build a second gateway next to it.

---

## 4. The Option Nobody Mentioned — Use Supabase's Own Kong Config

This is the most important section of this document.

Supabase is open source. Their self-hosted Docker setup is public and documented. It includes a complete Kong configuration that works with GoTrue, PostgREST, Realtime, and Storage out of the box.

**Repository:** [github.com/supabase/supabase/tree/master/docker](https://github.com/supabase/supabase/tree/master/docker)

Their `docker-compose.yml` and `volumes/api/kong.yml` contain exactly the Kong configuration that makes all cross-service flows work. Instead of reverse-engineering what Kong needs to do, you can start from their working config and adapt it.

### What Supabase's self-hosted setup uses

```
┌─────────────────────────────────────────────────────────────┐
│  Supabase self-hosted Docker stack                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Image: kong:2.8.1 (older, but same plugin API)             │
│                                                             │
│  Key detail: They do NOT use custom Lua plugins.            │
│  Instead, they use Kong's built-in plugins creatively:      │
│                                                             │
│  1. request-transformer — injects apikey as header          │
│  2. cors — global CORS policy                               │
│  3. key-auth — validates the apikey header                  │
│                                                             │
│  The JWT validation is NOT done by Kong.                    │
│  It is done by PostgREST and GoTrue themselves.             │
│  Kong only routes and passes headers through.               │
│                                                             │
│  This is the key insight your partner is missing.           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### The insight that unblocks everything

**Kong does not need to validate JWTs. PostgREST does it natively.**

PostgREST has a built-in JWT validator. When configured with `PGRST_JWT_SECRET`, it reads the `Authorization: Bearer <token>` header, validates the JWT, extracts the `role` claim, and sets the PostgreSQL role accordingly. Kong just needs to pass the header through — no transformation needed.

```
What your partner thinks the flow should be:

  Client → Kong (validate JWT, extract role, inject header) → PostgREST

What the flow actually should be:

  Client → Kong (route only, pass headers) → PostgREST (validates JWT internally)
```

This is why individual routes work but cross-service flows seem broken. The assumption is that Kong must do the JWT intelligence. It does not. The upstream services handle their own auth. Kong is just a router.

### The same applies to GoTrue

GoTrue validates its own tokens. It does not need Kong to do anything with the JWT. Kong just routes `/auth/*` to GoTrue and passes all headers through. GoTrue handles everything else.

### The same applies to Realtime

Supabase Realtime accepts the JWT in the WebSocket connection URL as a query parameter. Kong just needs to proxy the WebSocket upgrade — no header manipulation needed.

---

## 5. Recommended Strategy — Progressive Approach

Based on this analysis, here is what I recommend:

### Phase 1 — Make it work (routing only)

Strip Kong's configuration down to the absolute minimum: routing only, no auth plugins, no transformers. Let each service handle its own authentication.

```yaml
_format_version: "3.0"
_transform: true

services:
  - name: auth
    url: http://gotrue:9999
    routes:
      - name: auth-routes
        paths: [/auth/v1]
        strip_path: true

  - name: rest
    url: http://postgrest:3000
    routes:
      - name: rest-routes
        paths: [/rest/v1]
        strip_path: true

  - name: realtime
    url: http://realtime:4000
    routes:
      - name: realtime-routes
        paths: [/realtime/v1]
        strip_path: true
        protocols: [http, https, ws, wss]

  - name: storage
    url: http://minio:9000
    routes:
      - name: storage-routes
        paths: [/storage/v1]
        strip_path: true

plugins:
  - name: cors
    config:
      origins: ["*"]
      methods: [GET, POST, PUT, PATCH, DELETE, OPTIONS]
      headers: [Authorization, Content-Type, apikey, x-client-info]
      credentials: true
```

**Configure PostgREST to validate JWTs:**

```yaml
# In docker-compose.yml, PostgREST service:
environment:
  PGRST_JWT_SECRET: ${JWT_SECRET}
  PGRST_DB_SCHEMAS: public
  PGRST_DB_ANON_ROLE: anon
```

**Configure GoTrue with the same JWT secret:**

```yaml
# In docker-compose.yml, GoTrue service:
environment:
  GOTRUE_JWT_SECRET: ${JWT_SECRET}
  GOTRUE_JWT_EXP: 3600
```

Both services use the same `JWT_SECRET`. GoTrue issues tokens, PostgREST validates them. Kong does not touch the JWT.

### Phase 2 — Add security at the gateway level

Once routing works with real auth flows, add Kong plugins incrementally:

1. **CORS** — already done
2. **Rate limiting** — `rate-limiting` plugin on specific routes
3. **API key for anonymous access** — `key-auth` plugin (Supabase uses this for the `apikey` header)
4. **Request size limiting** — `request-size-limiting` on upload routes

Each plugin is added, tested, and committed independently.

### Phase 3 — Advanced flows (only if needed)

If you genuinely need Kong to inspect JWT claims (for example, to route different roles to different upstreams), THEN consider Option B (custom image with a simple Lua plugin). But do not build this until Phase 1 and 2 are working and you have a concrete use case.

---

## 6. How QA Can Help Right Now

The QA system we built is designed exactly for this scenario. Here is how it connects:

### Smoke tests already exist

We already have test definitions for the services your partner is trying to configure:

```
INFRA-003  GoTrue health on :9999          (active)
INFRA-004  PostgREST health on :3000       (active)
INFRA-005  MinIO health on :9000           (active)
INFRA-002  Kong health on :8000            (draft — waiting for Kong)
GW-001     Kong routes /auth to GoTrue     (draft — waiting for Kong)
AUTH-001   Login returns access_token      (draft — waiting for test user)
AUTH-003   No token returns 401            (active)
```

The moment Kong is configured and mini-baas-infra is running, these tests can validate each step of the configuration:

```
1. make compose-up                          (in mini-baas-infra)
2. cd ../QA && make test PRIORITY=P0        (in QA repo)
   → INFRA-003 ✓ GoTrue is up
   → INFRA-004 ✓ PostgREST is up
   → INFRA-005 ✓ MinIO is up
   → INFRA-002 ? Kong routes correctly
   → GW-001   ? Kong forwards /auth to GoTrue
   → AUTH-001  ? Full auth flow works
```

### New tests to add for the Kong rollout

I propose adding these tests specifically to validate your partner's Kong configuration incrementally:

```
GW-003   Kong passes Authorization header to PostgREST
GW-004   PostgREST rejects request without valid JWT (via Kong)
GW-005   Kong proxies WebSocket upgrade to Realtime
AUTH-005  Full flow: signup → login → access /rest with JWT
```

Each test validates one specific behavior. If GW-003 passes but GW-004 fails, you know Kong is routing correctly but PostgREST's JWT validation is misconfigured. The test names tell you exactly where the problem is.

### The validation checklist your partner asked for

Question 4 in the blocker document: "Should we add a dedicated validation checklist (smoke tests per route) before marking gateway setup as complete?"

**Yes, and it already exists.** The QA test definitions ARE the validation checklist. Each test with status `draft` is a specification of what should work. When your partner configures a route, they set the corresponding test to `active`, run `make test`, and see if it passes. This is exactly the TDD approach we designed the system for.

---

## 7. Tradeoff Summary

| Strategy | Effort | Risk | Ceiling | My verdict |
|----------|--------|------|---------|------------|
| **A — Better YAML only** | Low | Low | Hard ceiling at dynamic header injection | Good for Phase 1, insufficient long-term |
| **B — Custom image** | Medium | Low (Kong plugins are stable) | No ceiling | Correct for Phase 3 if needed |
| **C — Sidecar proxy** | High | High (double failure surface) | No ceiling | Avoid — unnecessary complexity |
| **D — Use Supabase's own config** | Very low | Very low | Covers 95% of use cases | **Start here** |
| **D + A — Supabase config + incremental plugins** | Low | Low | Covers 99% | **Recommended path** |

---

## 8. Concrete Action Plan

### This week — your partner

1. **Read Supabase's self-hosted Docker setup** ([github.com/supabase/supabase/docker](https://github.com/supabase/supabase/tree/master/docker)). Focus on `docker-compose.yml` and `volumes/api/kong.yml`.

2. **Verify that PostgREST is configured with JWT_SECRET.** If `PGRST_JWT_SECRET` is not set, PostgREST cannot validate tokens — this is likely the root cause of the "cross-service flows don't work" symptom.

3. **Strip Kong config to routing only.** Remove any auth plugins. Let PostgREST and GoTrue handle their own auth.

4. **Test the auth flow manually:**
   ```bash
   # 1. Create a user
   curl -X POST http://localhost:8000/auth/v1/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"test1234"}'

   # 2. Login and get JWT
   TOKEN=$(curl -s -X POST http://localhost:8000/auth/v1/token?grant_type=password \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"test1234"}' | jq -r .access_token)

   # 3. Use JWT to access PostgREST through Kong
   curl http://localhost:8000/rest/v1/ \
     -H "Authorization: Bearer $TOKEN"
   ```

   If step 3 works, the blocker is resolved. Kong is just routing, PostgREST is validating the JWT.

### This week — QA integration

5. **Activate the GW and AUTH tests** as your partner configures each route.

6. **Add the new tests (GW-003 to GW-005, AUTH-005)** that validate the cross-service flows.

7. **Run `make test` from the QA repo against the running mini-baas-infra** — this is the automated validation checklist.

### Decision to communicate back to your partner

The "prebuilt-only" constraint is fine for Phase 1 and 2. Vanilla Kong with declarative YAML handles routing, CORS, rate limiting, and header passthrough. The services themselves handle JWT validation. There is no need for custom Kong plugins unless a concrete use case requires dynamic claim-based routing — and that use case does not exist yet.

**The answer to question 1 ("keep strict prebuilt-only?") is: yes, for now.** Not because custom images are bad, but because you don't need them yet. The blocker is not Kong's limitations — it is the assumption that Kong must do the JWT intelligence. It doesn't. PostgREST does.

---

*This analysis is based on the technical summary and blocker document shared on March 26, 2026. Verify the Supabase self-hosted configuration at [github.com/supabase/supabase/docker](https://github.com/supabase/supabase/tree/master/docker) as it may have been updated since.*
