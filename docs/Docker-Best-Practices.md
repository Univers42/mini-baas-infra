# Docker Image Building Best Practices

This document describes the improvements made to Docker image building in the mini-baas-infra project.

## Overview of Improvements

This project now implements industry best practices for Docker image building:
- ✅ **Multistage builds** - Separate build and runtime stages
- ✅ **Alpine Linux images** - Minimal base images for smaller containers
- ✅ **.dockerignore files** - Exclude unnecessary files from build context
- ✅ **Security hardening** - Non-root users, minimal attack surface
- ✅ **Health checks** - Container health verification
- ✅ **Layer caching** - Optimized build layer ordering

## File Structure

```
deployments/base/
├── api-gateway/
│   ├── .dockerignore      # Excludes unnecessary files
│   └── Dockerfile         # Multistage Node.js example
├── auth-service/
│   ├── .dockerignore      # Excludes unnecessary files
│   └── Dockerfile         # Multistage Python example
├── dynamic-api/
│   ├── .dockerignore      # Excludes unnecessary files
│   └── Dockerfile         # Multistage Go example
└── schema-service/
    ├── .dockerignore      # Excludes unnecessary files
    └── Dockerfile         # Multistage Node.js/TypeScript example
```

## Key Improvements

### 1. Multistage Builds

Multistage builds use multiple `FROM` statements to separate build time from runtime.

**Benefits:**
- Final image contains only what's needed to run, not build tools
- Significant reduction in image size (up to 90% smaller)
- No build artifacts or compilation cache in production

**Example Pattern:**
```dockerfile
# Stage 1: Builder (includes compile tools)
FROM node:22-alpine AS builder
RUN npm install  # Installs dev dependencies
RUN npm run build

# Stage 2: Runtime (minimal - only for execution)
FROM node:22-alpine
COPY --from=builder /app/dist /app/dist
CMD ["node", "dist/index.js"]
```

**Size Comparison:**
- Single-stage Node.js build: ~500MB
- Multistage Node.js build: ~150MB (70% reduction)
- Go with distroless: ~15MB

### 2. Alpine Linux Images

Alpine Linux is a minimal Linux distribution (5-10MB base).

**Benefits:**
- Minimal base image size
- Reduced attack surface
- Smaller bandwidth usage for distribution
- Faster container startup

**Available Alpine Tags:**
- `node:22-alpine` - Node.js 22 on Alpine
- `python:3.12-alpine` - Python 3.12 on Alpine
- `golang:1.23-alpine` - Go 1.23 on Alpine
- `gcr.io/distroless/base-debian12` - Ultra-minimal base (Go apps)

### 3. .dockerignore Files

The `.dockerignore` file prevents unnecessary files from being copied into the Docker build context.

**What's Excluded:**
- Version control (`.git`, `.github`)
- Documentation (`.md` files)
- Tests and coverage reports
- Development files (`.env`, IDE files)
- `node_modules/`, `dist/`, build artifacts
- CI/CD configuration files
- Logs and temporary files

**Benefits:**
- Faster builds (less data to process)
- Better security (no unnecessary files in image)
- Cleaner images

**Example:**
```dockerfile
# .dockerignore
.git
node_modules/
*.md
.env
dist/
```

### 4. Security Improvements

#### Non-Root User
Containers run as non-root users to prevent privilege escalation:

```dockerfile
# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
```

**Benefits:**
- Even if container is compromised, attacker has limited privileges
- Complies with container security best practices
- Required by many security scanning tools

#### Minimal Base Images
Using Alpine and distroless images reduces the attack surface:
- Fewer packages = fewer vulnerabilities
- Smaller images = faster patching cycles
- Go with distroless = only Go runtime, nothing else

### 5. Health Checks

Every Dockerfile includes a `HEALTHCHECK` instruction:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node healthcheck.js || exit 1
```

**Benefits:**
- Docker can restart unhealthy containers automatically
- Kubernetes uses this data for pod replacement
- Load balancers can route traffic away from unhealthy instances

### 6. Layer Caching Optimization

Dockerfile commands are ordered to maximize cache hits:

```dockerfile
# Copy package files first (changes infrequently)
COPY package*.json ./
RUN npm ci

# Copy source code (changes frequently)
COPY . .
RUN npm run build
```

**Why:** If source changes but dependencies don't, Docker can reuse the cached dependency layer.

## Usage Examples

### Build a Service

```bash
# Build api-gateway
docker compose build api-gateway

# Build with no cache
docker compose build --no-cache api-gateway

# Build all services
docker compose build
```

### Building with Docker CLI

```bash
# Navigate to deployments/base/api-gateway/
cd deployments/base/api-gateway/

# Build the image
docker build -t my-api-gateway:latest .

# Build with build args (for multi-platform builds)
docker build \
  --platform linux/amd64,linux/arm64 \
  -t my-api-gateway:latest \
  --push .
```

### Inspect Image Size

```bash
# See all layers and their sizes
docker history my-api-gateway:latest

# Inspect image details
docker inspect my-api-gateway:latest
```

## Best Practices Checklist

When creating new Dockerfiles, ensure:

- [ ] Use multistage builds (build stage + runtime stage)
- [ ] Use Alpine or minimal base images
- [ ] Create `.dockerignore` file with common exclusions
- [ ] Order Dockerfile commands to maximize cache hits
- [ ] Run as non-root user
- [ ] Include `HEALTHCHECK` instruction
- [ ] Set explicit image versions (not `latest`)
- [ ] Use `--no-cache` flag during CI/CD builds for reproducibility
- [ ] Minimize number of layers
- [ ] Consider using distroless for compiled languages (Go, Rust)

## Language-Specific Recommendations

### Node.js/TypeScript
- Use `node:22-alpine` or `node:22-slim`
- Compile TypeScript in builder stage
- Install only production dependencies in runtime stage
- Size: 150-180MB

### Python
- Use `python:3.12-alpine`
- Build wheels in builder stage, install from wheels in runtime
- Size: 100-150MB

### Go
- Use `golang:1.23-alpine` for builder
- Use `gcr.io/distroless/base-debian12` for runtime
- Size: 10-20MB (very small!)

### Java
- Use `eclipse-temurin:21-alpine` for builder
- Use `eclipse-temurin:21-alpine` for runtime (Java apps need full runtime)
- Consider using `quay.io/distroless/java21-debian12` for minimal image
- Size: 300-500MB

## Troubleshooting

### Image Size is Large
- Check for development dependencies being installed in runtime stage
- Verify `.dockerignore` is excluding unnecessary files
- Use `docker history` to find large layers
- Consider using distroless base images

### Builds are Slow
- Verify `.dockerignore` file exists and is comprehensive
- Order Dockerfile commands to maximize cache hits
- Avoid rebuilding unchanged layers
- Use `--platform linux/amd64` to avoid multi-platform builds

### Permission Denied Errors
- Ensure files are properly `chown`-ed to the non-root user
- Check that the application can write to required directories

## Advanced Topics

### Build Arguments
Use build args for flexibility:

```dockerfile
ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION}
```

### Build Context Optimization
Place Dockerfile in subdirectory to limit context:

```bash
docker build -f ./services/api-gateway/Dockerfile .
```

### Container Registry Integration
Push to registry after build:

```bash
docker tag my-api-gateway:latest registry.example.com/my-api-gateway:latest
docker push registry.example.com/my-api-gateway:latest
```

### Multi-Platform Builds
Build for both x86 and ARM architectures:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t my-api-gateway:latest \
  --push .
```

## References

- [Docker Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Alpine Linux](https://alpinelinux.org/)
- [Distroless Containers](https://github.com/GoogleContainerTools/distroless)
- [Docker Security](https://docs.docker.com/engine/security/)
- [Multistage Builds](https://docs.docker.com/build/building/multi-stage/)
