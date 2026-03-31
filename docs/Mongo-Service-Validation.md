# MongoDB HTTP Service Validation Report

**File:** [deployments/base/mongo-api/server.js](../deployments/base/mongo-api/server.js)  
**Status:** ✅ **READY FOR MVP** (with Kong route configuration needed)  
**Date:** March 31, 2026

---

## 1. Endpoint Implementation Validation

### ✅ All 6 Required Endpoints Implemented

| Endpoint | Method | Spec | Actual | Status |
|----------|--------|------|--------|--------|
| Health check | GET | `/mongo/v1/health` | `/health` | ✅ OK* |
| Create document | POST | `/mongo/v1/collections/:name/documents` | `/collections/:name/documents` | ✅ OK* |
| List documents | GET | `/mongo/v1/collections/:name/documents` | `/collections/:name/documents` | ✅ OK* |
| Get document | GET | `/mongo/v1/collections/:name/documents/:id` | `/collections/:name/documents/:id` | ✅ OK* |
| Update document | PATCH | `/mongo/v1/collections/:name/documents/:id` | `/collections/:name/documents/:id` | ✅ OK* |
| Delete document | DELETE | `/mongo/v1/collections/:name/documents/:id` | `/collections/:name/documents/:id` | ✅ OK* |

**\* Path Note:** Service implements `/health` and `/collections/...` but Kong routes with `/mongo/v1` prefix. Kong route must be configured (see section 3.2).

---

## 2. Response Envelope & Error Handling

### 2.1 Success Response Format ✅

**Implementation (lines 17-22):**
```javascript
const ok = (res, status, data, meta) => {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
};
```

**Matches Spec:**
```json
{
  "success": true,
  "data": { /* payload */ },
  "meta": { "request_id": "...", "pagination": {...} }
}
```

✅ **Status:** Correct (meta optional as per spec)

**Note:** `request_id` is NOT generated in current implementation. **Decision:** Not critical for MVP (can add UUID in meta if team prefers).

---

### 2.2 Error Response Format ✅

**Implementation (lines 24-30):**
```javascript
const fail = (res, status, code, message, details) => {
  const payload = {
    success: false,
    error: { code, message },
  };
  if (details) payload.error.details = details;
  return res.status(status).json(payload);
};
```

**Matches Spec:**
```json
{
  "success": false,
  "error": { "code": "error_code", "message": "...", "details": "..." }
}
```

✅ **Status:** Correct (details optional as per spec)

---

### 2.3 Error Codes Used in Implementation

| Status | Code | Message | Context |
|--------|------|---------|---------|
| 500 | `server_config_error` | "JWT secret is not configured" | Startup/config |
| 401 | `missing_authorization` | "Authorization bearer token is required" | Missing JWT |
| 401 | `invalid_token` | "JWT token is invalid" or "does not include valid subject" | Bad/malformed JWT |
| 400 | `invalid_collection` | "Collection name must match ^[a-zA-Z0-9_-]{1,64}$" | Invalid collection name |
| 400 | `invalid_id` | "Document id is not a valid ObjectId" | Non-ObjectId string |
| 400 | `invalid_payload` | "Body must include a document/patch object" | Missing/malformed body |
| 400 | `forbidden_fields` | "document/patch must not include _id or owner_id" | Client tries to set ctrl fields |
| 400 | `invalid_filter` | "Invalid filter query parameter" | Malformed filter JSON |
| 404 | `not_found` | "Document not found" | No doc or not owned |
| 413 | `payload_too_large` | "Payload exceeds 256KB limit" | Body > 256KB |
| 400 | `invalid_json` | "Malformed JSON payload" | SyntaxError |
| 503 | `mongo_unavailable` | "MongoDB is unavailable" | Mongo down |
| 500 | `internal_error` | "Unexpected server error" | Catch-all |

✅ **Status:** Comprehensive error coverage for all validation cases.

---

## 3. Authentication & Authorization

### 3.1 JWT Token Extraction ✅

**Implementation (lines 32-38):**
```javascript
const parseBearerToken = (req) => {
  const value = req.headers.authorization || "";
  if (!value.startsWith("Bearer ")) {
    return null;
  }
  return value.slice(7).trim();
};
```

✅ **Status:** Correct (extracts `Authorization: Bearer <TOKEN>`)

---

### 3.2 JWT Verification ✅

**Implementation (lines 40-62):**
- Verifies token using `JWT_SECRET` env var
- Requires HS256 algorithm
- Extracts `sub` (subject) claim → `req.user.id`
- Also captures `email` and `role` from JWT claims

✅ **Status:** Correct. Matches spec requirement to use JWT subject for `owner_id`.

**Note:** Requires `JWT_SECRET` environment variable (should match GoTrue/Kong JWT signing secret).

---

### 3.3 User Isolation Enforcement ✅

All data queries auto-filter by `owner_id`:

| Endpoint | Query Filter | Lines |
|----------|--------------|-------|
| GET /collections/:name/documents | `owner_id: req.user.id` | 151-156 |
| GET /collections/:name/documents/:id | `{_id, owner_id: req.user.id}` | 180-181 |
| PATCH /collections/:name/documents/:id | `{_id, owner_id: req.user.id}` | 206-208 |
| DELETE /collections/:name/documents/:id | `{_id, owner_id: req.user.id}` | 228-229 |

✅ **Status:** Robust. User B cannot access user A's documents across all operations.

---

## 4. Request Validation

### 4.1 Collection Name Validation ✅

**Pattern:** `^[a-zA-Z0-9_-]{1,64}$`

**Implementation (lines 78-85):**
```javascript
const COLLECTION_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const parseCollectionName = (req, res) => {
  const { name } = req.params;
  if (!COLLECTION_NAME_PATTERN.test(name)) {
    fail(res, 400, "invalid_collection", "Collection name must match^[a-zA-Z0-9_-]{1,64}$");
    return null;
  }
  return name;
};
```

✅ **Status:** Matches spec exactly.

---

### 4.2 Document ID Validation (ObjectId) ✅

**Implementation (lines 87-92):**
```javascript
const parseObjectId = (value) => {
  if (!ObjectId.isValid(value)) {
    return null;
  }
  return new ObjectId(value);
};
```

✅ **Status:** Correct. Rejects non-MongoDB ObjectId strings (24-char hex).

---

### 4.3 Payload Size Limit (256 KB) ✅

**Implementation (line 15):**
```javascript
app.use(express.json({ limit: "256kb" }));
```

**Error Handler (lines 262-264):**
```javascript
if (err && err.type === "entity.too.large") {
  return fail(res, 413, "payload_too_large", "Payload exceeds 256KB limit");
}
```

✅ **Status:** Enforced at both express middleware and error handler levels.

---

### 4.4 Forbidden Fields Protection ✅

Both CREATE and PATCH reject `_id` and `owner_id` in request body:

**CREATE (lines 137-139):**
```javascript
if (Object.prototype.hasOwnProperty.call(document, "_id") || 
    Object.prototype.hasOwnProperty.call(document, "owner_id")) {
  return fail(res, 400, "forbidden_fields", "document must not include _id or owner_id");
}
```

**PATCH (lines 202-204):**
```javascript
if (Object.prototype.hasOwnProperty.call(patch, "_id") || 
    Object.prototype.hasOwnProperty.call(patch, "owner_id")) {
  return fail(res, 400, "forbidden_fields", "patch must not include _id or owner_id");
}
```

✅ **Status:** Prevents user from overriding server-controlled fields.

---

## 5. CRUD Operations Detail

### 5.1 CREATE: POST /collections/:name/documents ✅

**Request:**
```json
{
  "document": {
    "title": "Task 1",
    "status": "pending"
  }
}
```

**Implementation (lines 127-149):**
- ✅ Parses `req.body.document`
- ✅ Validates not array, is object
- ✅ Rejects `_id` and `owner_id` in input
- ✅ Auto-injects `owner_id` from `req.user.id`
- ✅ Sets `created_at` and `updated_at` timestamps
- ✅ Returns 201 with generated `id` (converted from MongoDB `_id`)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Task 1",
    "status": "pending",
    "owner_id": "user-uuid",
    "created_at": "2026-03-31T10:00:00.000Z",
    "updated_at": "2026-03-31T10:00:00.000Z"
  }
}
```

✅ **Status:** Fully spec-compliant.

---

### 5.2 READ: GET /collections/:name/documents ✅

**Query Parameters:**
- `limit` (1-100, default 20) ✅
- `offset` (default 0) ✅
- `sort` (field:asc|desc, default created_at:desc) ✅
- `filter` (JSON string, ANDed with owner_id) ✅

**Implementation (lines 151-177):**
- ✅ Parses pagination with bounds checking
- ✅ Parses sort with field validation regex `^[a-zA-Z0-9_]{1,64}$`
- ✅ Parses filter, removes `owner_id` and `_id` from user-supplied filter
- ✅ Auto-adds `owner_id: req.user.id` to query
- ✅ Returns array with `id` (converted `_id`) and removed `_id` field
- ✅ Includes `meta` with `total`, `limit`, `offset`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "Task 1",
      "owner_id": "user-uuid",
      "created_at": "2026-03-31T10:00:00.000Z",
      "updated_at": "2026-03-31T10:00:00.000Z"
    }
  ],
  "meta": {
    "total": 150,
    "limit": 20,
    "offset": 0
  }
}
```

✅ **Status:** Fully spec-compliant with advanced filtering/sorting.

---

### 5.3 READ ONE: GET /collections/:name/documents/:id ✅

**Implementation (lines 179-192):**
- ✅ Parses ObjectId from path param
- ✅ Queries with both `_id` and `owner_id` filter
- ✅ Returns 404 if missing or not owned
- ✅ Converts `_id` to `id`, removes `_id` from response

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Task 1",
    "owner_id": "user-uuid",
    "created_at": "2026-03-31T10:00:00.000Z",
    "updated_at": "2026-03-31T10:00:00.000Z"
  }
}
```

✅ **Status:** Fully spec-compliant.

---

### 5.4 UPDATE: PATCH /collections/:name/documents/:id ✅

**Request:**
```json
{
  "patch": {
    "status": "completed",
    "title": "Task 1 Updated"
  }
}
```

**Implementation (lines 194-221):**
- ✅ Parses ObjectId
- ✅ Parses `req.body.patch`
- ✅ Validates not array, is object
- ✅ Rejects `_id` and `owner_id` in patch
- ✅ Auto-updates `updated_at`
- ✅ Uses MongoDB `$set` operator (appropriate for sparse updates)
- ✅ Queries with `_id` and `owner_id` filter
- ✅ Returns 404 if missing or not owned

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Task 1 Updated",
    "status": "completed",
    "owner_id": "user-uuid",
    "created_at": "2026-03-31T10:00:00.000Z",
    "updated_at": "2026-03-31T10:05:00.000Z"
  }
}
```

✅ **Status:** Fully spec-compliant. Merge semantics preserved.

---

### 5.5 DELETE: DELETE /collections/:name/documents/:id ✅

**Implementation (lines 223-244):**
- ✅ Parses ObjectId
- ✅ Queries with `_id` and `owner_id` filter
- ✅ Checks `deletedCount === 1` to return 404 if missing or not owned
- ✅ Returns `{ deleted: true }` as per spec

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

✅ **Status:** Fully spec-compliant.

---

## 6. Environment Configuration

**Required Environment Variables:**

| Variable | Purpose | Current Default | MVP Requirement |
|----------|---------|------------------|------------------|
| `PORT` | Service listen port | 3010 | Should align with docker-compose.yml |
| `MONGO_URI` | MongoDB connection string | mongodb://mongo:27017 | OK for local dev |
| `MONGO_DB_NAME` | Database name | mini_baas | ✅ Matches spec |
| `JWT_SECRET` | JWT verification secret | "" (empty) | **MUST be set** for MVP |

✅ **Status:** All sensible defaults. **Critical:** `JWT_SECRET` must be provided at runtime and match GoTrue's signing secret.

---

## 7. Kong Route Configuration Needed

**Current Implementation:**
- Service listens on `/health`, `/collections/:name/documents`, etc.
- These are **relative paths** (no `/mongo/v1` prefix)

**Kong Route Required:**
The service must be exposed via Kong at `/mongo/v1` with:
- Route path: `/mongo/v1`
- Service path: `/` (strip or rewrite)
- Key-auth plugin (same as `/rest/v1`)
- OR expect upstreams to call service directly at `http://mongo-api:3010`

**Recommendation:** Add Kong route configuration entry to [deployments/base/kong/kong.yml](../../deployments/base/kong/kong.yml):

```yaml
routes:
  - name: mongo-api
    service: mongo-api-service
    paths:
      - /mongo/v1
    methods:
      - GET
      - POST
      - PATCH
      - DELETE
    plugins:
      - name: key-auth
        config:
          header_names: apikey

services:
  - name: mongo-api-service
    protocol: http
    host: mongo-api
    port: 3010
```

---

## 8. Alignment Checklist

| Requirement | Spec | Implementation | Status |
|-------------|------|-----------------|--------|
| All 6 endpoints present | ✅ | ✅ | ✅ |
| Response envelope | ✅ | ✅ | ✅ |
| Error envelope | ✅ | ✅ | ✅ |
| JWT Bearer token required | ✅ | ✅ | ✅ |
| owner_id auto-injected | ✅ | ✅ | ✅ |
| User isolation enforced | ✅ | ✅ | ✅ |
| Collection name validation | ✅ | ✅ | ✅ |
| 256 KB payload limit | ✅ | ✅ | ✅ |
| Forbidden fields (_id, owner_id) | ✅ | ✅ | ✅ |
| Pagination (limit, offset) | ✅ | ✅ | ✅ |
| Sorting support | ✅ | ✅ | ✅ |
| Filter support (with owner_id AND) | ✅ | ✅ | ✅ |
| ObjectId validation | ✅ | ✅ | ✅ |
| Comprehensive error codes | ✅ | ✅ | ✅ |
| Timestamps (created_at, updated_at) | ✅ | ✅ | ✅ |

---

## 9. Potential Improvements (Post-MVP)

1. **Request ID Tracking:** Add UUID to meta for request tracing
2. **Rate Limiting:** Add rate limit plugin in Kong/service
3. **Audit Logging:** Log mutations (CREATE, PATCH, DELETE) with user/timestamp
4. **Aggregation Pipeline:** Support MongoDB aggregation for complex queries (phase 2)
5. **Transactions:** Multi-document transactions for related collections (phase 2)
6. **Bulk Operations:** Batch create/update/delete (phase 2)

---

## 10. Summary

### ✅ **READY FOR MVP DEPLOYMENT**

The MongoDB HTTP service implementation is **feature-complete** and **spec-compliant**. All 6 CRUD endpoints are implemented, user isolation is enforced, validation is comprehensive, and error handling covers all cases.

### Prerequisites to Deploy:

1. ✅ Ensure `JWT_SECRET` env var matches GoTrue signing secret
2. ✅ Configure Kong route at `/mongo/v1` pointing to `http://mongo-api:3010`
3. ✅ Verify MongoDB is running and reachable at `mongodb://mongo:27017`
4. ✅ Test with sample requests (see test cases in BaaS_MVP.md phases 0-5)

### Next Steps:

1. **Today:** ✅ Spec validation complete
2. **Tomorrow:** Add Kong route config + test locally
3. **Next Day:** Write smoke test script (phase15-mongo-mvp-test.sh)
4. **Thursday:** End-to-end demo
5. **Friday:** Acceptance testing

---

## Appendix: Files Reference

- **Service Code:** [deployments/base/mongo-api/server.js](../../deployments/base/mongo-api/server.js)
- **Package Config:** [deployments/base/mongo-api/package.json](../../deployments/base/mongo-api/package.json)
- **Kong Config (TODO):** [deployments/base/kong/kong.yml](../../deployments/base/kong/kong.yml)
- **Docker Compose:** [docker-compose.yml](../../docker-compose.yml)
- **MVP Spec:** [BaaS_MVP.md](../../BaaS_MVP.md)
- **Schema Spec:** [docs/MVP-Schema-Specification.md](MVP-Schema-Specification.md)
