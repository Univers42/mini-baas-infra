# Quick Reference: Docker Build Commands

## Building Images

### Build a single service
```bash
docker compose build api-gateway
```

### Build all services (from docker-compose.build.yml)
```bash
docker compose -f docker-compose.build.yml build
```

### Build without using cache (clean build)
```bash
docker compose build --no-cache api-gateway
```

### Build with build arguments
```bash
docker build --build-arg NODE_VERSION=22-alpine -t api-gateway:latest deployments/base/api-gateway/
```

## Inspecting Images

### View image size and layers
```bash
docker history api-gateway:latest
docker images api-gateway
docker inspect api-gateway:latest
```

### Test image locally
```bash
docker run -it api-gateway:latest
docker run -p 3000:3000 api-gateway:latest
```

## Optimization Commands

### View Docker disk usage
```bash
docker system df      # See disk usage by images, containers, volumes
docker image prune    # Remove unused images
docker system prune   # Remove all unused data
```

### Build for multiple platforms
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t api-gateway:latest \
  deployments/base/api-gateway/
```

## Docker Compose Commands

### Using docker-compose.build.yml for local development
```bash
# Start services with local builds
docker compose -f docker-compose.build.yml up -d

# Rebuild on code changes
docker compose -f docker-compose.build.yml up -d --build

# View logs
docker compose -f docker-compose.build.yml logs -f api-gateway

# Stop services
docker compose -f docker-compose.build.yml down
```

### Switch between compose files
```bash
# Use prebuilt images (default)
docker compose up -d

# Use local builds
docker compose -f docker-compose.build.yml up -d
```

## CI/CD Integration

### GitHub Actions example
```yaml
- name: Build and push Docker images
  run: |
    docker build -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} deployments/base/api-gateway/
    docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
```

### GitLab CI example
```yaml
build_api_gateway:
  stage: build
  script:
    - docker build -t $CI_REGISTRY_IMAGE/api-gateway:$CI_COMMIT_SHA deployments/base/api-gateway/
    - docker push $CI_REGISTRY_IMAGE/api-gateway:$CI_COMMIT_SHA
```

## Troubleshooting

### See what's in the context
```bash
# Lists all files that would be included in build
find deployments/base/api-gateway/ -type f
```

### Debug builds
```bash
# See each layer being built
docker build --progress=plain deployments/base/api-gateway/

# Keep build container for inspection
docker build --keep-state deployments/base/api-gateway/
```

### Check .dockerignore is working
```bash
docker buildx build \
  --progress=plain \
  --no-cache \
  deployments/base/api-gateway/
```

Look for "Sending build context" message - should be much smaller with .dockerignore
