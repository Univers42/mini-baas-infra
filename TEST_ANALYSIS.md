# Mini-BaaS Test Coverage Analysis

## Executive Summary

The current test suite covers **basic happy-path scenarios** for the core authentication and REST API flows, but lacks comprehensive coverage for:
- Error handling and edge cases
- Advanced HTTP operations (PUT, PATCH, DELETE)
- Realtime/WebSocket functionality
- Storage service operations
- Performance and load testing
- Security boundary testing

---

## Current Test Phases Overview

### Phase 1: Kong Routing + Auth + REST Access (Smoke Test)
**Status:** ✓ Basic happy-path coverage

**What's tested:**
- Kong proxy health check to GoTrue (/auth/v1/health)
- User signup with email/password
- User login with JWT token issuance
- JWT claims validation (role extraction from token payload)
- PostgREST access without bearer token (anon behavior)
- PostgREST access with valid JWT
- Invalid JWT rejection
- Kong proxy header verification

**HTTP Methods Covered:** GET, POST (limited)

**Gaps:**
- No password strength validation testing
- No duplicate account handling
- No email format validation errors
- No concurrent signup attempts
- No JWT expiration scenarios
- No token refresh testing

---

### Phase 2: Kong Gateway Security Controls
**Status:** ✓ Partial coverage

**What's tested:**
- Key-auth enforcement (missing, invalid, valid API keys)
- Key-auth on /auth/v1, /rest/v1, /storage/v1
- CORS preflight headers
- Request size limiting (>10MB rejected with 413)
- Optional rate-limit burst testing

**HTTP Methods Covered:** GET, POST, OPTIONS (CORS)

**Gaps:**
- Small payload handling on storage route not validated
- Actual file upload/download not tested
- CORS header validation incomplete (no origin matching tests)
- Rate limiting only tested for burst; not steady-state
- No rate-limit reset/recovery testing
- No combination of plugins (e.g., size limit + rate limit together)
- No custom header handling

---

### Phase 3: Authenticated Database Access
**Status:** ✓ Basic coverage

**What's tested:**
- Complete signup → login → JWT → REST flow
- REST API access with JWT authentication
- JWT token structure validation (sub, email, aud claims)
- Invalid/malformed token rejection
- Unauthenticated access behavior

**HTTP Methods Covered:** GET, POST

**Gaps:**
- No database mutation testing (INSERT, UPDATE, DELETE)
- No JOIN/complex query testing
- No pagination testing
- No filtering/search functionality
- No error response validation
- No response time SLA testing
- Only queries /rest/v1/users table (single endpoint)

---

### Phase 4: User Data Isolation & Row-Level Security (RLS)
**Status:** ⚠️ Incomplete

**What's tested:**
- Multi-user authentication (two users)
- JWT token validation for each user
- Basic access control (authenticated vs unauthenticated)
- Malformed token rejection

**HTTP Methods Covered:** GET, POST

**Gaps:**
- **No actual RLS enforcement validation** - tests that both users can access data but doesn't verify they only see their own data
- No cross-user access attempt (User A trying to access User B's data)
- No test of user-specific views or policies
- No test of table-level permissions (who can read vs write)
- No concurrent user access patterns
- No session management/logout testing
- No token claim verification beyond presence

---

### Phase 5: Database Information Retrieval
**Status:** ✓ Basic coverage

**What's tested:**
- Database info endpoint availability (/sql/v1/info or /rest/v1/)
- JSON response validation
- Presence of metadata (version, database, schemas, tables)

**HTTP Methods Covered:** GET

**Gaps:**
- No schema introspection detail validation
- No table structure testing
- No column information retrieval
- No relationship/foreign key testing
- No index information exposure
- No views/function discovery
- pg-meta service not directly tested

---

## Available Services Not Comprehensively Tested

| Service | Port | Status | Testing Gaps |
|---------|------|--------|--------------|
| **Kong** | 8000 | ✓ Routed only | Admin API (8001) not tested; plugin configurations not validated |
| **GoTrue** | 9999 | ✓ Basic auth | MFA, email verification, password reset, OAuth flows |
| **PostgREST** | 3002 | ⚠️ Limited | Only read access; mutations (POST/PUT/PATCH/DELETE), RLS enforcement |
| **Realtime** | 4000 | ✗ None | WebSocket connections, subscriptions, broadcast, presence |
| **MinIO (Storage)** | 9000 | ✗ None | File upload, download, delete, bucket operations, multipart upload |
| **pg-meta** | 8080 | ✗ None | Schema introspection, table metadata, relationships |
| **Trino** | 8080 | ✗ None | SQL query execution through Kong gateway |
| **MongoDB** | 27017 | ✗ None | No MongoDB testing in this phase |
| **Redis** | 6379 | ✗ None | No caching/session testing |
| **Supavisor** | 6543 | ✗ None | Connection pooling not tested |
| **Studio** | 3001 | ✗ None | UI integration not tested |

---

## Key Testing Gaps

### 1. **HTTP Method Coverage**
Currently only testing: `GET`, `POST`, `OPTIONS`

**Missing:**
- `PUT` - full resource replacement
- `PATCH` - partial resource updates
- `DELETE` - resource deletion
- `HEAD` - metadata without body

### 2. **Error Handling & Status Codes**
**Tested:** 200, 401, 413
**Missing:**
- 400 Bad Request
- 403 Forbidden
- 404 Not Found
- 409 Conflict
- 422 Unprocessable Entity
- 500 Internal Server Error
- 503 Service Unavailable

### 3. **Data Validation**
- Email validation (invalid formats, length limits)
- Password validation (strength, length, special chars)
- Field type validation
- Required field validation
- Max/min value constraints
- Unique constraint violations

### 4. **Edge Cases & Boundary Testing**
- Empty payloads
- Null values in required fields
- Maximum field lengths
- Unicode/special characters
- SQL injection attempts
- Large batch operations
- Concurrent modifications

### 5. **Security Testing**
- Cross-Origin Resource Sharing (CORS) origin validation
- CSRF token validation (if applicable)
- SQL injection prevention
- XSS prevention
- Token tampering detection
- Unauthorized scope access
- Role-based access control (RBAC) enforcement

### 6. **Performance & Load Testing**
- Concurrent user connections
- Request latency SLOs
- Rate-limit enforcement (sustained, not just burst)
- Database query performance
- Memory usage under load
- Connection pool exhaustion

### 7. **Realtime Features** (WebSocket)
- Connection establishment
- Subscription to tables
- Real-time updates
- Broadcast messaging
- Presence tracking
- Connection recovery/reconnection
- Unsubscription cleanup

### 8. **Storage Service** (MinIO)
- File upload (various sizes)
- File download
- File deletion
- Directory operations
- Multipart upload
- ACL/permissions
- Bucket operations

### 9. **Token Management**
- Token refresh flow (missing entirely)
- Token expiration handling
- Refresh token rotation
- Session timeout
- Logout/revocation
- Multiple active sessions per user

### 10. **Database Operations**
- INSERT operations
- UPDATE operations
- DELETE operations
- Transactions/rollback
- Concurrent operations
- Large dataset handling (pagination)
- Complex queries (JOINs, aggregations)
- Stored procedures/functions

---

## Recommended New Test Phases

### **Phase 6: HTTP Method Coverage**
Test all REST operations (POST, GET, PUT, PATCH, DELETE) against the users table.
- Create user via POST /rest/v1/users
- Read user via GET /rest/v1/users/{id}
- Update user via PUT /rest/v1/users/{id}
- Partial update via PATCH /rest/v1/users/{id}
- Delete user via DELETE /rest/v1/users/{id}
- List users with pagination via GET /rest/v1/users?limit=10&offset=0
- Filter users via GET /rest/v1/users?email=eq.test@example.com

**Estimated effort:** 2-3 hours

---

### **Phase 7: Error Handling & Validation**
Comprehensive error scenario testing.
- Invalid email formats (400)
- Duplicate email on signup (409)
- Missing required fields (400/422)
- Invalid password strength (422)
- Invalid JWT token formats (401)
- Expired JWT tokens (401)
- API key rate limit exceeded (429)
- Payload size exceeds limit (413)
- Database constraint violations (409)

**Estimated effort:** 3-4 hours

---

### **Phase 8: Realtime WebSocket Testing**
WebSocket and real-time features.
- Connect to /realtime/v1 with subscribe
- Subscribe to table changes
- Receive INSERT broadcasts
- Receive UPDATE broadcasts
- Receive DELETE broadcasts
- Presence tracking
- Connection recovery
- Unsubscribe cleanup

**Estimated effort:** 4-5 hours (requires WebSocket test library)

---

### **Phase 9: Storage Service (MinIO)**
File operations and object storage.
- Upload small file (<1MB)
- Upload large file (1-10MB)
- Download file
- Delete file
- List bucket contents
- Multipart upload
- Check size limits
- File metadata retrieval

**Estimated effort:** 3-4 hours

---

### **Phase 10: Data Mutation & Complex Queries**
Advanced database operations.
- INSERT with various data types
- UPDATE with partial data
- DELETE with filters
- Batch operations
- UPSERT (if supported)
- Transactions
- JOIN queries (if exposed via REST)
- Aggregation queries
- Pagination behavior
- Complex filtering/sorting

**Estimated effort:** 3-4 hours

---

### **Phase 11: RLS Enforcement Verification**
Proper test for row-level security (currently missing).
- User A creates record X
- User A can read record X
- User B cannot read record X
- User A can update record X
- User B cannot update record X
- Admin/service_role can read all records
- Verify RLS policies are actually applied (not just access control)

**Estimated effort:** 2-3 hours

---

### **Phase 12: Token Lifecycle & Refresh**
Complete JWT token management.
- Token refresh via refresh_token
- Token expiration (if supported)
- Multiple concurrent sessions
- Logout/token revocation (if supported)
- Test refresh token rotation
- Verify old tokens rejected after refresh
- Session timeout behavior

**Estimated effort:** 2-3 hours

---

### **Phase 13: Performance & Load Testing**
SLA and resource constraint testing.
- Measure P50, P95, P99 latency for common operations
- Concurrent user load (10, 50, 100, 500 users)
- Rate limit enforcement at scale
- Database connection pool behavior
- Memory usage monitoring
- Timeout handling

**Tools:** wrk, ab, or custom load script
**Estimated effort:** 4-6 hours

---

### **Phase 14: Security Boundary Testing**
Security-specific scenarios.
- CSRF token validation
- CORS origin enforcement
- SQL injection attempts in filters
- XSS payload handling
- Missing authentication on protected endpoints
- Missing authorization (user tries admin operation)
- API key in request body vs header
- HTTPS enforcement (if applicable)

**Estimated effort:** 3-4 hours

---

## Quick-Win Improvements to Current Tests

### Immediate (1-2 phase scripts):
1. **Add token refresh test to Phase 1** - Test `POST /auth/v1/token?grant_type=refresh_token`
2. **Add DELETE test to Phase 4** - Verify User 1 can delete own data but not User 2's
3. **Add PUT/PATCH to Phase 3** - Test update operations on REST API
4. **Expand Phase 5** - Add schema details and relationship validation

### Short-term (Phase 6-7):
1. Create Phase 6 for complete HTTP method coverage (PUT, PATCH, DELETE)
2. Create Phase 7 for error scenarios (400, 409, 422, 429)
3. Add RLS enforcement test to Phase 4

### Medium-term (Phase 8-12):
1. Phase 8 - Realtime WebSocket testing
2. Phase 9 - Storage service testing
3. Phase 10 - Data mutations and complex queries
4. Phase 11 - Token lifecycle
5. Phase 12 - Performance baseline

---

## Test Infrastructure Improvements

1. **Shared Test Utilities**
   - Create a test library for common operations (signup, login, REST query)
   - JWT assertion helpers
   - Response validation utilities
   - WebSocket helpers

2. **Test Data Management**
   - Cleanup between test phases (remove test users, records)
   - Database reset option
   - Seed data for complex queries

3. **Monitoring & Reporting**
   - Capture timing data
   - API error rate tracking
   - Test execution metrics
   - HTML report generation

4. **CI/CD Integration**
   - Run all phases on every commit
   - Performance regression detection
   - Email notifications on failures
   - Artifact collection (logs, screenshots for failures)

---

## Services Requiring Implementation/Configuration

| Service | Current Status | Testing Need | Priority |
|---------|---|---|---|
| Trino | No Kong route | SQL query testing | Medium |
| pg-meta | Route commented out | Schema introspection testing | Medium |
| MongoDB | Running but isolated | Data model testing | Low |
| Redis | Running but isolated | Cache/session testing | Low |
| Supavisor | Running but isolated | Connection pooling testing | Low |
| Studio | Running but isolated | UI integration/E2E testing | Low |

---

## Recommended Priority Order for New Phases

1. **Phase 6** (HTTP Methods) - Unlocks understanding of REST API capabilities
2. **Phase 7** (Error Handling) - Essential for production readiness
3. **Phase 11** (RLS Enforcement) - Security critical
4. **Phase 8** (Realtime) - High-value feature testing
5. **Phase 9** (Storage) - Completeness
6. **Phase 10** (Data Mutations) - Coverage
7. **Phase 12** (Token Lifecycle) - Production readiness
8. **Phase 13** (Performance) - Operations/SLA validation
9. **Phase 14** (Security) - Hardening
10. **Phase 12** (Complex Queries) - Advanced features

---

## Summary Statistics

| Metric | Current | Recommended |
|--------|---------|-------------|
| Test Phases | 5 | 14 |
| Services Tested | 4/13 | 10/13 |
| HTTP Methods | 3 (GET, POST, OPTIONS) | 6 (+ PUT, PATCH, DELETE, HEAD) |
| Error Codes Tested | 3 (200, 401, 413) | 10+ (400, 403, 404, 409, 422, 429, 500, 503, etc.) |
| Test Coverage | ~15-20% | ~80-85% (target) |
| Estimated Hours | ~8 | ~40-50 total |

