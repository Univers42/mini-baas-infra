# Kubernetes Management Guide

This guide explains how to use the Makefile targets to manage Docker images and Kubernetes deployments.

## Quick Start

### 1. Build Docker Images Locally

```bash
# Build all service images
make docker-build

# Build without cache
make docker-build-no-cache

# Build a specific service
make docker-build-api-gateway
```

### 2. Deploy to Kubernetes (Local Development)

```bash
# Build images, load them into minikube, and deploy
make k8s-deploy

# Or deploy to a specific environment
ENVIRONMENT=local make k8s-deploy
ENVIRONMENT=staging make k8s-deploy
ENVIRONMENT=production make k8s-deploy
```

For local Minikube workflows, you can also run the image load step explicitly:

```bash
# Build and load mini-baas images into the minikube node runtime
make k8s-load-local-images
```

### 3. Monitor Deployments

```bash
# Check deployment status
make k8s-status

# View logs from api-gateway
SERVICE=api-gateway make k8s-logs

# Describe deployment details
SERVICE=api-gateway make k8s-describe

# Show recent events
make k8s-events
```

### 4. Port Forward for Local Testing

```bash
# Forward api-gateway to localhost:3000
SERVICE=api-gateway PORT=3000 make k8s-port-forward

# Forward auth-service to localhost:8000
SERVICE=auth-service PORT=8000 make k8s-port-forward

# Forward dynamic-api to localhost:8080
SERVICE=dynamic-api PORT=8080 make k8s-port-forward

# Forward schema-service to localhost:3001
SERVICE=schema-service PORT=3001 make k8s-port-forward
```

## Docker Image Management

### Build Images

```bash
# Build all images
make docker-build

# Build specific image
make docker-build-api-gateway
make docker-build-auth-service
make docker-build-dynamic-api
make docker-build-schema-service
```

### Tag and Push to Registry

```bash
# Tag all images for your registry
REGISTRY=registry.example.com make docker-tag

# Push to registry
REGISTRY=registry.example.com make docker-push

# Or combine both steps
REGISTRY=registry.example.com IMAGE_TAG=v1.0.0 make build-and-push
```

### View Images

```bash
# List built images
make docker-images

# Remove all images
make docker-clean
```

## Kubernetes Deployment Management

### Preview Manifests

```bash
# Preview manifests without deploying
make k8s-preview

# Preview specific environment
ENVIRONMENT=staging make k8s-preview
```

### Apply/Deploy Manifests

```bash
# Apply manifests to cluster
make k8s-apply

# Apply to specific environment
ENVIRONMENT=production make k8s-apply
```

### Update Running Deployments

```bash
# Update image tag in running deployment
IMAGE_TAG=v1.0.1 REGISTRY=registry.example.com make k8s-update-images
```

### Scale Deployments

```bash
# Scale api-gateway to 3 replicas
SERVICE=api-gateway REPLICAS=3 make k8s-scale

# Scale all services
SERVICE=api-gateway REPLICAS=2 make k8s-scale
SERVICE=auth-service REPLICAS=2 make k8s-scale
SERVICE=dynamic-api REPLICAS=2 make k8s-scale
SERVICE=schema-service REPLICAS=2 make k8s-scale
```

### Monitor and Troubleshoot

```bash
# View deployment status
make k8s-status

# View logs
SERVICE=api-gateway make k8s-logs

# Follow logs in real-time (already enabled by default)
SERVICE=api-gateway make k8s-logs

# Describe deployment
SERVICE=api-gateway make k8s-describe

# Restart deployment
SERVICE=api-gateway make k8s-restart

# Rollback last deployment
SERVICE=api-gateway make k8s-rollback

# View recent events
make k8s-events
```

### Delete Deployments

```bash
# Delete all mini-baas deployments
make k8s-delete

# Delete specific namespace
NAMESPACE=mini-baas-production make k8s-delete
```

## Environment-Specific Deployments

### Local Development

```bash
# Deploy to local (default)
make k8s-deploy

# Or explicitly
ENVIRONMENT=local NAMESPACE=default make k8s-deploy
```

### Staging Environment

```bash
# Deploy to staging with staging tag
ENVIRONMENT=staging REGISTRY=registry.example.com IMAGE_TAG=staging-latest make deploy-staging
```

### Production Environment

```bash
# Deploy to production with production tag
ENVIRONMENT=production REGISTRY=registry.example.com IMAGE_TAG=v1.0.0 make deploy-production
```

## Configuration Variables

All Make targets support these variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `REGISTRY` | `localhost:5000` | Docker registry URL |
| `IMAGE_TAG` | `latest` | Image tag (version) |
| `ENVIRONMENT` | `local` | Deployment environment (local/staging/production) |
| `NAMESPACE` | `default` | Kubernetes namespace |
| `SERVICE` | - | Service name (api-gateway, auth-service, etc.) |
| `REPLICAS` | - | Number of replicas for scaling |
| `PORT` | - | Port for port-forwarding |

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Build and push images
  run: |
    REGISTRY=${{ env.REGISTRY }} \
    IMAGE_TAG=${{ github.sha }} \
    make build-and-push

- name: Deploy to production
  run: |
    ENVIRONMENT=production \
    REGISTRY=${{ env.REGISTRY }} \
    IMAGE_TAG=${{ github.sha }} \
    make deploy-production
```

### GitLab CI Example

```yaml
build_and_push:
  stage: build
  script:
    - REGISTRY=$CI_REGISTRY IMAGE_TAG=$CI_COMMIT_SHA make build-and-push

deploy_production:
  stage: deploy
  script:
    - ENVIRONMENT=production REGISTRY=$CI_REGISTRY IMAGE_TAG=$CI_COMMIT_SHA make deploy-production
```

## Complete Workflow Example

### Local Development

```bash
# 1. Build images locally
make docker-build

# 2. Load images into minikube
make k8s-load-local-images

# 3. Deploy to local Kubernetes
make k8s-deploy

# 4. Check status
make k8s-status

# 5. Port forward to test
SERVICE=api-gateway PORT=3000 make k8s-port-forward
# In another terminal, test: curl http://localhost:3000/health

# 6. View logs
SERVICE=api-gateway make k8s-logs

# 7. When done, delete
make k8s-delete
```

## Minikube Image Pull Troubleshooting

If pods are stuck in `ImagePullBackOff` for `mini-baas/*` images, Kubernetes is not finding those images in the Minikube node runtime.

Use this sequence:

```bash
make docker-build
make k8s-load-local-images
make k8s-deploy
```

To verify images are present in Minikube:

```bash
minikube image ls | grep mini-baas
```

### Push to Registry and Deploy to Staging

```bash
# 1. Build images
make docker-build

# 2. Push to registry
REGISTRY=registry.example.com IMAGE_TAG=staging-v1.0.0 make docker-push

# 3. Deploy to staging
ENVIRONMENT=staging REGISTRY=registry.example.com IMAGE_TAG=staging-v1.0.0 make k8s-apply

# 4. Monitor
make k8s-status
```

### Production Deployment

```bash
# 1. Build images
make docker-build

# 2. Tag and push to registry
REGISTRY=registry.example.com IMAGE_TAG=v1.0.0 make docker-push

# 3. Deploy to production
ENVIRONMENT=production REGISTRY=registry.example.com IMAGE_TAG=v1.0.0 make deploy-production

# 4. Verify
ENVIRONMENT=production make k8s-status

# 5. If issues arise, rollback
ENVIRONMENT=production SERVICE=api-gateway make k8s-rollback
```

## Directories Structure

- `deployments/base/` - Base Kubernetes manifests for each service
  - `*/deployment.yaml` - Kubernetes Deployment and Service definitions
  - `kustomization.yaml` - Base kustomization file
- `deployments/overlays/` - Environment-specific overlays
  - `local/kustomization.yaml` - Local development patches
  - `staging/kustomization.yaml` - Staging environment patches
  - `production/kustomization.yaml` - Production environment patches
- `Makefile` - Make targets for building and deploying

## Prerequisites

- Docker and Docker Compose (for building images)
- kubectl (for Kubernetes operations)
- kustomize (for manifest management)
- A running Kubernetes cluster

Install kubectl:
```bash
# MacOS
brew install kubectl

# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
```

Install kustomize:
```bash
# MacOS
brew install kustomize

# Linux - see https://kubernetes-sigs.github.io/kustomize/installation/
```

## Troubleshooting

### "kubectl not found"
Install kubectl: `brew install kubectl` or follow [official docs](https://kubernetes.io/docs/tasks/tools/)

### "kustomize not found"
Install kustomize: `brew install kustomize` or follow [official docs](https://kubernetes-sigs.github.io/kustomize/installation/)

### Deployment stuck in pending state
```bash
# Check pod events
kubectl describe pod <pod-name> -n default

# Check node resources
kubectl top nodes

# Check resource requests vs available resources
make k8s-describe SERVICE=api-gateway
```

### Images not updating
```bash
# Force pull latest image
kubectl rollout restart deployment/api-gateway -n default

# Or delete and recreate
make k8s-delete
make k8s-deploy
```

## See Also

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Kustomize Documentation](https://kubernetes-sigs.github.io/kustomize/)
- [Docker Documentation](https://docs.docker.com/)
