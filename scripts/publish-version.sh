#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

VERSION="${VERSION:?VERSION is required}"
PROJECT="${PROJECT:-mini-baas}"
IMAGES="${IMAGES:?IMAGES is required, e.g. kong=kong:3.8 postgres=postgres:16-alpine}"
GHCR_OWNER="${GHCR_OWNER:-univers42}"
GHCR_REPOSITORY="${GHCR_REPOSITORY:-mini-baas-infra}"
DOCKERHUB_NAMESPACE="${DOCKERHUB_NAMESPACE:-${DOCKER_LOGIN:-dlesieur}}"
DOCKERHUB_REPOSITORY_PREFIX="${DOCKERHUB_REPOSITORY_PREFIX:-mini-baas-infra}"
PUSH_LATEST="${PUSH_LATEST:-true}"

lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

login_ghcr() {
  local user token
  user="${GHCR_USER:-${GITHUB_ACTOR:-$GHCR_OWNER}}"
  token="${GHCR_TOKEN:-${GITHUB_TOKEN:-}}"
  if [[ -n "$token" ]]; then
    printf '%s' "$token" | docker login ghcr.io -u "$user" --password-stdin >/dev/null
    echo "✓ Logged in to GHCR as $user"
  else
    echo "• No GHCR_TOKEN/GITHUB_TOKEN found; using existing GHCR Docker credentials"
  fi
}

login_dockerhub() {
  local user token
  user="${DOCKERHUB_USERNAME:-${DOCKER_LOGIN:-}}"
  token="${DOCKERHUB_TOKEN:-${DOCKER_PAT:-}}"
  if [[ -n "$user" && -n "$token" ]]; then
    printf '%s' "$token" | docker login docker.io -u "$user" --password-stdin >/dev/null
    echo "✓ Logged in to DockerHub as $user"
  else
    echo "• No DockerHub token found; using existing DockerHub credentials"
  fi
}

publish_ref() {
  local local_ref remote_ref
  local_ref="$1"
  remote_ref="$2"

  docker image inspect "$local_ref" >/dev/null 2>&1 || {
    echo "Missing local image: $local_ref" >&2
    exit 1
  }

  docker tag "$local_ref" "$remote_ref:$VERSION"
  docker push "$remote_ref:$VERSION"

  if [[ "$PUSH_LATEST" == "true" ]]; then
    docker tag "$local_ref" "$remote_ref:latest"
    docker push "$remote_ref:latest"
  fi
}

login_ghcr
login_dockerhub

for pair in $IMAGES; do
  service="${pair%%=*}"
  local_ref="$PROJECT/$service:$VERSION"

  ghcr_ref="ghcr.io/$(lower "$GHCR_OWNER")/$(lower "$GHCR_REPOSITORY")/$(lower "$service")"
  dockerhub_ref="docker.io/$(lower "$DOCKERHUB_NAMESPACE")/$(lower "$DOCKERHUB_REPOSITORY_PREFIX-$service")"

  echo "Publishing $service"
  publish_ref "$local_ref" "$ghcr_ref"
  publish_ref "$local_ref" "$dockerhub_ref"
done

echo "✓ Published version $VERSION to GHCR and DockerHub"
