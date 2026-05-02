#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMAND="${1:-services}"
PROFILE="${2:-${MINI_BAAS_PROFILE:-track-binocle}}"
BASE_CONFIG_DIR="${MINI_BAAS_CONFIG_DIR:-$ROOT_DIR/config}"
PROFILE_CONFIG_DIR="$ROOT_DIR/profiles/$PROFILE"
COMPOSE_FILE="${MINI_BAAS_COMPOSE_FILE:-docker-compose.$PROFILE.yml}"

if [[ ! -f "$ROOT_DIR/$COMPOSE_FILE" ]]; then
  COMPOSE_FILE="docker-compose.yml"
fi

tmp_env="$(mktemp)"
trap 'rm -f "$tmp_env"' EXIT

normalize_key() {
  printf '%s' "$1" | tr '[:lower:]-' '[:upper:]_'
}

truthy() {
  case "${1,,}" in
    1|true|yes|on|enabled) return 0 ;;
    *) return 1 ;;
  esac
}

parse_conf() {
  local file="$1" section=""
  [[ -f "$file" ]] || return 0

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    local line key value env_key service_key
    line="${raw_line%%#*}"
    line="${line%%;*}"
    line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "$line" ]] && continue

    if [[ "$line" =~ ^\[(.*)\]$ ]]; then
      section="${BASH_REMATCH[1]}"
      continue
    fi

    [[ "$line" == *"="* ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    key="$(printf '%s' "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    value="$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

    if [[ "$section" == "services" ]]; then
      service_key="MINI_BAAS_SERVICE_$(normalize_key "$key")"
      printf '%s=%q\n' "$service_key" "$value" >> "$tmp_env"
    else
      env_key="$(normalize_key "$key")"
      printf '%s=%q\n' "$env_key" "$value" >> "$tmp_env"
    fi
  done < "$file"
}

for conf in mini-baas-infra.conf services.conf postgres.conf kong.conf; do
  parse_conf "$BASE_CONFIG_DIR/$conf"
  parse_conf "$PROFILE_CONFIG_DIR/$conf"
done

set -a
# shellcheck disable=SC1090
source "$tmp_env"
set +a

compose() {
  docker compose --env-file .env --env-file "$tmp_env" -f "$COMPOSE_FILE" "$@"
}

available_services() {
  (cd "$ROOT_DIR" && compose config --services)
}

enabled_services() {
  local available service key value
  available="$(cd "$ROOT_DIR" && available_services)"
  while IFS= read -r service; do
    [[ -n "$service" ]] || continue
    key="MINI_BAAS_SERVICE_$(normalize_key "$service")"
    value="${!key:-false}"
    if truthy "$value"; then
      printf '%s\n' "$service"
    fi
  done <<< "$available"
}

case "$COMMAND" in
  env)
    cat "$tmp_env"
    ;;
  services)
    enabled_services
    ;;
  config)
    (cd "$ROOT_DIR" && compose config)
    ;;
  up)
    mapfile -t services < <(enabled_services)
    if [[ "${#services[@]}" -eq 0 ]]; then
      echo "No services enabled for profile '$PROFILE'." >&2
      exit 1
    fi
    echo "Starting profile '$PROFILE' from $COMPOSE_FILE: ${services[*]}"
    (cd "$ROOT_DIR" && compose up -d "${services[@]}")
    ;;
  down)
    echo "Stopping profile '$PROFILE' from $COMPOSE_FILE"
    (cd "$ROOT_DIR" && compose down)
    ;;
  *)
    echo "Usage: $0 {env|services|config|up|down} [profile]" >&2
    exit 2
    ;;
esac
