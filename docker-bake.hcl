# File: docker-bake.hcl
# Parallel BuildKit bake configuration for mini-BaaS
# Builds all 7 NestJS apps from the unified src/Dockerfile + WAF/Vault custom images

group "default" {
  targets = [
    "adapter-registry", "mongo-api", "query-router",
    "email-service", "storage-router",
    "permission-engine", "schema-service",
    "analytics-service", "gdpr-service", "newsletter-service",
    "ai-service", "log-service", "session-service",
    "waf", "vault", "postgres"
  ]
}

group "apps" {
  targets = [
    "adapter-registry", "mongo-api", "query-router",
    "email-service", "storage-router",
    "permission-engine", "schema-service",
    "analytics-service", "gdpr-service", "newsletter-service",
    "ai-service", "log-service", "session-service"
  ]
}

group "infra" {
  targets = ["waf", "vault", "postgres"]
}

variable "REGISTRY" {
  default = "ghcr.io/univers42/mini-baas"
}

variable "TAG" {
  default = "latest"
}

# ─── Base target for NestJS apps (shared Dockerfile) ──────────────
target "nestjs-base" {
  context    = "./src"
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64", "linux/arm64"]
}

target "adapter-registry" {
  inherits   = ["nestjs-base"]
  args       = { APP = "adapter-registry" }
  tags       = ["${REGISTRY}/adapter-registry:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:adapter-registry"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:adapter-registry,mode=max"]
}

target "mongo-api" {
  inherits   = ["nestjs-base"]
  args       = { APP = "mongo-api" }
  tags       = ["${REGISTRY}/mongo-api:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:mongo-api"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:mongo-api,mode=max"]
}

target "query-router" {
  inherits   = ["nestjs-base"]
  args       = { APP = "query-router" }
  tags       = ["${REGISTRY}/query-router:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:query-router"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:query-router,mode=max"]
}

target "email-service" {
  inherits   = ["nestjs-base"]
  args       = { APP = "email-service" }
  tags       = ["${REGISTRY}/email-service:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:email-service"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:email-service,mode=max"]
}

target "storage-router" {
  inherits   = ["nestjs-base"]
  args       = { APP = "storage-router" }
  tags       = ["${REGISTRY}/storage-router:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:storage-router"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:storage-router,mode=max"]
}

target "permission-engine" {
  inherits   = ["nestjs-base"]
  args       = { APP = "permission-engine" }
  tags       = ["${REGISTRY}/permission-engine:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:permission-engine"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:permission-engine,mode=max"]
}

target "schema-service" {
  inherits   = ["nestjs-base"]
  args       = { APP = "schema-service" }
  tags       = ["${REGISTRY}/schema-service:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:schema-service"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:schema-service,mode=max"]
}

target "analytics-service" {
  inherits   = ["nestjs-base"]
  args       = { APP = "analytics-service" }
  tags       = ["${REGISTRY}/analytics-service:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:analytics-service"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:analytics-service,mode=max"]
}

target "gdpr-service" {
  inherits   = ["nestjs-base"]
  args       = { APP = "gdpr-service" }
  tags       = ["${REGISTRY}/gdpr-service:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:gdpr-service"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:gdpr-service,mode=max"]
}

target "newsletter-service" {
  inherits   = ["nestjs-base"]
  args       = { APP = "newsletter-service" }
  tags       = ["${REGISTRY}/newsletter-service:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:newsletter-service"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:newsletter-service,mode=max"]
}

target "ai-service" {
  inherits   = ["nestjs-base"]
  args       = { APP = "ai-service" }
  tags       = ["${REGISTRY}/ai-service:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:ai-service"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:ai-service,mode=max"]
}

target "log-service" {
  inherits   = ["nestjs-base"]
  args       = { APP = "log-service" }
  tags       = ["${REGISTRY}/log-service:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:log-service"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:log-service,mode=max"]
}

target "session-service" {
  inherits   = ["nestjs-base"]
  args       = { APP = "session-service" }
  tags       = ["${REGISTRY}/session-service:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:session-service"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:session-service,mode=max"]
}

# ─── Infrastructure images ───────────────────────────────────────
target "waf" {
  context    = "./docker/services/waf"
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64", "linux/arm64"]
  tags       = ["${REGISTRY}/waf:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:waf"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:waf,mode=max"]
}

target "vault" {
  context    = "./docker/services/vault"
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64", "linux/arm64"]
  tags       = ["${REGISTRY}/vault:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:vault"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:vault,mode=max"]
}

target "postgres" {
  context    = "./docker/services/postgres"
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64", "linux/arm64"]
  tags       = ["${REGISTRY}/postgres:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:postgres"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:postgres,mode=max"]
}
