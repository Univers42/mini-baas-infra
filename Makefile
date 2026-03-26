SHELL := /bin/bash
.SHELLFLAGS := -ec

# Colors
BLUE    := \033[0;34m
GREEN   := \033[0;32m
YELLOW  := \033[1;33m
RED     := \033[0;31m
DIM     := \033[2m
NC      := \033[0m

# Configuration
NO_PRINT = --no-print-directory
IMAGE_TAG ?= latest
REGISTRY ?= localhost:5000
COMPOSE_FILE ?= docker-compose.yml
SHOW_NEXT_STEPS ?= 1

# Prebuilt infrastructure images
KONG_IMAGE ?= kong:3.8
TRINO_IMAGE ?= trinodb/trino
GOTRUE_IMAGE ?= supabase/gotrue:v2.188.1
POSTGREST_IMAGE ?= postgrest/postgrest:latest
POSTGRES_IMAGE ?= postgres:16-alpine
REALTIME_IMAGE ?= supabase/realtime
MINIO_IMAGE ?= minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1
REDIS_IMAGE ?= redis:7-alpine
SUPAVISOR_IMAGE ?= supabase/supavisor:2.7.4
STUDIO_IMAGE ?= supabase/studio

define print-next
@if [ "$(SHOW_NEXT_STEPS)" = "1" ]; then \
	echo -e "$(DIM)Next: $(1)$(NC)"; \
fi
endef

check-docker: ## Check if docker is installed
	@command -v docker >/dev/null 2>&1 || { echo >&2 "Docker is not installed. Please install Docker Engine/Desktop first."; exit 1; }

check-compose: ## Check if docker compose is installed
	@docker compose version >/dev/null 2>&1 || { echo >&2 "Docker Compose plugin is not available. Install Docker Compose v2."; exit 1; }

# ============================================================================
# Docker Image Management
# ============================================================================

docker-build: ## Pull and tag all prebuilt images locally
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Pulling and tagging prebuilt Docker images...$(NC)"
	@docker pull $(KONG_IMAGE)
	@docker pull $(TRINO_IMAGE)
	@docker pull $(GOTRUE_IMAGE)
	@docker pull $(POSTGREST_IMAGE)
	@docker pull $(POSTGRES_IMAGE)
	@docker pull $(REALTIME_IMAGE)
	@docker pull $(MINIO_IMAGE)
	@docker pull $(REDIS_IMAGE)
	@docker pull $(SUPAVISOR_IMAGE)
	@docker pull $(STUDIO_IMAGE)
	@docker tag $(KONG_IMAGE) mini-baas/kong:$(IMAGE_TAG)
	@docker tag $(TRINO_IMAGE) mini-baas/trino:$(IMAGE_TAG)
	@docker tag $(GOTRUE_IMAGE) mini-baas/gotrue:$(IMAGE_TAG)
	@docker tag $(POSTGREST_IMAGE) mini-baas/postgrest:$(IMAGE_TAG)
	@docker tag $(POSTGRES_IMAGE) mini-baas/postgres:$(IMAGE_TAG)
	@docker tag $(REALTIME_IMAGE) mini-baas/realtime:$(IMAGE_TAG)
	@docker tag $(MINIO_IMAGE) mini-baas/minio:$(IMAGE_TAG)
	@docker tag $(REDIS_IMAGE) mini-baas/redis:$(IMAGE_TAG)
	@docker tag $(SUPAVISOR_IMAGE) mini-baas/supavisor:$(IMAGE_TAG)
	@docker tag $(STUDIO_IMAGE) mini-baas/studio:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ Prebuilt images ready$(NC)"
	$(call print-next,Run make compose-up to start the stack.)

docker-build-%: ## Pull/tag one prebuilt image (e.g., make docker-build-kong)
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Preparing prebuilt image for $*...$(NC)"
	@case "$*" in \
		kong) src="$(KONG_IMAGE)" ;; \
		trino) src="$(TRINO_IMAGE)" ;; \
		gotrue) src="$(GOTRUE_IMAGE)" ;; \
		postgrest) src="$(POSTGREST_IMAGE)" ;; \
		postgres) src="$(POSTGRES_IMAGE)" ;; \
		realtime) src="$(REALTIME_IMAGE)" ;; \
		minio) src="$(MINIO_IMAGE)" ;; \
		redis) src="$(REDIS_IMAGE)" ;; \
		supavisor) src="$(SUPAVISOR_IMAGE)" ;; \
		studio) src="$(STUDIO_IMAGE)" ;; \
		*) echo -e "$(RED)Unknown prebuilt image: $*$(NC)"; exit 1 ;; \
	esac; \
	docker pull "$$src"; \
	docker tag "$$src" mini-baas/$*:$(IMAGE_TAG)
	$(call print-next,Run make compose-up to start the stack.)

docker-tag: ## Tag local mini-baas images for a registry
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Tagging mini-baas images for registry: $(REGISTRY)$(NC)"
	@docker tag mini-baas/kong:$(IMAGE_TAG) $(REGISTRY)/kong:$(IMAGE_TAG)
	@docker tag mini-baas/trino:$(IMAGE_TAG) $(REGISTRY)/trino:$(IMAGE_TAG)
	@docker tag mini-baas/gotrue:$(IMAGE_TAG) $(REGISTRY)/gotrue:$(IMAGE_TAG)
	@docker tag mini-baas/postgrest:$(IMAGE_TAG) $(REGISTRY)/postgrest:$(IMAGE_TAG)
	@docker tag mini-baas/postgres:$(IMAGE_TAG) $(REGISTRY)/postgres:$(IMAGE_TAG)
	@docker tag mini-baas/realtime:$(IMAGE_TAG) $(REGISTRY)/realtime:$(IMAGE_TAG)
	@docker tag mini-baas/minio:$(IMAGE_TAG) $(REGISTRY)/minio:$(IMAGE_TAG)
	@docker tag mini-baas/redis:$(IMAGE_TAG) $(REGISTRY)/redis:$(IMAGE_TAG)
	@docker tag mini-baas/supavisor:$(IMAGE_TAG) $(REGISTRY)/supavisor:$(IMAGE_TAG)
	@docker tag mini-baas/studio:$(IMAGE_TAG) $(REGISTRY)/studio:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ Images tagged$(NC)"
	$(call print-next,Run make docker-push REGISTRY=$(REGISTRY) IMAGE_TAG=$(IMAGE_TAG).)

docker-push: ## Push all tagged images to a registry
	@$(MAKE) $(NO_PRINT) docker-tag
	@echo -e "$(BLUE)Pushing Docker images to $(REGISTRY)...$(NC)"
	@docker push $(REGISTRY)/kong:$(IMAGE_TAG)
	@docker push $(REGISTRY)/trino:$(IMAGE_TAG)
	@docker push $(REGISTRY)/gotrue:$(IMAGE_TAG)
	@docker push $(REGISTRY)/postgrest:$(IMAGE_TAG)
	@docker push $(REGISTRY)/postgres:$(IMAGE_TAG)
	@docker push $(REGISTRY)/realtime:$(IMAGE_TAG)
	@docker push $(REGISTRY)/minio:$(IMAGE_TAG)
	@docker push $(REGISTRY)/redis:$(IMAGE_TAG)
	@docker push $(REGISTRY)/supavisor:$(IMAGE_TAG)
	@docker push $(REGISTRY)/studio:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ All images pushed$(NC)"

docker-images: ## Show local mini-baas images
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Mini-BaaS Docker images:$(NC)"
	@docker images | grep mini-baas || echo "No images found. Run 'make docker-build' first."

docker-clean: ## Remove local mini-baas images
	@$(MAKE) $(NO_PRINT) check-docker
	@$(MAKE) $(NO_PRINT) compose-down
	@echo -e "$(YELLOW)Removing local mini-baas images...$(NC)"
	@docker rmi -f $$(docker images --filter=reference='mini-baas/*' -q) >/dev/null 2>&1 || true
	@echo -e "$(GREEN)✓ Images cleaned$(NC)"

docker-fclean: ## Remove local mini-baas images and stop stack
	@$(MAKE) $(NO_PRINT) check-docker
	@$(MAKE) $(NO_PRINT) compose-down
	@echo -e "$(YELLOW)Removing local mini-baas images...$(NC)"
	@docker rmi $$(docker images -q) --force
	@echo -e "$(GREEN)✓ Images cleaned$(NC)"

# ============================================================================
# Docker Compose Workflow
# ============================================================================

compose-rm-stale: ## Remove stale mini-baas containers (created/exited) to avoid name conflicts
	@$(MAKE) $(NO_PRINT) check-docker
	@stale_ids="$$(docker ps -a --format '{{.ID}} {{.Names}} {{.Status}}' | awk '/ mini-baas-/ && ($$3 == "Created" || $$3 == "Exited") {print $$1}')"; \
	if [ -n "$$stale_ids" ]; then \
		echo -e "$(YELLOW)Removing stale mini-baas containers to avoid name conflicts...$(NC)"; \
		docker rm -f $$stale_ids >/dev/null; \
		echo -e "$(GREEN)✓ Stale containers removed$(NC)"; \
	fi

compose-up: ## Start stack in detached mode
	@$(MAKE) $(NO_PRINT) check-docker
	@$(MAKE) $(NO_PRINT) check-compose
	@$(MAKE) $(NO_PRINT) compose-rm-stale
	@echo -e "$(BLUE)Starting stack from $(COMPOSE_FILE)...$(NC)"
	@docker compose -f $(COMPOSE_FILE) up -d
	@echo -e "$(GREEN)✓ Stack started$(NC)"
	$(call print-next,Run make compose-ps or make compose-health.)

compose-down: ## Stop and remove stack resources
	@$(MAKE) $(NO_PRINT) check-docker
	@$(MAKE) $(NO_PRINT) check-compose
	@echo -e "$(YELLOW)Stopping stack...$(NC)"
	@docker compose -f $(COMPOSE_FILE) down
	@echo -e "$(GREEN)✓ Stack stopped$(NC)"

compose-down-volumes: ## Stop stack and remove named volumes
	@$(MAKE) $(NO_PRINT) check-docker
	@$(MAKE) $(NO_PRINT) check-compose
	@echo -e "$(YELLOW)Stopping stack and removing volumes...$(NC)"
	@docker compose -f $(COMPOSE_FILE) down -v
	@echo -e "$(GREEN)✓ Stack and volumes removed$(NC)"

compose-restart: ## Restart all stack services
	@$(MAKE) $(NO_PRINT) check-docker
	@$(MAKE) $(NO_PRINT) check-compose
	@docker compose -f $(COMPOSE_FILE) restart
	@echo -e "$(GREEN)✓ Stack restarted$(NC)"

compose-ps: ## Show stack service status
	@$(MAKE) $(NO_PRINT) check-docker
	@$(MAKE) $(NO_PRINT) check-compose
	@docker compose -f $(COMPOSE_FILE) ps

compose-logs: ## Stream logs (SERVICE=<name> optional)
	@$(MAKE) $(NO_PRINT) check-docker
	@$(MAKE) $(NO_PRINT) check-compose
	@if [ -n "$(SERVICE)" ]; then \
		docker compose -f $(COMPOSE_FILE) logs -f --tail=100 $(SERVICE); \
	else \
		docker compose -f $(COMPOSE_FILE) logs -f --tail=100; \
	fi

compose-pull: ## Pull latest images for all services
	@$(MAKE) $(NO_PRINT) check-docker
	@$(MAKE) $(NO_PRINT) check-compose
	@docker compose -f $(COMPOSE_FILE) pull
	@echo -e "$(GREEN)✓ Images pulled$(NC)"

compose-health: ## Quick health checks for key routes
	@echo -e "$(BLUE)Checking local endpoints...$(NC)"
	@curl -fsS http://localhost:8000/auth/health >/dev/null && echo "  ✓ Kong -> /auth/health" || echo "  ✗ Kong -> /auth/health"
	@curl -fsS http://localhost:8000/sql/v1/info >/dev/null && echo "  ✓ Kong -> /sql/v1/info" || echo "  ✗ Kong -> /sql/v1/info"
	@curl -fsS http://localhost:5432 >/dev/null 2>&1 && echo "  ✓ Postgres port open" || echo "  • Postgres TCP check skipped/failed"

# Convenience aliases

dev-up: ## Start local stack with docker compose
	@$(MAKE) $(NO_PRINT) compose-up

dev-down: ## Stop local stack
	@$(MAKE) $(NO_PRINT) compose-down

dev-re: ## Restart local stack
	@$(MAKE) $(NO_PRINT) compose-down
	@$(MAKE) $(NO_PRINT) docker-clean
	@$(MAKE) $(NO_PRINT) compose-up

build-and-push: ## Build/pull, tag and push images
	@$(MAKE) $(NO_PRINT) docker-build
	@$(MAKE) $(NO_PRINT) docker-push
	@echo -e "$(GREEN)✓ All images built and pushed$(NC)"

fclean: ## Full cleanup (containers, volumes, and local images)
	@$(MAKE) $(NO_PRINT) compose-down-volumes
	@$(MAKE) $(NO_PRINT) docker-clean
	@echo -e "$(GREEN)✓ Full clean complete$(NC)"

help: ## Show this help message
	@echo ""
	@echo "mini-baas-infrastructure - Available Commands"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-24s %s\n", $$1, $$2}'
	@echo ""
	$(call print-next,Start with make compose-up.)

.PHONY: \
	check-docker check-compose \
	docker-build docker-build-% docker-tag docker-push docker-images docker-clean \
	compose-rm-stale compose-up compose-down compose-down-volumes compose-restart compose-ps compose-logs compose-pull compose-health \
	dev-up dev-down dev-re build-and-push fclean help
