#!/usr/bin/env bash
# File: docker/services/postgrest/tools/reload-schema.sh
# Description: Force PostgREST to reload its schema cache by sending SIGUSR1
# Usage: ./reload-schema.sh
set -euo pipefail

echo "Sending SIGUSR1 to PostgREST to reload schema cache..."
docker compose kill -s SIGUSR1 postgrest
echo "Schema cache reload triggered."
