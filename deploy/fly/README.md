# Fly.io Deployment Manifests

This directory contains one Fly configuration per mini-BaaS service.

Use the scripts in `scripts/fly` instead of invoking `flyctl` manually:

```bash
# Push secrets from .env or ENV_FILE.
FLY_APP_PREFIX=my-baas bash scripts/fly/secrets-from-env.sh

# Deploy all services in services.env order.
FLY_APP_PREFIX=my-baas bash scripts/fly/deploy.sh

# Deploy one service.
FLY_APP_PREFIX=my-baas bash scripts/fly/deploy.sh gateway

# Show statuses.
FLY_APP_PREFIX=my-baas bash scripts/fly/status.sh
```

The gateway is the only public app. All other services are private-only and are reached through Fly private DNS.

See `docs/Fly-Deployment.md` for the full operational guide.
