#!/usr/bin/env bash
# File: docker/services/redis/tools/flush.sh
# Description: Flush all keys from the Redis instance
# Usage: ./flush.sh
set -euo pipefail

echo "Flushing all Redis data..."
docker compose exec redis redis-cli FLUSHALL
echo "Redis FLUSHALL complete."
