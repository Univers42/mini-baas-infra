SHELL          := /bin/bash
.SHELLFLAGS    := -ec
.DEFAULT_GOAL  := help

# --------------------------------------------------------------------------- #
#  Variables                                                                   #
# --------------------------------------------------------------------------- #

PROJECT        := mini-baas

# Colors
_B := \033[0;34m
_G := \033[0;32m
_Y := \033[1;33m
_R := \033[0;31m
_C := \033[0;36m
_W := \033[1m
_D := \033[2m
_0 := \033[0m

# Tunables  (override via CLI: make up COMPOSE_FILE=docker-compose.prod.yml)
IMAGE_TAG      ?= latest
REGISTRY       ?= localhost:5000
COMPOSE_FILE   ?= docker-compose.yml
SERVICE        ?=
STEPS          ?= 1
HOOKS_DIR      := vendor/scripts/hooks

# Image map — local_name=upstream_ref  (single source of truth, pinned versions)
IMAGES_CORE := \
	kong=kong:3.8 \
	trino=trinodb/trino:467 \
	gotrue=supabase/gotrue:v2.188.1 \
	postgrest=postgrest/postgrest:v12.2.3 \
	postgres=postgres:16-alpine \
	realtime=supabase/realtime:v2.33.70 \
	redis=redis:7-alpine \
	mongo=mongo:7 \
	pg-meta=supabase/postgres-meta:v0.91.0

IMAGES_EXTRAS := \
	minio=minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1 \
	supavisor=supabase/supavisor:2.7.4 \
	studio=supabase/studio:2026.03.30-sha-12a43e5

# Set PROFILES=extras to include minio, supavisor, studio
PROFILES       ?=
ifneq ($(PROFILES),)
  IMAGES := $(IMAGES_CORE) $(IMAGES_EXTRAS)
  DC     := docker compose -f $(COMPOSE_FILE) --profile $(PROFILES)
else
  IMAGES := $(IMAGES_CORE)
  DC     := docker compose -f $(COMPOSE_FILE)
endif

# --------------------------------------------------------------------------- #
#  Internal prerequisites (no ## = hidden from help)                           #
# --------------------------------------------------------------------------- #

_require-docker:
	@command -v docker >/dev/null 2>&1 \
		|| { echo >&2 "Docker is not installed. Install Docker Engine/Desktop first."; exit 1; }

_require-compose: _require-docker
	@docker compose version >/dev/null 2>&1 \
		|| { echo >&2 "Docker Compose v2 plugin is required."; exit 1; }

_rm-stale:
	@ids=$$(docker ps -a --format '{{.ID}} {{.Names}} {{.Status}}' \
		| awk '/ mini-baas-/ && ($$3=="Created"||$$3=="Exited") {print $$1}'); \
	[ -z "$$ids" ] || { echo -e "$(_Y)Removing stale containers…$(_0)"; docker rm -f $$ids >/dev/null; }

# ========================================================================== #
##@ 42 Classics
# ========================================================================== #

all: ## Build/pull core images & start stack (PROFILES=extras for full)
	@$(MAKE) --no-print-directory build
	@$(MAKE) --no-print-directory up

all-full: ## Build/pull ALL images & start full stack
	@$(MAKE) --no-print-directory PROFILES=extras all

clean: down ## Stop the stack (alias for down)

fclean: _require-compose ## Full cleanup — containers, volumes and images
	@$(DC) down -v 2>/dev/null || true
	@docker rmi -f $$(docker images --filter=reference='$(PROJECT)/*' -q) 2>/dev/null || true
	@echo -e "$(_G)✓ Full clean complete$(_0)"

re: ## fclean + all
	@$(MAKE) --no-print-directory fclean
	@$(MAKE) --no-print-directory all

# ========================================================================== #
##@ Stack
# ========================================================================== #

up: _require-compose _rm-stale ## Start stack in detached mode
	@eval "$$(bash scripts/resolve-ports.sh)"; \
	echo -e "$(_B)Starting stack from $(COMPOSE_FILE)…$(_0)"; \
	$(DC) up -d; \
	echo -e "$(_G)✓ Stack started$(_0)"

down: _require-compose ## Stop and remove stack resources
	@echo -e "$(_Y)Stopping stack…$(_0)"
	@$(DC) down
	@echo -e "$(_G)✓ Stack stopped$(_0)"

restart: _require-compose ## Restart all services
	@$(DC) restart
	@echo -e "$(_G)✓ Restarted$(_0)"

ps: _require-compose ## Show service status
	@$(DC) ps

logs: _require-compose ## Stream logs (SERVICE=<name> to filter)
	@$(DC) logs -f --tail=100 $(SERVICE)

pull: _require-compose ## Pull latest images for all services
	@$(DC) pull
	@echo -e "$(_G)✓ Pulled$(_0)"

health: ## Quick health-check on gateway routes
	@echo -e "$(_B)Checking endpoints…$(_0)"
	@curl -fsS http://localhost:8000/auth/v1/health >/dev/null \
		&& echo "  ✓ /auth/v1/health" || echo "  ✗ /auth/v1/health"
	@curl -fsS http://localhost:8000/rest/v1/ >/dev/null \
		&& echo "  ✓ /rest/v1/"       || echo "  ✗ /rest/v1/"
	@curl -fsS http://localhost:5432 >/dev/null 2>&1 \
		&& echo "  ✓ postgres:5432"   || echo "  • postgres TCP skipped"

# ========================================================================== #
##@ Docker Images
# ========================================================================== #

build: _require-docker ## Pull & tag all prebuilt images
	@echo -e "$(_B)Pulling and tagging prebuilt images…$(_0)"
	@pids=""; for pair in $(IMAGES); do \
		( \
			name=$${pair%%=*}; src=$${pair#*=}; \
			tag=$(PROJECT)/$$name:$(IMAGE_TAG); \
			if docker image inspect "$$tag" >/dev/null 2>&1; then \
				echo -e "  $(_G)●$(_0) $$name  (cached)"; \
			else \
				echo -e "  $(_Y)↓$(_0) $$name  ($${src})"; \
				t0=$$(date +%s); \
				if docker pull -q "$$src" >/dev/null; then \
					docker tag "$$src" "$$tag"; \
					t1=$$(date +%s); \
					echo -e "  $(_G)✓$(_0) $$name  [$$(( t1 - t0 ))s]"; \
				else \
					echo -e "  $(_R)✗$(_0) $$name  FAILED"; \
					exit 1; \
				fi; \
			fi \
		) & pids="$$pids $$!"; \
	done; \
	fail=0; for p in $$pids; do wait "$$p" || fail=1; done; \
	[ "$$fail" -eq 0 ] || { echo -e "$(_R)✗ Some pulls failed — check output above$(_0)"; exit 1; }
	@echo -e "$(_G)✓ All images ready$(_0)"

build-%: _require-docker ## Pull/tag one image (e.g. make build-kong)
	@src=""; for pair in $(IMAGES); do \
		n=$${pair%%=*}; [ "$$n" = "$*" ] && src=$${pair#*=} && break; \
	done; \
	[ -n "$$src" ] || { echo -e "$(_R)Unknown image: $*$(_0)"; exit 1; }; \
	echo -e "$(_B)Pulling $*…$(_0)"; \
	docker pull "$$src"; \
	docker tag "$$src" $(PROJECT)/$*:$(IMAGE_TAG); \
	echo -e "$(_G)✓ $* ready$(_0)"

build-optimized: _require-docker ## BuildKit parallel build with inline cache
	@DOCKER_BUILDKIT=1 $(DC) build --build-arg BUILDKIT_INLINE_CACHE=1 --parallel
	@echo -e "$(_G)✓ Optimized build complete$(_0)"

tag: _require-docker ## Tag images for REGISTRY
	@echo -e "$(_B)Tagging for $(REGISTRY)…$(_0)"
	@for pair in $(IMAGES); do \
		name=$${pair%%=*}; \
		docker tag $(PROJECT)/$$name:$(IMAGE_TAG) $(REGISTRY)/$$name:$(IMAGE_TAG); \
	done
	@echo -e "$(_G)✓ Tagged$(_0)"

push: tag ## Tag & push all images to REGISTRY
	@echo -e "$(_B)Pushing to $(REGISTRY)…$(_0)"
	@for pair in $(IMAGES); do \
		name=$${pair%%=*}; \
		docker push $(REGISTRY)/$$name:$(IMAGE_TAG); \
	done
	@echo -e "$(_G)✓ Pushed$(_0)"

push-bake: ## Build & push via docker buildx bake
	@docker buildx bake --file docker-bake.hcl --push \
		--set "*.cache-to=type=registry,ref=$(REGISTRY)/cache,mode=max"
	@echo -e "$(_G)✓ Bake push to $(REGISTRY) complete$(_0)"

images: _require-docker ## List local $(PROJECT) images
	@docker images | grep $(PROJECT) || echo "No images found. Run 'make build'."

image-sizes: ## Show image sizes for the stack
	@echo -e "$(_B)Image sizes:$(_0)"
	@$(DC) images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' 2>/dev/null \
		|| docker images --filter=reference='$(PROJECT)*' \
			--format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'

# ========================================================================== #
##@ Testing
# ========================================================================== #

tests: ## Run all smoke tests (phase 1→15)
	@total_p=0; total_f=0; rc_all=0; \
	for script in $$(ls -1 ./scripts/phase*-*.sh ./scripts/phase*-*.py 2>/dev/null | sort -t/ -k3 -V); do \
		[ -f "$$script" ] || continue; \
		tmp=$$(mktemp); \
		case "$$script" in \
			*.py) FORCE_COLORS=1 python3 "$$script" | tee "$$tmp" ;; \
			*)    FORCE_COLORS=1 bash    "$$script" | tee "$$tmp" ;; \
		esac; \
		rc=$${PIPESTATUS[0]}; \
		clean=$$(sed -E 's/\x1B\[[0-9;]*[A-Za-z]//g' "$$tmp"); \
		p=$$(printf '%s\n' "$$clean" | awk -F: '/Passed:/{gsub(/[^0-9]/,"",$$2);v=$$2}END{print v+0}'); \
		f=$$(printf '%s\n' "$$clean" | awk -F: '/Failed:/{gsub(/[^0-9]/,"",$$2);v=$$2}END{print v+0}'); \
		total_p=$$((total_p + p)); total_f=$$((total_f + f)); \
		rm -f "$$tmp"; \
		[ "$$rc" -eq 0 ] || rc_all=1; \
		sleep 2; \
	done; \
	echo ""; \
	echo -e "$(_C)$(_W)╔════════════════════════════════════════════════╗$(_0)"; \
	echo -e "$(_C)$(_W)║$(_0) $(_W)Tests Summary$(_0)"; \
	echo -e "$(_C)$(_W)╠════════════════════════════════════════════════╣$(_0)"; \
	echo -e "$(_C)$(_W)║$(_0) $(_G)$(_W)✔ Passed:$(_0) $(_G)$$total_p$(_0)"; \
	echo -e "$(_C)$(_W)║$(_0) $(_R)$(_W)✖ Failed:$(_0) $(_R)$$total_f$(_0)"; \
	echo -e "$(_C)$(_W)╚════════════════════════════════════════════════╝$(_0)"; \
	[ "$$rc_all" -eq 0 ] \
		&& echo -e "$(_G)$(_W)✔ All phases passed$(_0)" \
		|| { echo -e "$(_R)$(_W)✖ Some phases failed$(_0)"; exit 1; }

test-phase%: ## Run one phase (e.g. make test-phase3)
	@script=$$(ls scripts/phase$*-*.sh 2>/dev/null | head -1); \
	if [ -n "$$script" ]; then FORCE_COLORS=1 bash "$$script"; \
	else \
		script=$$(ls scripts/phase$*-*.py 2>/dev/null | head -1); \
		[ -n "$$script" ] && FORCE_COLORS=1 python3 "$$script" \
			|| { echo -e "$(_R)No test for phase $*$(_0)"; exit 1; }; \
	fi

test-postgres: ## Run PostgreSQL MVP happy-path flow
	@FORCE_COLORS=1 bash ./scripts/postgres-mvp-flow.sh

# ========================================================================== #
##@ Migrations
# ========================================================================== #

migrate: ## Run all pending PostgreSQL migrations
	@echo -e "$(_B)Running PostgreSQL migrations…$(_0)"
	@for f in $$(ls -1 scripts/migrations/postgresql/*.sql 2>/dev/null | sort); do \
		echo "  Applying: $$f"; \
		docker compose exec -T postgres psql -U postgres -d postgres -f /dev/stdin < "$$f"; \
	done
	@echo -e "$(_G)✓ PostgreSQL migrations applied$(_0)"

migrate-mongo: ## Run all MongoDB migrations
	@echo -e "$(_B)Running MongoDB migrations…$(_0)"
	@for f in $$(ls -1 scripts/migrations/mongodb/*.js 2>/dev/null | sort); do \
		echo "  Applying: $$f"; \
		docker compose exec -T mongo mongosh mini_baas < "$$f"; \
	done
	@echo -e "$(_G)✓ MongoDB migrations applied$(_0)"

migrate-down: ## Show rollback hints (STEPS=1)
	@echo -e "$(_Y)Manual rollback required.$(_0)"
	@echo "Check DOWN comments in the last $(STEPS) migration(s):"
	@ls -1r scripts/migrations/postgresql/*.sql | head -n $(STEPS)

migrate-status: ## Show applied migration versions
	@docker compose exec -T postgres psql -U postgres -d postgres \
		-c "SELECT version, name, applied_at FROM schema_migrations ORDER BY version;" \
		2>/dev/null || echo "  No migrations table — run make migrate first."

# ========================================================================== #
##@ Secrets
# ========================================================================== #

secrets: ## Generate all secrets → .env
	@bash scripts/secrets/generate-secrets.sh

secrets-validate: ## Validate required secrets exist
	@bash scripts/secrets/validate-secrets.sh

secrets-rotate: ## Rotate JWT secret (zero-downtime)
	@bash scripts/secrets/rotate-jwt.sh

check-secrets: ## Scan source code for hardcoded secrets
	@bash scripts/check-secrets.sh

# ========================================================================== #
##@ Observability
# ========================================================================== #

observe: _require-compose ## Start Prometheus + Grafana + Loki
	@$(DC) --profile observability up -d
	@echo -e "$(_G)✓ Observability started$(_0)"
	@echo -e "  Grafana:    http://localhost:3030"
	@echo -e "  Prometheus: http://localhost:9090"

observe-down: ## Stop observability stack
	@$(DC) --profile observability stop prometheus grafana loki promtail 2>/dev/null || true
	@echo -e "$(_G)✓ Observability stopped$(_0)"

grafana: ## Open Grafana in browser
	@xdg-open http://localhost:3030 2>/dev/null \
		|| open http://localhost:3030 2>/dev/null \
		|| echo "http://localhost:3030"

prometheus: ## Open Prometheus in browser
	@xdg-open http://localhost:9090 2>/dev/null \
		|| open http://localhost:9090 2>/dev/null \
		|| echo "http://localhost:9090"

# ========================================================================== #
##@ Adapter Registry
# ========================================================================== #

adapter-add: ## Register a database  (ENGINE= NAME= DSN=)
	@curl -sS -X POST http://localhost:8000/admin/v1/databases \
		-H "apikey: $$(grep KONG_SERVICE_API_KEY .env | cut -d= -f2)" \
		-H "Content-Type: application/json" \
		-d '{"engine":"$(ENGINE)","name":"$(NAME)","connection_string":"$(DSN)"}'
	@echo ""

adapter-ls: ## List registered databases
	@curl -sS http://localhost:8000/admin/v1/databases \
		-H "apikey: $$(grep KONG_SERVICE_API_KEY .env | cut -d= -f2)" | jq .

# ========================================================================== #
##@ Playground
# ========================================================================== #

play-css: ## Build libcss CSS assets
	@command -v npm >/dev/null 2>&1 || { echo >&2 "npm is required to build CSS."; exit 1; }
	@npm --prefix ./vendor/libcss install --legacy-peer-deps
	@npm --prefix ./vendor/libcss run build:min
	@echo -e "$(_G)✓ CSS ready$(_0)"

play: _require-compose play-css ## Build CSS & start playground
	@$(DC) up -d playground
	@echo -e "$(_G)✓ Playground → http://localhost:3100$(_0)"

play-down: _require-compose ## Stop playground
	@$(DC) stop playground 2>/dev/null || true
	@$(DC) rm -f playground  2>/dev/null || true
	@echo -e "$(_G)✓ Playground stopped$(_0)"

play-logs: _require-compose ## Stream playground logs
	@$(DC) logs -f --tail=100 playground

# ========================================================================== #
##@ Utilities
# ========================================================================== #

env: ## Generate .env from template
	@bash scripts/generate-env.sh

preflight: ## Run all pre-deployment checks
	@bash scripts/preflight-check.sh

hooks: ## Activate git hooks
	@if [ ! -d .git ]; then echo -e "  $(_Y)⚠$(_0) Not a git repo — skipping"; \
	else \
		cur=$$(git config --local core.hooksPath 2>/dev/null || echo ""); \
		if [ "$$cur" = "$(HOOKS_DIR)" ]; then \
			echo -e "  $(_G)✓$(_0) Git hooks active → $(HOOKS_DIR)"; \
		else \
			git config --local core.hooksPath $(HOOKS_DIR); \
			chmod +x $(HOOKS_DIR)/*; \
			echo -e "  $(_G)✓$(_0) Git hooks activated → $(HOOKS_DIR)"; \
		fi; \
		for old in commit-msg pre-commit pre-push post-checkout pre-merge-commit log_hook log_hook.sh; do \
			[ -L ".git/hooks/$$old" ] && rm -f ".git/hooks/$$old"; \
		done; \
	fi

update: ## Update git submodules
	@git submodule update --remote --merge
	@echo -e "$(_G)✓ Submodules updated$(_0)"

# ========================================================================== #
##@ Help
# ========================================================================== #

help: ## Show this help
	@echo ""
	@echo -e "$(_W)$(_C)$(PROJECT) — Available Commands$(_0)"
	@awk 'BEGIN {FS=":.*##"; printf ""} \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0,5) } \
		/^[a-zA-Z0-9_%.-]+:.*##/ { printf "  \033[1;32m%-20s\033[0m \033[2;37m%s\033[0m\n", $$1, $$2 }' \
		$(MAKEFILE_LIST)
	@echo ""

# --------------------------------------------------------------------------- #
.PHONY: all clean fclean re \
	up down restart ps logs pull health \
	build build-% build-optimized tag push push-bake images image-sizes \
	tests test-phase% test-postgres \
	migrate migrate-mongo migrate-down migrate-status \
	secrets secrets-validate secrets-rotate check-secrets \
	observe observe-down grafana prometheus \
	adapter-add adapter-ls \
	play play-css play-down play-logs \
	env preflight hooks update help \
	_require-docker _require-compose _rm-stale
