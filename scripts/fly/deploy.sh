#!/usr/bin/env bash
# Deploy one or more mini-BaaS services to Fly.io.
# Usage:
#   FLY_APP_PREFIX=my-baas FLY_ORG=my-org bash scripts/fly/deploy.sh [service ...]
# Examples:
#   bash scripts/fly/deploy.sh gateway
#   bash scripts/fly/deploy.sh adapter-registry auth query-router gateway
#   bash scripts/fly/deploy.sh   # deploy all in production order
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_flyctl

cd "${ROOT_DIR}"

for service in $(selected_services "$@"); do
  config="$(service_config "${service}")"
  app="$(service_app "${service}")"

  create_app_if_missing "${app}"
  echo "==> Deploying ${service} as ${app} using ${config#${ROOT_DIR}/}"
  flyctl deploy \
    --app "${app}" \
    --config "${config}" \
    --remote-only \
    .
done
