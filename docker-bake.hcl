# File: docker-bake.hcl
# Parallel BuildKit bake configuration for mini-BaaS
# Only targets that actually build custom code — pass-through images use image: in compose

group "default" {
  targets = ["mongo-api", "adapter-registry", "query-router"]
}

variable "REGISTRY" {
  default = "ghcr.io/univers42/mini-baas"
}

variable "TAG" {
  default = "latest"
}

target "base" {
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:base"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:base,mode=max"]
}

target "mongo-api" {
  inherits   = ["base"]
  context    = "./docker/services/mongo-api"
  tags       = ["${REGISTRY}/mongo-api:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:mongo-api"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:mongo-api,mode=max"]
}

target "adapter-registry" {
  inherits   = ["base"]
  context    = "./docker/services/adapter-registry"
  tags       = ["${REGISTRY}/adapter-registry:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:adapter-registry"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:adapter-registry,mode=max"]
}

target "query-router" {
  inherits   = ["base"]
  context    = "./docker/services/query-router"
  tags       = ["${REGISTRY}/query-router:${TAG}"]
  cache-from = ["type=registry,ref=${REGISTRY}/cache:query-router"]
  cache-to   = ["type=registry,ref=${REGISTRY}/cache:query-router,mode=max"]
}
