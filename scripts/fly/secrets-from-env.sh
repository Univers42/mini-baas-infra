#!/usr/bin/env bash
# Push per-service secrets from .env to Fly.io without printing secret values.
# Usage:
#   FLY_APP_PREFIX=my-baas bash scripts/fly/secrets-from-env.sh [service ...]
#   DRY_RUN=1 bash scripts/fly/secrets-from-env.sh gateway
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_flyctl

ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
DRY_RUN="${DRY_RUN:-0}"

[[ -f "${ENV_FILE}" ]] || { echo "Missing env file: ${ENV_FILE}" >&2; exit 1; }

load_env_value() {
  local key="$1"
  grep -E "^${key}=" "${ENV_FILE}" | tail -1 | cut -d= -f2- || true
}

set_service_secrets() {
  local service="$1" app="$2" keys=() args=() key value prefix
  prefix="${FLY_APP_PREFIX}"

  case "${service}" in
    gateway)
      keys=(JWT_SECRET KONG_PUBLIC_API_KEY KONG_SERVICE_API_KEY KONG_CORS_ORIGIN_APP KONG_CORS_ORIGIN_PLAYGROUND KONG_CORS_ORIGIN_STUDIO KONG_CORS_ORIGIN_FRONTEND API_EXTERNAL_URL)
      args+=("AUTH_UPSTREAM_URL=http://${prefix}-auth.internal:9999")
      args+=("POSTGREST_UPSTREAM_URL=http://${prefix}-postgrest.internal:3000")
      args+=("REALTIME_WS_UPSTREAM_URL=http://${prefix}-realtime.internal:4000/ws")
      args+=("MONGO_API_UPSTREAM_URL=http://${prefix}-mongo-api.internal:3010")
      args+=("ADAPTER_REGISTRY_UPSTREAM_URL=http://${prefix}-adapter-registry.internal:3020")
      args+=("QUERY_ROUTER_UPSTREAM_URL=http://${prefix}-query-router.internal:4001")
      args+=("EMAIL_SERVICE_UPSTREAM_URL=http://${prefix}-email-service.internal:3030")
      args+=("STORAGE_ROUTER_UPSTREAM_URL=http://${prefix}-storage-router.internal:3040")
      args+=("PERMISSION_ENGINE_UPSTREAM_URL=http://${prefix}-permission-engine.internal:3050")
      args+=("SCHEMA_SERVICE_UPSTREAM_URL=http://${prefix}-schema-service.internal:3060")
      args+=("ANALYTICS_SERVICE_UPSTREAM_URL=http://${prefix}-analytics-service.internal:3070")
      args+=("GDPR_SERVICE_UPSTREAM_URL=http://${prefix}-gdpr-service.internal:3080")
      args+=("NEWSLETTER_SERVICE_UPSTREAM_URL=http://${prefix}-newsletter-service.internal:3090")
      args+=("AI_SERVICE_UPSTREAM_URL=http://${prefix}-ai-service.internal:3100")
      args+=("LOG_SERVICE_UPSTREAM_URL=http://${prefix}-log-service.internal:3110")
      args+=("SESSION_SERVICE_UPSTREAM_URL=http://${prefix}-session-service.internal:3120")
      ;;
    auth)
      keys=(API_EXTERNAL_URL GOTRUE_SITE_URL GOTRUE_URI_ALLOW_LIST GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET FORTYTWO_CLIENT_ID FORTYTWO_CLIENT_SECRET)
      value="$(load_env_value DATABASE_URL)"; [[ -n "${value}" ]] && args+=("GOTRUE_DB_DATABASE_URL=${value}")
      value="$(load_env_value JWT_SECRET)"; [[ -n "${value}" ]] && args+=("GOTRUE_JWT_SECRET=${value}")
      value="$(load_env_value SMTP_HOST)"; [[ -n "${value}" ]] && args+=("GOTRUE_SMTP_HOST=${value}")
      value="$(load_env_value SMTP_PORT)"; [[ -n "${value}" ]] && args+=("GOTRUE_SMTP_PORT=${value}")
      value="$(load_env_value SMTP_USER)"; [[ -n "${value}" ]] && args+=("GOTRUE_SMTP_USER=${value}")
      value="$(load_env_value SMTP_PASS)"; [[ -n "${value}" ]] && args+=("GOTRUE_SMTP_PASS=${value}")
      value="$(load_env_value EMAIL_FROM)"; [[ -n "${value}" ]] && args+=("GOTRUE_SMTP_ADMIN_EMAIL=${value}")
      ;;
    postgrest)
      keys=(PGRST_DB_URI PGRST_DB_SCHEMA PGRST_DB_ANON_ROLE)
      value="$(load_env_value JWT_SECRET)"; [[ -n "${value}" ]] && args+=("PGRST_JWT_SECRET=${value}")
      ;;
    adapter-registry)
      keys=(DATABASE_URL JWT_SECRET VAULT_ENC_KEY ADAPTER_REGISTRY_SERVICE_TOKEN)
      ;;
    query-router|schema-service)
      keys=(JWT_SECRET ADAPTER_REGISTRY_SERVICE_TOKEN)
      args+=("ADAPTER_REGISTRY_URL=http://${prefix}-adapter-registry.internal:3020")
      ;;
    mongo-api|analytics-service|ai-service)
      keys=(MONGO_URI JWT_SECRET LLM_API_KEY LLM_API_URL LLM_MODEL)
      ;;
    storage-router)
      keys=(JWT_SECRET S3_ENDPOINT S3_REGION)
      value="$(load_env_value S3_ACCESS_KEY)"; [[ -z "${value}" ]] && value="$(load_env_value MINIO_ROOT_USER)"; [[ -n "${value}" ]] && args+=("S3_ACCESS_KEY=${value}")
      value="$(load_env_value S3_SECRET_KEY)"; [[ -z "${value}" ]] && value="$(load_env_value MINIO_ROOT_PASSWORD)"; [[ -n "${value}" ]] && args+=("S3_SECRET_KEY=${value}")
      ;;
    permission-engine|gdpr-service|newsletter-service|session-service)
      keys=(DATABASE_URL JWT_SECRET)
      ;;
    email-service)
      keys=(JWT_SECRET SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_SECURE EMAIL_FROM)
      ;;
    log-service)
      keys=(JWT_SECRET LOG_STREAM_TOKEN)
      ;;
    realtime)
      keys=(REALTIME_PG_URL REALTIME_MONGO_URI REALTIME_MONGO_DB RUST_LOG)
      value="$(load_env_value JWT_SECRET)"; [[ -n "${value}" ]] && args+=("REALTIME_JWT_SECRET=${value}")
      if [[ -z "$(load_env_value REALTIME_PG_URL)" ]]; then
        value="$(load_env_value DATABASE_URL)"; [[ -n "${value}" ]] && args+=("REALTIME_PG_URL=${value}")
      fi
      if [[ -z "$(load_env_value REALTIME_MONGO_URI)" ]]; then
        value="$(load_env_value MONGO_URI)"; [[ -n "${value}" ]] && args+=("REALTIME_MONGO_URI=${value}")
      fi
      ;;
  esac

  for key in "${keys[@]}"; do
    value="$(load_env_value "${key}")"
    [[ -n "${value}" ]] && args+=("${key}=${value}")
  done

  if [[ ${#args[@]} -eq 0 ]]; then
    echo "No secrets found for ${service}; skipping"
    return 0
  fi

  if [[ "${DRY_RUN}" = "1" ]]; then
    echo "DRY RUN: would set ${#args[@]} secret(s) on ${app}"
  else
    echo "Setting ${#args[@]} secret(s) on ${app}"
    flyctl secrets set --app "${app}" "${args[@]}" >/dev/null
  fi
}

for service in $(selected_services "$@"); do
  set_service_secrets "${service}" "$(service_app "${service}")"
done
