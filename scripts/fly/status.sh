#!/usr/bin/env bash
# Show Fly.io status for all or selected mini-BaaS services.
# Usage: FLY_APP_PREFIX=my-baas bash scripts/fly/status.sh [service ...]
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_flyctl

for service in $(selected_services "$@"); do
  app="$(service_app "${service}")"
  echo
  echo "==> ${service} (${app})"
  if ! flyctl status --app "${app}"; then
    echo "status unavailable for ${app}" >&2
  fi
done
