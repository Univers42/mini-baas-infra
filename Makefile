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

# Configuration variables
REGISTRY ?= localhost:5000
IMAGE_TAG ?= latest
ENVIRONMENT ?= local
NAMESPACE ?= default
KUSTOMIZE_DIR ?= deployments/overlays/$(ENVIRONMENT)

# check-k8s: check-minikube check-kubectl ## Check if Kubernetes is set up correctly
# 	@echo -e "$(GREEN)Kubernetes is set up correctly!$(NC)"

# check-minikube: ## Check if minikube is installed
# 	@command -v minikube >/dev/null 2>&1 || { echo >&2 "Minikube is not installed. Please install it from https://minikube.sigs.k8s.io/docs/start/"; exit 1; }

# check-kubectl: ## Check if kubectl is installed
# 	@command -v kubectl >/dev/null 2>&1 || { echo >&2 "kubectl is not installed. Please install it from https://kubernetes.io/docs/tasks/tools/"; exit 1; }

check-docker: ## Check if docker is installed
	@command -v docker >/dev/null 2>&1 || { echo >&2 "Docker is not installed. Please install Docker Engine/Desktop first."; exit 1; }

check-compose: check-docker ## Check if Docker Compose is available
	@if [ -z "$(COMPOSE_CMD)" ]; then \
		echo >&2 "Docker Compose is not available. Use Docker with the compose plugin or install docker-compose."; \
		exit 1; \
	fi

# status: check-k8s ## Check the status of the minikube cluster
# 	@minikube status

# create-deployments: check-k8s ## Create deployments for all services in the cluster
# 	@kubectl create deployment trinodb --image=trinodb/trino
# 	@kubectl create deployment gotrue --image=supabase/gotrue:v2.188.1
# 	@kubectl create deployment postgrest --image=postgrest/postgrest:devel
# 	@kubectl create deployment realtime --image=supabase/realtime
# 	@kubectl create deployment minio --image=minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1
# 	@kubectl create deployment redis --image=redis:trixie
# 	@kubectl create deployment supavisor --image=supabase/supavisor:2.7.4
# 	@kubectl create deployment supabasestudio --image=supabase/studio

# delete-deployments: check-k8s ## Delete all deployments in the cluster
# 	@kubectl delete deployment trinodb gotrue postgrest realtime minio redis supavisor supabasestudio || true

# dashboard: check-k8s ## Open the minikube dashboard
# 	@minikube dashboard

# start: check-k8s ## Start the minikube cluster
# 	@minikube start

# stop: check-k8s ## Stop the minikube cluster
# 	@minikube stop

# compose-up: check-compose ## Start all local Docker Compose services
# 	@$(COMPOSE_CMD) up -d

# compose-down: check-compose ## Stop all local Docker Compose services
# 	@$(COMPOSE_CMD) down

# compose-restart: check-compose ## Restart all local Docker Compose services
# 	@$(COMPOSE_CMD) restart

# compose-logs: check-compose ## Follow Docker Compose logs
# 	@$(COMPOSE_CMD) logs -f --tail=200

# compose-ps: check-compose ## Show Docker Compose service status
# 	@$(COMPOSE_CMD) ps --format "table {{.Name}}\t{{.State}}\t{{.Ports}}"

# build-compose-up: check-compose ## Build Docker Compose services
# 	@docker compose -f docker-compose.build.yml up --build

# build-compose-stop: check-compose ## Stop and remove Docker Compose services, then build with docker-compose.build.yml
# 	@docker compose -f docker-compose.build.yml up --build

# build-compose-down: check-compose ## Stop and remove Docker Compose services, then build with docker-compose.build.yml
# 	@docker compose -f docker-compose.build.yml down

# build-compose-logs: check-compose ## Follow Docker Compose logs for build services
# 	@docker compose -f docker-compose.build.yml logs -f --tail=200

# build-compose-ps: check-compose ## Show Docker Compose service status for build services
# 	@docker compose -f docker-compose.build.yml ps --format "table {{.Name}}\t{{.State}}\t{{.Ports}}"

# build-compose-images: check-compose ## Build Docker Compose images for build services
# 	@docker compose -f docker-compose.build.yml build

# build-compose-restart: check-compose ## Restart Docker Compose services for build services
# 	@docker compose -f docker-compose.build.yml restart

# build-compose-clean: check-compose ## Stop and remove Docker Compose services for build services, then remove images
# 	@docker compose -f docker-compose.build.yml down --rmi all

# ============================================================================
# Docker Image Management
# ============================================================================

docker-build: check-docker ## Build all service Docker images
	@echo -e "$(BLUE)Building Docker images...$(NC)"
	@docker compose -f docker-compose.build.yml build

docker-build-no-cache: check-docker ## Build all Docker images without cache
	@echo -e "$(BLUE)Building Docker images (no cache)...$(NC)"
	@docker compose -f docker-compose.build.yml build --no-cache

docker-build-%: check-docker ## Build specific service image (e.g., make docker-build-api-gateway)
	@echo -e "$(BLUE)Building Docker image for $*...$(NC)"
	@docker build -t mini-baas/$*:$(IMAGE_TAG) deployments/base/$*/

docker-tag: check-docker ## Tag all images for registry (REGISTRY=myregistry.com make docker-tag)
	@echo -e "$(BLUE)Tagging Docker images for registry: $(REGISTRY)$(NC)"
	@docker tag mini-baas/api-gateway:$(IMAGE_TAG) $(REGISTRY)/api-gateway:$(IMAGE_TAG)
	@docker tag mini-baas/auth-service:$(IMAGE_TAG) $(REGISTRY)/auth-service:$(IMAGE_TAG)
	@docker tag mini-baas/dynamic-api:$(IMAGE_TAG) $(REGISTRY)/dynamic-api:$(IMAGE_TAG)
	@docker tag mini-baas/schema-service:$(IMAGE_TAG) $(REGISTRY)/schema-service:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ Images tagged$(NC)"

docker-push: docker-tag ## Push all tagged images to registry (REGISTRY=myregistry.com make docker-push)
	@echo -e "$(BLUE)Pushing Docker images to $(REGISTRY)...$(NC)"
	@docker push $(REGISTRY)/api-gateway:$(IMAGE_TAG)
	@docker push $(REGISTRY)/auth-service:$(IMAGE_TAG)
	@docker push $(REGISTRY)/dynamic-api:$(IMAGE_TAG)
	@docker push $(REGISTRY)/schema-service:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ All images pushed$(NC)"

docker-images: check-docker ## Show built Docker images
	@echo -e "$(BLUE)Mini-BaaS Docker images:$(NC)"
	@docker images | grep mini-baas || echo "No images found. Run 'make docker-build' first."

docker-clean: check-docker ## Remove all mini-baas Docker images
	@echo -e "$(YELLOW)Removing Docker images for mini-baas services...$(NC)"
	@docker rmi -f $(shell docker images -q mini-baas/* 2>/dev/null) 2>/dev/null || echo "No images to remove"
	@echo -e "$(GREEN)✓ Images cleaned$(NC)"

# ============================================================================
# Kubernetes Deployment Management
# ============================================================================

check-kubectl: ## Check if kubectl is installed
	@command -v kubectl >/dev/null 2>&1 || { echo >&2 "kubectl is not installed. Please install it from https://kubernetes.io/docs/tasks/tools/"; exit 1; }

check-minikube: ## Check if minikube is installed
	@command -v minikube >/dev/null 2>&1 || { echo >&2 "minikube is not installed. Please install it from https://minikube.sigs.k8s.io/docs/start/"; exit 1; }

check-kustomize: ## Check if kustomize is installed
	@command -v kustomize >/dev/null 2>&1 || { echo >&2 "kustomize is not installed. Install via: brew install kustomize"; exit 1; }

check-k8s-cluster: check-kubectl ## Check if Kubernetes cluster is accessible
	@kubectl cluster-info >/dev/null 2>&1 || { echo >&2 "$(RED)✗ Kubernetes cluster not accessible$(NC)"; echo >&2 "Make sure your K8s cluster is running:"; echo >&2 "  - minikube start     (for local minikube)"; echo >&2 "  - docker desktop     (enable K8s in Docker Desktop)"; echo >&2 "  - kubectl config     (ensure kubeconfig is valid)"; exit 1; }

k8s-load-local-images: check-minikube check-k8s-cluster ## Load local images into minikube
	@echo -e "$(BLUE)Loading local Docker images into minikube...$(NC)"
	@minikube image load mini-baas/api-gateway:$(IMAGE_TAG)
	@minikube image load mini-baas/auth-service:$(IMAGE_TAG)
	@minikube image load mini-baas/dynamic-api:$(IMAGE_TAG)
	@minikube image load mini-baas/schema-service:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ Local images loaded into minikube$(NC)"

k8s-deploy: check-kubectl check-kustomize check-k8s-cluster docker-build ## Build images and deploy to Kubernetes (ENVIRONMENT=local)
	@echo -e "$(BLUE)Deploying to Kubernetes cluster ($(ENVIRONMENT))...$(NC)"
	@if [ "$(ENVIRONMENT)" = "local" ]; then \
		$(MAKE) k8s-load-local-images IMAGE_TAG=$(IMAGE_TAG); \
	fi
	@kubectl apply -k $(KUSTOMIZE_DIR) --validate=false || { echo -e "$(RED)✗ Deployment failed$(NC)"; exit 1; }
	@echo -e "$(GREEN)✓ Deployment complete$(NC)"

k8s-deploy-local: ## Build images, load into minikube, and deploy to Kubernetes (ENVIRONMENT=local)
	@$(MAKE) docker-clean
	@$(MAKE) docker-build
	@$(MAKE) k8s-load-local-images
	@$(MAKE) k8s-deploy

k8s-preview: check-kustomize ## Preview Kubernetes manifests without deploying (ENVIRONMENT=local)
	@echo -e "$(BLUE)Kubernetes manifests for $(ENVIRONMENT):$(NC)"
	@kustomize build $(KUSTOMIZE_DIR)

k8s-apply: check-kubectl check-kustomize check-k8s-cluster ## Apply Kubernetes manifests (ENVIRONMENT=local)
	@echo -e "$(BLUE)Applying Kubernetes manifests to cluster ($(ENVIRONMENT))...$(NC)"
	@kubectl apply -k $(KUSTOMIZE_DIR) --validate=false || { echo -e "$(RED)✗ Apply failed$(NC)"; exit 1; }
	@echo -e "$(GREEN)✓ Applied$(NC)"

k8s-update-images: check-kubectl ## Update image tags in running deployments
	@echo -e "$(BLUE)Updating image tags ($(IMAGE_TAG)) in Kubernetes cluster...$(NC)"
	@kubectl set image deployment/api-gateway api-gateway=$(REGISTRY)/api-gateway:$(IMAGE_TAG) -n $(NAMESPACE) || true
	@kubectl set image deployment/auth-service auth-service=$(REGISTRY)/auth-service:$(IMAGE_TAG) -n $(NAMESPACE) || true
	@kubectl set image deployment/dynamic-api dynamic-api=$(REGISTRY)/dynamic-api:$(IMAGE_TAG) -n $(NAMESPACE) || true
	@kubectl set image deployment/schema-service schema-service=$(REGISTRY)/schema-service:$(IMAGE_TAG) -n $(NAMESPACE) || true
	@echo -e "$(GREEN)✓ Images updated$(NC)"

k8s-delete: check-kubectl ## Delete all mini-baas deployments from Kubernetes
	@echo -e "$(YELLOW)Deleting deployments from Kubernetes...$(NC)"
	@kubectl delete deployment api-gateway auth-service dynamic-api schema-service -n $(NAMESPACE) --ignore-not-found
	@kubectl delete service api-gateway auth-service dynamic-api schema-service -n $(NAMESPACE) --ignore-not-found
	@echo -e "$(GREEN)✓ Deployments deleted$(NC)"

k8s-status: check-kubectl ## Show Kubernetes deployment status
	@echo -e "$(BLUE)Kubernetes Deployment Status (Namespace: $(NAMESPACE)):$(NC)"
	@kubectl get deployments -n $(NAMESPACE) -l app.mini-baas/managed-by=kustomize -o wide || echo "No deployments found"
	@echo ""
	@echo -e "$(BLUE)Pods:$(NC)"
	@kubectl get pods -n $(NAMESPACE) -l app.mini-baas/managed-by=kustomize -o wide || echo "No pods found"
	@echo ""
	@echo -e "$(BLUE)Services:$(NC)"
	@kubectl get services -n $(NAMESPACE) -l app.mini-baas/managed-by=kustomize -o wide || echo "No services found"

k8s-logs: check-kubectl ## Show logs for a service (SERVICE=api-gateway make k8s-logs)
	@echo -e "$(BLUE)Logs for $(SERVICE) (Namespace: $(NAMESPACE)):$(NC)"
	@kubectl logs -n $(NAMESPACE) -l app=$(SERVICE) --all-containers=true --tail=100 -f

k8s-describe: check-kubectl ## Describe a service deployment (SERVICE=api-gateway make k8s-describe)
	@echo -e "$(BLUE)Deployment details for $(SERVICE) (Namespace: $(NAMESPACE)):$(NC)"
	@kubectl describe deployment $(SERVICE) -n $(NAMESPACE) || echo "Deployment not found"

k8s-port-forward: check-kubectl ## Port forward to a service (SERVICE=api-gateway PORT=3000 make k8s-port-forward)
	@echo -e "$(BLUE)Port forwarding $(SERVICE) to localhost:$(PORT)$(NC)"
	@kubectl port-forward -n $(NAMESPACE) svc/$(SERVICE) $(PORT):$(PORT)

k8s-scale: check-kubectl ## Scale a deployment (SERVICE=api-gateway REPLICAS=3 make k8s-scale)
	@echo -e "$(BLUE)Scaling $(SERVICE) to $(REPLICAS) replicas...$(NC)"
	@kubectl scale deployment/$(SERVICE) --replicas=$(REPLICAS) -n $(NAMESPACE)
	@echo -e "$(GREEN)✓ Scaled$(NC)"

k8s-restart: check-kubectl ## Restart a deployment (SERVICE=api-gateway make k8s-restart)
	@echo -e "$(BLUE)Restarting $(SERVICE)...$(NC)"
	@kubectl rollout restart deployment/$(SERVICE) -n $(NAMESPACE)
	@echo -e "$(GREEN)✓ Restarted$(NC)"

k8s-rollback: check-kubectl ## Rollback last deployment change (SERVICE=api-gateway make k8s-rollback)
	@echo -e "$(YELLOW)Rolling back $(SERVICE)...$(NC)"
	@kubectl rollout undo deployment/$(SERVICE) -n $(NAMESPACE)
	@echo -e "$(GREEN)✓ Rolled back$(NC)"

k8s-events: check-kubectl ## Show recent Kubernetes events
	@echo -e "$(BLUE)Recent events in $(NAMESPACE):$(NC)"
	@kubectl get events -n $(NAMESPACE) --sort-by='.lastTimestamp' | tail -20

# ============================================================================
# CI/CD Integration Targets
# ============================================================================

build-and-push: docker-build docker-push ## Build all images and push to registry
	@echo -e "$(GREEN)✓ All images built and pushed$(NC)"

deploy-staging: ENVIRONMENT=staging
deploy-staging: REGISTRY?=registry.example.com
deploy-staging: IMAGE_TAG?=staging-latest
deploy-staging: k8s-deploy ## Build and deploy to staging environment

deploy-production: ENVIRONMENT=production
deploy-production: REGISTRY?=registry.example.com
deploy-production: IMAGE_TAG?=v1.0.0
deploy-production: k8s-deploy ## Build and deploy to production environment

help: ## ❓ Show this help message
	@echo ""
	@echo -e "$(BOLD)mini-baas-infrastructure - Available Commands$(NC)"
	@echo -e "$(DIM)Compose: $(COMPOSE_CMD) $(COMPOSE_VERSION)$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-25s$(NC) %s\n", $$1, $$2}'
	@echo ""


.PHONY: check-docker check-compose check-kubectl check-minikube check-kustomize check-k8s-cluster \
	docker-build docker-build-no-cache docker-tag docker-push docker-images docker-clean \
	k8s-load-local-images k8s-deploy k8s-preview k8s-apply k8s-update-images k8s-delete k8s-status k8s-logs k8s-describe k8s-port-forward k8s-scale k8s-restart k8s-rollback k8s-events \
	build-and-push deploy-staging deploy-production \
	build-compose-up build-compose-down build-compose-images build-compose-logs build-compose-ps build-compose-clean \
	help