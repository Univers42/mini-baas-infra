# Kubernetes Infrastructure Service Access Issues - Diagnostic Report

## Summary
The new infrastructure has **broken service DNS resolution** due to how `namePrefix` interacts with hardcoded environment variable values. The older infrastructure likely didn't use `namePrefix` or handled it differently.

---

## Issue #1: Service DNS Resolution Broken by namePrefix

### Root Cause
When `namePrefix: local-` is applied in the local overlay kustomization:
- **Services are renamed**: `postgres` → `local-postgres`, `mongo` → `local-mongo`, etc.
- **Environment variables NOT updated**: Deployments still reference bare names like `postgres` and `mongo`

### Evidence
**Base deployment** - auth-service uses bare DNS name:
```yaml
DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/postgres"
```

**Applied patch** in db-hosts-patch.yaml tries to fix it:
```yaml
DATABASE_URL: "postgresql://postgres:postgres@local-postgres:5432/postgres"
```

**BUT the patch only covers**:
- ✅ auth-service
- ✅ dynamic-api  
- ✅ schema-service
- ❌ Any other inter-service communication DNS

### Impact
- **auth-service cannot connect to postgres** (tries `postgres:5432` instead of `local-postgres:5432`)
- **dynamic-api cannot connect** to either database (tries bare names)
- **schema-service cannot connect to mongo** (tries `mongo:27017` instead of `local-mongo:27017`)

---

## Issue #2: Kong Configuration References Non-Existent Services

### Current Kong Routes
The [kong/kong.yml](./deployments/base/kong/kong.yml) configures routing to:
- `http://gotrue:9999` — Auth service (not deployed)
- `http://postgrest:3000` — SQL REST API (not deployed)
- `http://realtime:4000` — Real-time subscriptions (not deployed)
- `http://trino:8080` — SQL federation (not deployed)
- `http://studio:3000` — Data studio (not deployed)

### Current Deployments
The base kustomization actually only deploys:
- postgres
- mongo
- api-gateway
- auth-service
- dynamic-api
- schema-service

### Impact
Kong cannot route traffic because it's trying to connect to undefined services.

---

## Issue #3: Service Type Conversion Side Effects

The local overlay `api-gateway-service-nodeport.yaml` converts all services to `NodePort` type:
```yaml
type: NodePort  # Was: ClusterIP
```

While this makes services externally accessible, it also affects in-cluster service discovery since the patch replaces the entire Service definition.

---

## Issue #4: Missing Inter-Service Communication

The current setup doesn't clearly define how services communicate:
- Does `api-gateway` need to call `auth-service` or `dynamic-api`?
- Should they use DNS names like `auth-service:8000` or `local-auth-service:8000`?
- Are there environment variables missing to specify upstream service endpoints?

---

## Why the Old Infrastructure Worked

Likely reasons the older setup didn't have these issues:
1. **No namePrefix used** — Services kept their original names matching environment variables
2. **Explicit service DNS configuration** — Services explicitly configured what to call each other
3. **Simpler topology** — Fewer cross-service dependencies
4. **Different overlay configuration** — May have used different patching strategy

---

## Solutions Required

### Solution 1: Stop Using namePrefix (Simplest)
Remove `namePrefix: local-` from overlays/local/kustomization.yaml
- Pro: No patching needed, services match their DNS names
- Con: Can't easily distinguish resources between environments

### Solution 2: Fix All Service References
Apply complete patching for **ALL** environment variables that reference other services:
- For each service with env vars referencing other services, add patches
- Use strategic merge patches or kustomize patchesJson6902

### Solution 3: Use Service Discovery Pattern
- Remove hardcoded DNS names from environment variables
- Use Kubernetes service discovery (e.g., headless services, service mesh)

### Solution 4: Separate Base and Environment-Specific Deployments
- Base uses fully qualified names: `postgres.default.svc.cluster.local`
- Overlays can modify based on environment without namePrefix confusion

---

## Recommended Quick Fix

**Option A: Remove namePrefix (Fastest)**
```yaml
# deployments/overlays/local/kustomization.yaml
# Delete or comment out:
# namePrefix: local-
```

**Option B: Add Comprehensive Patching (Proper Solution)**
```yaml
# deployments/overlays/local/kustomization.yaml
patchesJson6902:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: api-gateway
    patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/env
        value:
          - name: UPSTREAM_AUTH_SERVICE
            value: "local-auth-service:8000"
          - name: UPSTREAM_DYNAMIC_API
            value: "local-dynamic-api:8080"
  # ... repeat for all services with inter-service dependencies
```

---

## Next Steps
1. Run: `kubectl get svc -o wide` to see actual service names
2. Run: `kubectl logs deployment/auth-service` to see DNS resolution errors
3. Identify which service needs to call which others
4. Apply appropriate fix (recommend Option A for quick debugging)

