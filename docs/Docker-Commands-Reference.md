# Quick Reference: Docker Commands (Current)

This reference matches the current Compose-first workflow in this repository.

## Preferred Make Targets

### Stack lifecycle
```bash
make compose-up
make compose-ps
make compose-logs
make compose-down
make compose-down-volumes
make compose-restart
```

### Image lifecycle
```bash
make docker-build
make docker-build-kong
make docker-images
make docker-clean
```

### Registry workflows
```bash
make docker-tag REGISTRY=localhost:5000 IMAGE_TAG=latest
make docker-push REGISTRY=localhost:5000 IMAGE_TAG=latest
make build-and-push REGISTRY=localhost:5000 IMAGE_TAG=latest
```

### Health and tests
```bash
make compose-health
make tests
make test-phase1
make test-phase13
```

## Direct Docker Compose Commands

Use direct commands when debugging outside Make targets.

### Start and stop
```bash
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.yml down
docker compose -f docker-compose.yml down -v
```

### Logs and status
```bash
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f --tail=100
docker compose -f docker-compose.yml logs -f --tail=100 kong
```

### Pull upstream images
```bash
docker compose -f docker-compose.yml pull
```

## Build and Tag Examples

The repository primarily uses infrastructure images and Make automation. For manual image work:

```bash
docker pull kong:3.8
docker tag kong:3.8 mini-baas/kong:latest
docker tag mini-baas/kong:latest localhost:5000/kong:latest
docker push localhost:5000/kong:latest
```

## Useful Diagnostics

### Docker resource usage
```bash
docker system df
docker image ls
docker volume ls
docker container ls -a
```

### Kong declarative config validation
```bash
docker run --rm -e KONG_DATABASE=off \
  -e KONG_DECLARATIVE_CONFIG=/tmp/kong.yml \
  -v "$PWD/deployments/base/kong/kong.yml:/tmp/kong.yml:ro" \
  kong:3.8 kong config parse /tmp/kong.yml
```

## Cleanup Commands

```bash
make fclean
make docker-clean
```

For destructive cleanup, prefer the Make targets so stack shutdown and cleanup happen in a safe order.
