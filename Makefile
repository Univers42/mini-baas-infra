SHELL := /bin/bash
.SHELLFLAGS := -ec

# Colors
BLUE    := \033[0;34m
GREEN   := \033[0;32m
YELLOW  := \033[1;33m
RED     := \033[0;31m
CYAN    := \033[0;36m
NC      := \033[0m
BOLD    := \033[1m
DIM     := \033[2m

COMPOSE_CMD := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; elif command -v docker-compose >/dev/null 2>&1; then echo "docker-compose"; fi)
COMPOSE_VERSION := $(shell if docker compose version >/dev/null 2>&1; then docker compose version --short; elif command -v docker-compose >/dev/null 2>&1; then docker-compose version --short 2>/dev/null || docker-compose version | head -n 1; else echo "not installed"; fi)

check-k8s: check-minikube check-kubectl ## Check if Kubernetes is set up correctly
	@echo -e "$(GREEN)Kubernetes is set up correctly!$(NC)"

check-minikube: ## Check if minikube is installed
	@command -v minikube >/dev/null 2>&1 || { echo >&2 "Minikube is not installed. Please install it from https://minikube.sigs.k8s.io/docs/start/"; exit 1; }

check-kubectl: ## Check if kubectl is installed
	@command -v kubectl >/dev/null 2>&1 || { echo >&2 "kubectl is not installed. Please install it from https://kubernetes.io/docs/tasks/tools/"; exit 1; }

check-docker: ## Check if docker is installed
	@command -v docker >/dev/null 2>&1 || { echo >&2 "Docker is not installed. Please install Docker Engine/Desktop first."; exit 1; }

check-compose: check-docker ## Check if Docker Compose is available
	@if [ -z "$(COMPOSE_CMD)" ]; then \
		echo >&2 "Docker Compose is not available. Use Docker with the compose plugin or install docker-compose."; \
		exit 1; \
	fi

status: check-k8s ## Check the status of the minikube cluster
	@minikube status

create-deployments: check-k8s ## Create deployments for all services in the cluster
	@kubectl create deployment trinodb --image=trinodb/trino
	@kubectl create deployment gotrue --image=supabase/gotrue:v2.188.1
	@kubectl create deployment postgrest --image=postgrest/postgrest:devel
	@kubectl create deployment realtime --image=supabase/realtime
	@kubectl create deployment minio --image=minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1
	@kubectl create deployment redis --image=redis:trixie
	@kubectl create deployment supavisor --image=supabase/supavisor:2.7.4
	@kubectl create deployment supabasestudio --image=supabase/studio

delete-deployments: check-k8s ## Delete all deployments in the cluster
	@kubectl delete deployment trinodb gotrue postgrest realtime minio redis supavisor supabasestudio || true

dashboard: check-k8s ## Open the minikube dashboard
	@minikube dashboard

start: check-k8s ## Start the minikube cluster
	@minikube start

stop: check-k8s ## Stop the minikube cluster
	@minikube stop

compose-up: check-compose ## Start all local Docker Compose services
	@$(COMPOSE_CMD) up -d

compose-down: check-compose ## Stop all local Docker Compose services
	@$(COMPOSE_CMD) down

compose-restart: check-compose ## Restart all local Docker Compose services
	@$(COMPOSE_CMD) restart

compose-logs: check-compose ## Follow Docker Compose logs
	@$(COMPOSE_CMD) logs -f --tail=200

compose-ps: check-compose ## Show Docker Compose service status
	@$(COMPOSE_CMD) ps --format "table {{.Name}}\t{{.State}}\t{{.Ports}}"

build-compose-up: check-compose ## Build Docker Compose services
	@docker compose -f docker-compose.build.yml up --build

build-compose-stop: check-compose ## Stop and remove Docker Compose services, then build with docker-compose.build.yml
	@docker compose -f docker-compose.build.yml up --build

build-compose-down: check-compose ## Stop and remove Docker Compose services, then build with docker-compose.build.yml
	@docker compose -f docker-compose.build.yml down

build-compose-logs: check-compose ## Follow Docker Compose logs for build services
	@docker compose -f docker-compose.build.yml logs -f --tail=200

build-compose-ps: check-compose ## Show Docker Compose service status for build services
	@docker compose -f docker-compose.build.yml ps --format "table {{.Name}}\t{{.State}}\t{{.Ports}}"

build-compose-images: check-compose ## Build Docker Compose images for build services
	@docker compose -f docker-compose.build.yml build

build-compose-restart: check-compose ## Restart Docker Compose services for build services
	@docker compose -f docker-compose.build.yml restart

build-compose-clean: check-compose ## Stop and remove Docker Compose services for build services, then remove images
	@docker compose -f docker-compose.build.yml down --rmi all

help: ## ❓ Show this help message
	@echo ""
	@echo -e "$(BOLD)mini-baas-infrastructure - Available Commands$(NC)"
	@echo -e "$(DIM)Compose: $(COMPOSE_CMD) $(COMPOSE_VERSION)$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

.PHONY: check-k8s check-minikube check-kubectl check-docker check-compose status create-deployments delete-deployments start stop compose-up compose-down compose-logs compose-ps help