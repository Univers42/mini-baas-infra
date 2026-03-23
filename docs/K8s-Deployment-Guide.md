# Kubernetes Deployment Guide

This guide explains how to deploy the mini-baas infrastructure services to Kubernetes using Docker images and Kubernetes manifests converted from the compose stack.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Deployment Architecture](#deployment-architecture)
3. [Local Setup](#local-setup)
4. [Building Custom Images](#building-custom-images)
5. [Deploying to Kubernetes](#deploying-to-kubernetes)
6. [Accessing Services](#accessing-services)
7. [Troubleshooting](#troubleshooting)
8. [Cleanup](#cleanup)

## Prerequisites

Ensure you have the following tools installed and configured:

- **Docker**: For building container images
  ```bash
  docker --version  # Should be 20.10+
  ```

- **Kubernetes Cluster**: Either minikube (local development) or a real cluster
  ```bash
  # For minikube:
  minikube version      # Should be 1.25+
  minikube start        # Start the cluster if not running
  ```

- **kubectl**: Kubernetes command-line tool
  ```bash
  kubectl version --client
  kubectl cluster-info
  ```

- **Kompose**: Convert Docker Compose files to Kubernetes manifests
  ```bash
  kompose version       # Should be 1.35.0+
  # If not installed, download from:
  # https://github.com/kubernetes/kompose/releases
  ```

- **Makefile utilities**: The project uses Make for automation
  ```bash
  make --version
  ```

## Deployment Architecture

### Service Components

The infrastructure consists of **13 services** across two categories:

#### Custom-Built Services (4)
These are built from source code in this repository:

- **api-gateway** (Node.js): REST API gateway, port 3000
- **auth-service** (Python): Authentication & user management, port 8001
- **dynamic-api** (Go): Dynamic table API, port 8002
- **schema-service** (Node.js): Database schema management, port 3001

#### Pre-built Infrastructure Services (9)
These are pulled from public registries:

- **postgres**: PostgreSQL database, port 5432 (data persistent via PVC)
- **redis**: Redis cache, port 6379 (data persistent via PVC)
- **minio**: S3-compatible object storage, ports 9000/9001 (data persistent via PVC)
- **gotrue**: User authentication service, port 9999
- **postgrest**: Auto-generated REST API, port 3002
- **realtime**: WebSocket real-time subscriptions, port 4000
- **supavisor**: Connection pooler, port 6543
- **studio**: Web management UI, port 3001
- **trino**: SQL query engine, port 8080

### Kubernetes Resources

For each service, Kompose creates:
- **Deployment**: Pod lifecycle and image management
- **Service**: Internal DNS and network exposure
- **PersistentVolumeClaim** (for stateful services): Data persistence

### Environment-Specific Overlays

The deployment uses **kustomize overlays** for environment-specific configurations:

- **base/**: Common manifests for all environments
- **overlays/local/**: Local development patches (minikube-specific)
  - Adds `local-` namePrefix to resources
  - Exposes api-gateway as NodePort (port 30080)
- **overlays/staging/**: Staging environment configuration
- **overlays/production/**: Production environment configuration

## Local Setup

### Step 1: Start the Kubernetes Cluster

For local development with minikube:

```bash
# Start minikube with sufficient resources
minikube start --cpus=4 --memory=8192 --disk-size=30g

# Verify the cluster is running
kubectl cluster-info
kubectl get nodes

# Get the minikube IP (needed for external access)
minikube ip  # e.g., 192.168.49.2
```

### Step 2: Generate Environment Variables

Create a `.env` file with secure secrets and service credentials:

```bash
# Generate .env with all required variables
./scripts/generate-env.sh

# To force regenerate (overwrite existing):
FORCE=1 ./scripts/generate-env.sh

# Verify .env was created
ls -la .env
```

The generated `.env` includes:
- Supabase API keys (JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY)
- Database credentials (POSTGRES_PASSWORD, POSTGRES_DB)
- Infrastructure secrets (VAULT_ENC_KEY, SECRET_KEY_BASE)
- Service configuration variables

**⚠️ Important**: The `.env` file contains secrets and should:
- Never be committed to version control
- Be kept secure on your machine
- Be regenerated for each environment (dev/staging/production)

## Building Custom Images

### Build All Custom Service Images

```bash
# Build all 4 custom service images with tag 'latest'
make docker-build IMAGE_TAG=latest

# Or build without cache (useful for clean rebuilds)
make docker-build-no-cache IMAGE_TAG=latest

# View built images
docker images | grep mini-baas
```

### Build Individual Services

```bash
# Build specific service (example: api-gateway)
docker build -t mini-baas/api-gateway:latest ./deployments/base/api-gateway
```

### Image Details

Each custom service uses a multi-stage Dockerfile for optimization:

- **Build stage**: Uses full runtime (Node.js/Python/Go)
- **Final stage**: Uses minimal distroless base image (security best practice)

See the respective `Dockerfile` in each service directory:
- `deployments/base/api-gateway/Dockerfile`
- `deployments/base/auth-service/Dockerfile`
- `deployments/base/dynamic-api/Dockerfile`
- `deployments/base/schema-service/Dockerfile`

## Deploying to Kubernetes

### Step 1: Load Custom Images into Minikube

After building images locally, make them available to the minikube cluster:

```bash
# Load all 4 custom images into minikube's Docker daemon
minikube image load \
  mini-baas/api-gateway:latest \
  mini-baas/auth-service:latest \
  mini-baas/dynamic-api:latest \
  mini-baas/schema-service:latest

# Verify images are loaded in minikube
minikube image ls | grep mini-baas
```

### Step 2: Convert Compose to Kubernetes Manifests

Use Kompose to convert `docker-compose.build.yml` to Kubernetes manifests:

```bash
# Create output directory
mkdir -p /tmp/mini-baas-kompose

# Run kompose conversion
kompose convert -f docker-compose.build.yml -o /tmp/mini-baas-kompose

# View generated manifest files
ls -la /tmp/mini-baas-kompose/
```

This produces:
- 13 Deployment manifests (one per service)
- 13 Service manifests (one per service)
- 3 PersistentVolumeClaim manifests (postgres, redis, minio)

### Step 3: Deploy to Kubernetes

Apply the generated manifests to your cluster:

```bash
# Apply all manifests to default namespace
kubectl apply -f /tmp/mini-baas-kompose

# Watch deployment progress
kubectl get deploy -w

# Verify all resources were created
kubectl get deploy,svc,pvc
```

### Step 4: Patch Custom Service ImagePullPolicy

By default, Kompose sets `imagePullPolicy: Always`, which fails for local images. Patch the 4 custom deployments to use local images:

```bash
# Patch imagePullPolicy for custom services
kubectl patch deployment api-gateway \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"api-gateway","imagePullPolicy":"IfNotPresent"}]}}}}'

kubectl patch deployment auth-service \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"auth-service","imagePullPolicy":"IfNotPresent"}]}}}}'

kubectl patch deployment dynamic-api \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"dynamic-api","imagePullPolicy":"IfNotPresent"}]}}}}'

kubectl patch deployment schema-service \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"schema-service","imagePullPolicy":"IfNotPresent"}]}}}}'

# Wait for deployments to stabilize
kubectl rollout status deploy/api-gateway --timeout=180s
kubectl rollout status deploy/auth-service --timeout=180s
kubectl rollout status deploy/dynamic-api --timeout=180s
kubectl rollout status deploy/schema-service --timeout=180s
```

### Step 5: Initialize Database Schemas

Some services require pre-existing database schemas. Create them:

```bash
# Create 'auth' schema for Gotrue (authentication service)
kubectl exec deploy/postgres -- \
  sh -lc "psql -U postgres -d postgres -c 'CREATE SCHEMA IF NOT EXISTS auth;'"

# Verify schema was created
kubectl exec deploy/postgres -- \
  sh -lc "psql -U postgres -d postgres -c '\dn'"
```

### Step 6: Configure Realtime Service

The Realtime service requires a strong SECRET_KEY_BASE (minimum 64 bytes):

```bash
# Generate a secure 64+ byte secret
REALTIME_SECRET=$(openssl rand -base64 48 | tr -d '\n')

# Set environment variable on realtime deployment
kubectl set env deployment/realtime SECRET_KEY_BASE="$REALTIME_SECRET"

# Force restart to apply configuration
kubectl rollout restart deploy/realtime
kubectl rollout status deploy/realtime --timeout=180s
```

### Step 7: Apply Local Overlay (Optional for Local Deployment)

If deploying to local overlay for NodePort exposure:

```bash
# Remove old deployments if re-deploying
kubectl delete deploy,svc,pvc --all

# Apply manifests with local overlay
kubectl apply -k deployments/overlays/local

# Verify deployment
kubectl get deploy,svc,pvc
```

## Accessing Services

### Check Service Status

```bash
# View all deployments and readiness status
kubectl get deployments

# View running pods
kubectl get pods

# View services and their exposed ports
kubectl get services
```

### Internal Access (From Within Cluster)

Services are accessible using Kubernetes DNS from within the cluster:

```bash
# Example: curl from inside the cluster
kubectl run curltest --rm -i --image=curlimages/curl:8.10.1 -- \
  curl http://api-gateway:3000/health
```

### Local Access via Port Forward

Forward a service port to your local machine:

```bash
# Forward api-gateway to local port 3000
kubectl port-forward svc/api-gateway 3000:3000

# In another terminal, access the service:
curl http://localhost:3000/health
```

Or use the Makefile for convenience:

```bash
# Forward using Makefile (requires ENVIRONMENT and SERVICE_NAME)
make k8s-port-forward ENVIRONMENT=local SERVICE_NAME=api-gateway

# Then access:
curl http://localhost:3000/health
```

### External Access via NodePort (Minikube Only)

The local overlay exposes api-gateway as a NodePort service:

```bash
# Get the minikube IP
MINIKUBE_IP=$(minikube ip)

# Access api-gateway externally
curl http://$MINIKUBE_IP:30080/health

# View all NodePort services
kubectl get svc -o wide | grep NodePort
```

### View Service Logs

```bash
# View logs from a specific deployment
kubectl logs deploy/api-gateway --tail=100 -f

# View logs from a specific pod
kubectl logs <pod-name>

# View logs from all containers in realtime
kubectl logs deploy/realtime -f --all-containers=true
```

## Troubleshooting

### Issue: ErrImagePull on Custom Services

**Symptom**: Pods for api-gateway, auth-service, dynamic-api, schema-service stuck in `ImagePullBackOff`

**Cause**: Docker registry lookup fails because images are only available locally, not in a registry

**Solution**:
1. Ensure images are built: `make docker-build IMAGE_TAG=latest`
2. Load into minikube: `minikube image load mini-baas/*:latest`
3. Patch imagePullPolicy (see Step 4 in Deployment section)

### Issue: Gotrue Pod Crashing with Schema Error

**Symptom**: Gotrue pod in `CrashLoopBackOff` with error: "schema \"auth\" does not exist"

**Cause**: Gotrue migrations require a pre-existing `auth` schema in postgres

**Solution**:
```bash
# Create the auth schema
kubectl exec deploy/postgres -- \
  sh -lc "psql -U postgres -d postgres -c 'CREATE SCHEMA IF NOT EXISTS auth;'"

# Restart gotrue
kubectl rollout restart deploy/gotrue
```

### Issue: Realtime Pod Crashing with SECRET_KEY_BASE Error

**Symptom**: Realtime pod in `CrashLoopBackOff` with error: "cookie store expects conn.secret_key_base to be at least 64 bytes"

**Cause**: The SECRET_KEY_BASE environment variable is either missing or less than 64 bytes

**Solution**:
```bash
# Generate a valid 64+ byte secret
REALTIME_SECRET=$(openssl rand -base64 48 | tr -d '\n')

# Set it on the deployment
kubectl set env deployment/realtime SECRET_KEY_BASE="$REALTIME_SECRET"

# Restart
kubectl rollout restart deploy/realtime
```

### Issue: Services Can't Communicate

**Symptom**: One service tries to connect to another internally and fails

**Causes**:
- Services are in different namespaces
- Service DNS name is incorrect (should be `<service-name>`)
- Network policy is blocking traffic
- Service isn't fully ready yet

**Debug**:
```bash
# Check if service is accessible from inside the cluster
kubectl run debug-pod --rm -i --image=alpine -- \
  sh -c "wget -O- http://postgres:5432"

# Check service endpoints
kubectl get endpoints

# Check DNS resolution
kubectl run debug-dns --rm -i --image=alpine -- \
  nslookup api-gateway
```

### Issue: Pod Starts and Crashes Immediately

**Symptom**: Pod appears briefly in `Running` state, then moves to `Failed` or `CrashLoopBackOff`

**Debug Steps**:
```bash
# Get previous logs (from the crashed container)
kubectl logs <pod-name> --previous

# Get pod events
kubectl describe pod <pod-name>

# Check pod status in detail
kubectl get pod <pod-name> -o yaml
```

### Issue: Persisted Data Lost After Pod Restart

**Symptom**: Database looks empty after pod restart

**Cause**: PersistentVolumeClaim not properly bound or volume is being recreated

**Debug**:
```bash
# Check PVC status
kubectl get pvc

# Check if PV is bound
kubectl get pv

# For postgres recovery
kubectl exec deploy/postgres -- \
  sh -lc "psql -U postgres -d postgres -l"
```

## Cleanup

### Remove All Deployments

```bash
# Delete all deployments, services, and PVCs
kubectl delete deploy,svc,pvc --all

# For a specific deployment:
kubectl delete deployment <deployment-name>
```

### Stop the Kubernetes Cluster

```bash
# Stop minikube (preserves state)
minikube stop

# Delete the cluster entirely (clears all data)
minikube delete
```

### Clear Docker Images

```bash
# Remove all mini-baas images from local Docker
docker rmi $(docker images -q 'mini-baas/*')

# Remove from minikube
minikube image rm mini-baas/api-gateway:latest
minikube image rm mini-baas/auth-service:latest
minikube image rm mini-baas/dynamic-api:latest
minikube image rm mini-baas/schema-service:latest
```

## Quick Reference: One-Command Deployment

For a complete fresh deployment to local minikube:

```bash
# 1. Start cluster
minikube start --cpus=4 --memory=8192 --disk-size=30g

# 2. Generate env
./scripts/generate-env.sh

# 3. Build images
make docker-build IMAGE_TAG=latest

# 4. Load into minikube
minikube image load mini-baas/{api-gateway,auth-service,dynamic-api,schema-service}:latest

# 5. Convert compose to K8s manifests
mkdir -p /tmp/mini-baas-kompose && \
kompose convert -f docker-compose.build.yml -o /tmp/mini-baas-kompose

# 6. Deploy manifests
kubectl apply -f /tmp/mini-baas-kompose

# 7. Patch imagePullPolicy and initialize
kubectl patch deployment api-gateway -p '{"spec":{"template":{"spec":{"containers":[{"name":"api-gateway","imagePullPolicy":"IfNotPresent"}]}}}}'
kubectl patch deployment auth-service -p '{"spec":{"template":{"spec":{"containers":[{"name":"auth-service","imagePullPolicy":"IfNotPresent"}]}}}}'
kubectl patch deployment dynamic-api -p '{"spec":{"template":{"spec":{"containers":[{"name":"dynamic-api","imagePullPolicy":"IfNotPresent"}]}}}}'
kubectl patch deployment schema-service -p '{"spec":{"template":{"spec":{"containers":[{"name":"schema-service","imagePullPolicy":"IfNotPresent"}]}}}}'

# 8. Create auth schema
kubectl exec deploy/postgres -- \
  sh -lc "psql -U postgres -d postgres -c 'CREATE SCHEMA IF NOT EXISTS auth;'"

# 9. Configure realtime
REALTIME_SECRET=$(openssl rand -base64 48 | tr -d '\n') && \
kubectl set env deployment/realtime SECRET_KEY_BASE="$REALTIME_SECRET"

# 10. Wait for stabilization
kubectl rollout status deploy/api-gateway
kubectl rollout status deploy/auth-service
kubectl rollout status deploy/dynamic-api
kubectl rollout status deploy/schema-service
kubectl rollout status deploy/gotrue
kubectl rollout status deploy/realtime

# 11. Verify access
MINIKUBE_IP=$(minikube ip)
curl http://$MINIKUBE_IP:30080/health
```

## Additional Resources

- [Kubernetes Official Docs](https://kubernetes.io/docs/)
- [Kompose Documentation](https://kompose.io/)
- [Kustomize Documentation](https://kustomize.io/)
- [Minikube Documentation](https://minikube.sigs.k8s.io/)
- [Docker Compose to Kubernetes Migration](https://kubernetes.io/docs/tasks/configure-pod-container/translate-compose-kubernetes/)
