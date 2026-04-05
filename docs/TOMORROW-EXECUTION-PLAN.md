# Tomorrow's Plan: Mongo Integration Testing (April 1)

## Status: ✅ Ready to Execute

All infrastructure is already in place:
- ✅ Mongo service fully implemented
- ✅ Kong route configured at `/mongo/v1`
- ✅ Docker-compose set up with mongo-api service
- ✅ Environment variables configured
- ✅ Test script created: `phase15-mongo-mvp-test.sh`

## Step-by-Step Execution

### Step 1: Generate Environment Variables (if .env doesn't exist)

```bash
cd /home/daniel/projects/mini-baas-infra

# Generate .env file with all required secrets
bash scripts/generate-env.sh .env

# Verify .env contains JWT_SECRET
grep JWT_SECRET .env
```

### Step 2: Start All Services

```bash
# Clean up old containers/volumes (optional, if you changed db-bootstrap.sql)
docker-compose down -v

# Start the full stack
docker-compose up -d

# Wait for services to be healthy
sleep 10

# Check service status
docker-compose ps
```

**Expected Output:**
```
NAME                COMMAND                     STATUS
mini-baas-gotrue    "/app/gotrue start"         Up (healthy)
mini-baas-postgres  "postgres -c listen..."     Up (healthy)
mini-baas-kong      "/docker-entrypoint.s..."   Up
mini-baas-mongo     "mongod --replSet rs0"      Up (healthy)
mini-baas-mongo-api "node server.js"            Up
mini-baas-postgrest "postgrest /etc/postgre..." Up
mini-baas-realtime  "dumb-init -- /app/bin..." Up
```

### Step 3: Extract API Key from .env

```bash
# Get the public API key for testing
ANON_KEY=$(grep "^KONG_PUBLIC_API_KEY=" .env | cut -d= -f2)
echo "Using API Key: $ANON_KEY"

# Export it for the test script
export ANON_KEY
```

### Step 4: Run the MongoDB Test Suite

```bash
# Make the test script executable
chmod +x scripts/phase15-mongo-mvp-test.sh

# Run the full test suite
bash scripts/phase15-mongo-mvp-test.sh

# Expected output:
# ======================================
# MongoDB MVP Integration Test Suite
# ======================================
# Gateway: http://localhost:8000
# API Key: public-anon-key
# Collection: tasks
#
# === P0: Auth and Gateway Security ===
# ...
# === Test Summary ===
# Passed: 22
# Failed: 0
# Pass Rate: 100% (22/22)
#
# ✓ All tests passed!
```

### Step 5: Manual Testing (Optional)

If you want to test individual endpoints manually:

```bash
# Test 1: Health check
curl -X GET http://localhost:8000/mongo/v1/health \
  -H "apikey: $ANON_KEY"

# Test 2: Signup user
curl -X POST http://localhost:8000/auth/v1/signup \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@1234567890"
  }' | jq .

# Test 3: Login and get JWT
JWT=$(curl -s -X POST http://localhost:8000/auth/v1/token?grant_type=password \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@1234567890"
  }' | jq -r '.data.session.access_token')

echo "JWT: $JWT"

# Test 4: Create document in Mongo
curl -X POST http://localhost:8000/mongo/v1/collections/tasks/documents \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "document": {
      "title": "My First Task",
      "status": "todo"
    }
  }' | jq .

# Test 5: List documents
curl -X GET http://localhost:8000/mongo/v1/collections/tasks/documents \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" | jq .
```

## Test Suite Coverage

The `phase15-mongo-mvp-test.sh` script validates:

### P0 Tests (Critical for MVP)
- ✅ **Auth & Gateway Security** (3 tests)
  - Missing apikey rejection
  - Invalid apikey rejection
  - Valid apikey acceptance

- ✅ **User Setup** (4 tests)
  - Signup user A
  - Login user A (JWT obtention)
  - Signup user B
  - Login user B (JWT obtention)

- ✅ **CRUD Operations** (5 tests)
  - CREATE: POST /collections/:name/documents
  - READ (list): GET /collections/:name/documents
  - READ (single): GET /collections/:name/documents/:id
  - UPDATE: PATCH /collections/:name/documents/:id
  - DELETE: DELETE /collections/:name/documents/:id

- ✅ **User Isolation** (4 tests)
  - User B cannot GET user A's documents
  - User B cannot PATCH user A's documents
  - User B cannot DELETE user A's documents
  - User B's list excludes user A's documents

### P1 Tests (Validation & Error Handling)
- ✅ **Input Validation** (6 tests)
  - Invalid collection names (path traversal)
  - Oversized payloads (> 256 KB)
  - Malformed JSON
  - Missing Authorization header
  - Forbidden fields (owner_id override)
  - Document deletion verification

## Troubleshooting

### Docker Services Won't Start
```bash
# Check logs
docker-compose logs mongo-api
docker-compose logs kong

# Verify MongoDB connectivity from mongo-api container
docker-compose exec mongo-api node -e "
  const { MongoClient } = require('mongodb');
  new MongoClient('mongodb://mongo:27017').connect()
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Failed:', err.message))
"
```

### Test Script Fails at Auth
```bash
# Ensure JWT_SECRET is set and exported
env | grep JWT_SECRET

# Check GoTrue is healthy
docker-compose logs gotrue | tail -20

# Verify Kong route is registered
docker-compose exec kong kong routes list
```

### MongoDB CRUD Endpoints Not Responding
```bash
# Check if mongo-api service is running
docker-compose ps mongo-api

# Check service logs
docker-compose logs mongo-api

# Verify Kong route points to correct service
docker-compose exec kong kong routes
```

### User Isolation Tests Fail
```bash
# Manually verify RLS is working
docker-compose exec mongo mongosh --eval "
  use mini_baas;
  db.tasks.find().pretty();
"

# Check if documents have owner_id field
docker-compose exec mongo mongosh --eval "
  use mini_baas;
  db.tasks.findOne({ owner_id: { \$exists: true } });
"
```

## Next Steps After Testing

If all tests pass ✅:
1. **Integrate test into CI** — Add to Makefile runner
2. **Next day (April 2)** — Write end-to-end demo script
3. **Thursday (April 3)** — Documentation & demo presentation
4. **Friday (April 4)** — Final acceptance testing

## Files Modified Today

- ✅ [scripts/db-bootstrap.sql](../scripts/db-bootstrap.sql) — Added `projects` table, fixed RLS policies
- ✅ [docs/MVP-Schema-Specification.md](../docs/MVP-Schema-Specification.md) — Spec validation doc
- ✅ [docs/Mongo-Service-Validation.md](../docs/Mongo-Service-Validation.md) — Service audit report
- ✅ [scripts/phase15-mongo-mvp-test.sh](../scripts/phase15-mongo-mvp-test.sh) — Integration test suite

## Expected Timeline

| Step | Time | Action |
|------|------|--------|
| Step 1 | 2 min | Generate .env |
| Step 2 | 3 min | docker-compose up |
| Step 3 | 1 min | Extract API key |
| Step 4 | 5 min | Run full test suite |
| **Total** | **~11 min** | Complete test run |

---

**Ready to execute? Run:**
```bash
bash scripts/phase15-mongo-mvp-test.sh
```
