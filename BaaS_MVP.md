For a Friday MVP, I recommend a strict 2-lane scope: keep PostgreSQL on the current production path, and add a very thin MongoDB HTTP layer instead of trying to expose Mongo directly.

What your repo already supports:
1. PostgreSQL path is already real and gateway-protected through auth and rest routes in kong.yml and kong.yml.
2. MongoDB is running as infrastructure only (container + healthcheck) in docker-compose.yml and docker-compose.yml.
3. Browser cannot use Mongo wire protocol directly, which is already called out in app.js.
4. Current automated phases are gateway/postgres-centric (1-13) in Makefile.

So the right MVP decision:
1. Do not expose Mongo raw port as your product API.
2. Add one minimal HTTP service for Mongo CRUD and route it via Kong.
3. Keep one auth model for both engines (apikey + JWT context from Kong).

Recommended Friday MVP contract:
1. PostgreSQL:
- Keep existing /auth/v1 and /rest/v1 as-is.
- Support basic table CRUD for one demo domain (for example: projects).
2. MongoDB:
- Add /mongo/v1/health
- Add /mongo/v1/collections/:name/documents (POST, GET with limit/offset)
- Add /mongo/v1/collections/:name/documents/:id (GET, PATCH, DELETE)
3. Common:
- Same apikey enforcement at gateway.
- Same request/response envelope style.
- Basic per-user scoping field (owner_id) enforced in service logic for Mongo.

What not to do this week:
1. No cross-database joins/federation.
2. No dynamic schema builder.
3. No multi-tenant billing/quotas beyond current rate limits.
4. No advanced Mongo aggregation API.

Execution plan to hit Friday:
1. Today:
- Freeze API surface and demo data model.
- Confirm schema contract expectations in README.md.
2. Tomorrow:
- Implement minimal Mongo HTTP service with the endpoints above.
- Add Kong route /mongo/v1 and key-auth plugin (same style as rest/auth in kong.yml).
3. Next day:
- Add one new smoke script for Mongo happy path + auth failure + user isolation.
- Add it to the test runner list in Makefile.
4. Thursday:
- Demo script + docs: one Postgres flow and one Mongo flow, both through Kong.
- Stabilization pass and failure handling.

Friday acceptance checklist:
1. User can sign in and call Postgres CRUD through gateway.
2. User can call Mongo CRUD through gateway.
3. Missing/invalid apikey rejected on both.
4. One automated Mongo smoke phase passes locally with the existing suite.
5. Playground/demo shows one successful end-to-end call for each engine.

Here is a concrete spec you can execute today, with test cases your team can start implementing immediately.

**MVP Endpoint Spec (v1)**
Base URL: http://localhost:8000

1. Common Rules
- Required header on all protected routes: apikey
- Required header on user-scoped data routes: Authorization: Bearer <jwt>
- Content-Type: application/json
- Response envelope for custom Mongo service:
  - success: boolean
  - data: object or array (optional on errors)
  - error: { code, message, details? } (only on failure)
  - meta: { request_id, pagination? } (optional)

2. Auth (existing, keep as-is)
- POST /auth/v1/signup
  - Body: { email, password }
  - 200/201: user + session token
  - 4xx: validation/auth error
- POST /auth/v1/token?grant_type=password
  - Body: { email, password }
  - 200: access_token, refresh_token, expires_in
- POST /auth/v1/token?grant_type=refresh_token
  - Body: { refresh_token }
  - 200: rotated tokens

3. PostgreSQL Data Plane (existing via REST)
Resource for MVP demo: projects
- GET /rest/v1/projects?select=*
- POST /rest/v1/projects
  - Body: { name, status, owner_id }
- PATCH /rest/v1/projects?id=eq.<id>
  - Body: partial fields
- DELETE /rest/v1/projects?id=eq.<id>
Notes:
- Enforce row ownership with owner_id policy (JWT subject mapped to owner_id).
- Use RLS so user A cannot read user B rows.

4. Mongo Data Plane (new thin HTTP service behind Kong)
Service route: /mongo/v1
- GET /mongo/v1/health
  - 200: { success: true, data: { mongo: "ok" } }

- POST /mongo/v1/collections/:name/documents
  - Body: { document: object }
  - Server behavior: inject owner_id from JWT if absent
  - 201: { success: true, data: { id, ...document } }

- GET /mongo/v1/collections/:name/documents
  - Query:
    - limit (default 20, max 100)
    - offset (default 0)
    - sort (example: created_at:desc)
    - filter (JSON string, optional; always AND with owner_id from JWT)
  - 200: { success: true, data: [...], meta: { total, limit, offset } }

- GET /mongo/v1/collections/:name/documents/:id
  - 200: document
  - 404 if missing or not owned

- PATCH /mongo/v1/collections/:name/documents/:id
  - Body: { patch: object }
  - 200: updated doc
  - 404 if missing or not owned

- DELETE /mongo/v1/collections/:name/documents/:id
  - 200: { success: true, data: { deleted: true } }
  - 404 if missing or not owned

Validation constraints for Mongo MVP:
- Allowed collection names regex: ^[a-zA-Z0-9_-]{1,64}$
- Max payload: 256 KB for JSON body
- Forbidden top-level keys in document: _id, owner_id (owner_id only server-controlled)

**Test Cases For Today**
Target: finish P0 today, P1 tomorrow morning.

1. P0 Auth and Gateway Security
- Missing apikey on /auth/v1/health returns 401
- Invalid apikey on /rest/v1 returns 401
- Valid apikey on /rest/v1 reaches upstream (not 401 from Kong)
- Missing apikey on /mongo/v1/health returns 401
- Invalid apikey on /mongo/v1/health returns 401
- Valid apikey on /mongo/v1/health returns 200

2. P0 PostgreSQL Core
- Sign up user A succeeds
- Login user A returns access_token
- Create project with user A token succeeds
- List projects with user A token includes created project
- Patch project with user A token succeeds
- Delete project with user A token succeeds

3. P0 Mongo Core
- Create document in collection tasks with user A token returns 201 and id
- List documents in tasks with user A token includes created doc
- Get document by id with user A token returns 200
- Patch document by id with user A token returns updated fields
- Delete document by id with user A token returns deleted true

4. P0 Isolation (must-have)
- User A creates Mongo document
- User B requests same id gets 404
- User B list does not include user A document
- User B patch/delete on user A id gets 404
- PostgreSQL RLS equivalent: user B cannot read user A project

5. P1 Validation and Error Handling
- Invalid collection name (example: ../admin) returns 400
- Oversized Mongo payload returns 413
- Malformed JSON body returns 400
- Unknown Mongo document id returns 404
- Missing Authorization on protected Mongo data routes returns 401

6. P1 CORS and Preflight
- Allowed origin preflight on /rest/v1 returns access-control-allow-origin
- Allowed origin preflight on /mongo/v1 returns access-control-allow-origin
- Disallowed origin on protected routes does not return permissive wildcard behavior

**Definition of Done For Today**
- P0 tests green locally
- One happy-path demo script:
  - signup/login
  - create/read project in PostgreSQL
  - create/read document in Mongo
- One failure-path demo:
  - user B denied access to user A data in both engines
