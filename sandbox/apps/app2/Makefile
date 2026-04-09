# ============================================================
# Makefile — Savanna Park Zoo  (sandbox/apps/app2)
#
# One-command workflow to run the zoo website on the real BaaS:
#
#   make all          Build the frontend, start BaaS, seed DB, serve
#   make dev          Start Vite dev server (hot-reload, no Docker)
#   make seed         Seed the zoo database (re-runnable)
#   make reset        Drop + reseed the zoo database
#   make build        Build the Vite frontend to dist/
#   make serve        Serve the built frontend via Docker (nginx)
#   make down         Stop the zoo frontend container
#   make clean        Remove dist/ and stop container
#   make logs         Tail zoo frontend logs
#   make status       Show BaaS stack + zoo container status
#   make help         Show this help
# ============================================================

# ── Paths ─────────────────────────────────────────────────────
ROOT_DIR    := $(shell cd ../../.. && pwd)
APP_DIR     := $(shell pwd)
FRONT_DIR   := $(APP_DIR)/front
INFRA_DIR   := $(APP_DIR)/infra

# ── BaaS connection (auto-read from root .env if present) ────
-include $(ROOT_DIR)/.env
PG_HOST     ?= localhost
PG_PORT     ?= 5432
PG_USER     ?= $(or $(POSTGRES_USER),postgres)
PG_PASS     ?= $(or $(POSTGRES_PASSWORD),postgres)
PG_DB       ?= $(or $(POSTGRES_DB),postgres)
KONG_URL    ?= http://localhost:8000
API_KEY     ?= $(or $(KONG_PUBLIC_API_KEY),public-anon-key)
ZOO_PASS    ?= zoo-admin-2024

export PG_HOST PG_PORT PG_USER PG_PASS PG_DB KONG_URL API_KEY

# ── Docker compose ───────────────────────────────────────────
DC          := docker compose
DC_ROOT     := $(DC) -f $(ROOT_DIR)/docker-compose.yml
DC_ZOO      := $(DC) -f $(APP_DIR)/docker-compose.yml

# ─── Colours ─────────────────────────────────────────────────
G := \033[1;32m
Y := \033[1;33m
C := \033[1;36m
R := \033[0m

.PHONY: all dev build serve seed reset down clean logs status baas-up baas-down help

# ── Default: full pipeline ────────────────────────────────────
all: build baas-up seed serve
	@printf "$(G)═══════════════════════════════════════════$(R)\n"
	@printf "$(G) ✓ Savanna Park Zoo is running!$(R)\n"
	@printf "$(G)   Website:   http://localhost:5180$(R)\n"
	@printf "$(G)   Dashboard: http://localhost:5180/dashboard$(R)\n"
	@printf "$(G)   Login:     sophie.laurent@savanna-zoo.com$(R)\n"
	@printf "$(G)   Password:  $(ZOO_PASS)$(R)\n"
	@printf "$(G)═══════════════════════════════════════════$(R)\n"

# ── Start BaaS infrastructure ────────────────────────────────
baas-up:
	@printf "$(Y)▸ Starting BaaS infrastructure …$(R)\n"
	@if [ ! -f "$(ROOT_DIR)/.env" ]; then \
		printf "$(Y)  Generating .env …$(R)\n"; \
		cd $(ROOT_DIR) && bash scripts/generate-env.sh; \
	fi
	@# Ensure CORS allows the zoo frontend origins (dev + prod)
	@if grep -q 'KONG_CORS_ORIGIN_APP=' "$(ROOT_DIR)/.env"; then \
		sed -i 's|KONG_CORS_ORIGIN_APP=.*|KONG_CORS_ORIGIN_APP=http://localhost:5173|' "$(ROOT_DIR)/.env"; \
		sed -i 's|KONG_CORS_ORIGIN_PLAYGROUND=.*|KONG_CORS_ORIGIN_PLAYGROUND=http://localhost:5180|' "$(ROOT_DIR)/.env"; \
	fi
	@# Avoid port conflict: if 4000 is busy, remap Realtime to 4002
	@if ss -tln | grep -q ':4000 '; then \
		if ! docker ps --format '{{.Names}}' | grep -q 'mini-baas-realtime'; then \
			printf "$(Y)  Port 4000 in use — remapping Realtime to 4002$(R)\n"; \
			if grep -q '^REALTIME_PORT=' "$(ROOT_DIR)/.env"; then \
				sed -i 's|^REALTIME_PORT=.*|REALTIME_PORT=4002|' "$(ROOT_DIR)/.env"; \
			else \
				echo 'REALTIME_PORT=4002' >> "$(ROOT_DIR)/.env"; \
			fi; \
		fi; \
	fi
	$(DC_ROOT) up -d
	@printf "$(Y)  Waiting for core services (postgres, kong, gotrue, postgrest) …$(R)\n"
	@for svc in postgres kong gotrue postgrest; do \
		for i in $$(seq 1 30); do \
			if docker inspect --format='{{.State.Health.Status}}' mini-baas-$$svc 2>/dev/null | grep -q healthy; then break; fi; \
			if docker inspect --format='{{.State.Status}}' mini-baas-$$svc 2>/dev/null | grep -q running; then \
				if ! docker inspect --format='{{.State.Health}}' mini-baas-$$svc 2>/dev/null | grep -q Status; then break; fi; \
			fi; \
			sleep 1; \
		done; \
	done
	@printf "$(G)  ✓ BaaS stack is running$(R)\n"

baas-down:
	$(DC_ROOT) down

# ── Seed / reset database ────────────────────────────────────
seed:
	@printf "$(Y)▸ Seeding zoo database …$(R)\n"
	@ZOO_PASSWORD="$(ZOO_PASS)" bash $(INFRA_DIR)/init.sh
	@printf "$(G)  ✓ Database seeded$(R)\n"

reset:
	@printf "$(Y)▸ Resetting zoo database …$(R)\n"
	@FORCE=1 ZOO_PASSWORD="$(ZOO_PASS)" bash $(INFRA_DIR)/init.sh
	@printf "$(G)  ✓ Database reset$(R)\n"

# ── Build the frontend ───────────────────────────────────────
build:
	@printf "$(Y)▸ Building frontend …$(R)\n"
	cd $(FRONT_DIR) && pnpm install --frozen-lockfile 2>/dev/null || cd $(FRONT_DIR) && pnpm install
	cd $(FRONT_DIR) && pnpm build
	@printf "$(G)  ✓ Frontend built → front/dist/$(R)\n"

# ── Serve via Docker (nginx) ─────────────────────────────────
serve:
	@if [ ! -d "$(FRONT_DIR)/dist" ]; then \
		printf "$(R)Error: front/dist/ missing. Run 'make build' first.$(R)\n"; \
		exit 1; \
	fi
	@printf "$(Y)▸ Starting zoo frontend container …$(R)\n"
	$(DC_ZOO) up -d
	@printf "$(G)  ✓ Frontend served at http://localhost:5180$(R)\n"

# ── Dev mode (Vite HMR, no Docker for frontend) ──────────────
dev:
	@printf "$(C)▸ Starting Vite dev server (http://localhost:5173) …$(R)\n"
	@printf "$(C)  Make sure BaaS is running: make baas-up seed$(R)\n"
	cd $(FRONT_DIR) && pnpm dev

# ── Housekeeping ─────────────────────────────────────────────
down:
	$(DC_ZOO) down

clean: down
	rm -rf $(FRONT_DIR)/dist
	@printf "$(G)  ✓ Cleaned$(R)\n"

logs:
	$(DC_ZOO) logs -f

status:
	@printf "$(C)── BaaS Stack ──────────────────────────────$(R)\n"
	@$(DC_ROOT) ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "(not running)"
	@printf "\n$(C)── Zoo Frontend ────────────────────────────$(R)\n"
	@$(DC_ZOO) ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "(not running)"

# ── Help ─────────────────────────────────────────────────────
help:
	@printf "$(C)Savanna Park Zoo — Makefile targets$(R)\n\n"
	@printf "  $(G)make all$(R)        Full pipeline: build → start BaaS → seed → serve\n"
	@printf "  $(G)make dev$(R)        Vite dev server with HMR (port 5173)\n"
	@printf "  $(G)make build$(R)      Build the frontend to front/dist/\n"
	@printf "  $(G)make baas-up$(R)    Start the BaaS infrastructure\n"
	@printf "  $(G)make seed$(R)       Seed zoo data into the BaaS\n"
	@printf "  $(G)make reset$(R)      Drop + reseed zoo data\n"
	@printf "  $(G)make serve$(R)      Serve built frontend via Docker\n"
	@printf "  $(G)make down$(R)       Stop zoo frontend container\n"
	@printf "  $(G)make clean$(R)      Remove dist/ and stop container\n"
	@printf "  $(G)make logs$(R)       Tail zoo frontend logs\n"
	@printf "  $(G)make status$(R)     Show running containers\n"
	@printf "  $(G)make help$(R)       Show this help\n"
	@printf "\n$(Y)Environment:$(R)\n"
	@printf "  PG_HOST=$(PG_HOST)  PG_PORT=$(PG_PORT)  PG_USER=$(PG_USER)\n"
	@printf "  KONG_URL=$(KONG_URL)  API_KEY=$(API_KEY)\n"
	@printf "  ZOO_PASS=$(ZOO_PASS)\n"
