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

# Configuration variables
NO_PRINT = --no-print-directory
REGISTRY ?= localhost:5000
IMAGE_TAG ?= latest
ENVIRONMENT ?= local
NAMESPACE ?= default
KUSTOMIZE_DIR ?= deployments/overlays/$(ENVIRONMENT)
SERVICES ?= api-gateway auth-service dynamic-api schema-service
K8S_WAIT_TIMEOUT ?= 180s
MINIKUBE_CPUS ?= 4
MINIKUBE_MEMORY ?= 8192
MINIKUBE_DISK_SIZE ?= 30g

check-docker: ## Check if docker is installed
	@command -v docker >/dev/null 2>&1 || { echo >&2 "Docker is not installed. Please install Docker Engine/Desktop first."; exit 1; }

# ============================================================================
# Docker Image Management
# ============================================================================

docker-build: ## Build all service Docker images
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Building Docker images...$(NC)"
	@docker build -t mini-baas/api-gateway:$(IMAGE_TAG) deployments/base/api-gateway
	@docker build -t mini-baas/auth-service:$(IMAGE_TAG) deployments/base/auth-service
	@docker build -t mini-baas/dynamic-api:$(IMAGE_TAG) deployments/base/dynamic-api
	@docker build -t mini-baas/schema-service:$(IMAGE_TAG) deployments/base/schema-service
	@echo -e "$(GREEN)✓ Docker images built$(NC)"

docker-build-no-cache: ## Build all Docker images without cache
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Building Docker images (no cache)...$(NC)"
	@docker build --no-cache -t mini-baas/api-gateway:$(IMAGE_TAG) deployments/base/api-gateway
	@docker build --no-cache -t mini-baas/auth-service:$(IMAGE_TAG) deployments/base/auth-service
	@docker build --no-cache -t mini-baas/dynamic-api:$(IMAGE_TAG) deployments/base/dynamic-api
	@docker build --no-cache -t mini-baas/schema-service:$(IMAGE_TAG) deployments/base/schema-service
	@echo -e "$(GREEN)✓ Docker images built (no cache)$(NC)"

docker-build-%: ## Build specific service image (e.g., make docker-build-api-gateway)
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Building Docker image for $*...$(NC)"
	@docker build -t mini-baas/$*:$(IMAGE_TAG) deployments/base/$*/

docker-tag: ## Tag all images for registry (REGISTRY=myregistry.com make docker-tag)
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Tagging Docker images for registry: $(REGISTRY)$(NC)"
	@docker tag mini-baas/api-gateway:$(IMAGE_TAG) $(REGISTRY)/api-gateway:$(IMAGE_TAG)
	@docker tag mini-baas/auth-service:$(IMAGE_TAG) $(REGISTRY)/auth-service:$(IMAGE_TAG)
	@docker tag mini-baas/dynamic-api:$(IMAGE_TAG) $(REGISTRY)/dynamic-api:$(IMAGE_TAG)
	@docker tag mini-baas/schema-service:$(IMAGE_TAG) $(REGISTRY)/schema-service:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ Images tagged$(NC)"

docker-push: ## Push all tagged images to registry (REGISTRY=myregistry.com make docker-push)
	@$(MAKE) $(NO_PRINT) docker-tag
	@echo -e "$(BLUE)Pushing Docker images to $(REGISTRY)...$(NC)"
	@docker push $(REGISTRY)/api-gateway:$(IMAGE_TAG)
	@docker push $(REGISTRY)/auth-service:$(IMAGE_TAG)
	@docker push $(REGISTRY)/dynamic-api:$(IMAGE_TAG)
	@docker push $(REGISTRY)/schema-service:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ All images pushed$(NC)"

docker-images: ## Show built Docker images
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Mini-BaaS Docker images:$(NC)"
	@docker images | grep mini-baas || echo "No images found. Run 'make docker-build' first."

docker-clean: ## Remove all mini-baas Docker images
	@$(MAKE) $(NO_PRINT) check-docker
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

minikube-start: ## Start minikube if not running
	@$(MAKE) $(NO_PRINT) check-minikube
	@if [ "$(ENVIRONMENT)" != "local" ]; then \
		echo -e "$(DIM)Skipping minikube start (ENVIRONMENT=$(ENVIRONMENT))$(NC)"; \
		exit 0; \
	fi
	@if minikube status --format='{{.Host}}' 2>/dev/null | grep -qi "Running"; then \
		echo -e "$(GREEN)✓ minikube is already running$(NC)"; \
	else \
		echo -e "$(BLUE)Starting minikube (cpus=$(MINIKUBE_CPUS), memory=$(MINIKUBE_MEMORY), disk=$(MINIKUBE_DISK_SIZE))...$(NC)"; \
		minikube start --cpus=$(MINIKUBE_CPUS) --memory=$(MINIKUBE_MEMORY) --disk-size=$(MINIKUBE_DISK_SIZE); \
		echo -e "$(GREEN)✓ minikube started$(NC)"; \
	fi

check-kustomize: ## Check if kustomize is installed
	@command -v kustomize >/dev/null 2>&1 || { echo >&2 "kustomize is not installed. Install via: brew install kustomize"; exit 1; }

check-k8s-cluster: ## Check if Kubernetes cluster is accessible
	@$(MAKE) $(NO_PRINT) check-kubectl
	@kubectl cluster-info >/dev/null 2>&1 || { echo >&2 "$(RED)✗ Kubernetes cluster not accessible$(NC)"; echo >&2 "Make sure your K8s cluster is running:"; echo >&2 "  - minikube start     (for local minikube)"; echo >&2 "  - docker desktop     (enable K8s in Docker Desktop)"; echo >&2 "  - kubectl config     (ensure kubeconfig is valid)"; exit 1; }

k8s-load-local-images: ## Load local images into minikube
	@$(MAKE) $(NO_PRINT) check-minikube
	@$(MAKE) $(NO_PRINT) check-k8s-cluster
	@echo -e "$(BLUE)Loading local Docker images into minikube...$(NC)"
	@minikube image load mini-baas/api-gateway:$(IMAGE_TAG)
	@minikube image load mini-baas/auth-service:$(IMAGE_TAG)
	@minikube image load mini-baas/dynamic-api:$(IMAGE_TAG)
	@minikube image load mini-baas/schema-service:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ Local images loaded into minikube$(NC)"

k8s-deploy: ## Build images and deploy to Kubernetes (ENVIRONMENT=local)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@$(MAKE) $(NO_PRINT) check-kustomize
	@$(MAKE) $(NO_PRINT) check-k8s-cluster
	@$(MAKE) $(NO_PRINT) docker-build
	@echo -e "$(BLUE)Deploying to Kubernetes cluster ($(ENVIRONMENT))...$(NC)"
	@if [ "$(ENVIRONMENT)" = "local" ]; then \
		$(MAKE) k8s-load-local-images IMAGE_TAG=$(IMAGE_TAG); \
	fi
	@kubectl apply -k $(KUSTOMIZE_DIR) --validate=false || { echo -e "$(RED)✗ Deployment failed$(NC)"; exit 1; }
	@echo -e "$(GREEN)✓ Deployment complete$(NC)"

k8s-deploy-local: ## Build images, load into minikube, and deploy to Kubernetes (ENVIRONMENT=local)
	@$(MAKE) $(NO_PRINT) docker-clean
	@$(MAKE) $(NO_PRINT) docker-build
	@$(MAKE) $(NO_PRINT) k8s-load-local-images
	@$(MAKE) $(NO_PRINT) k8s-deploy

k8s-wait: ## Wait until service deployments are available
	@$(MAKE) $(NO_PRINT) check-kubectl
	@$(MAKE) $(NO_PRINT) check-k8s-cluster
	@echo -e "$(BLUE)Waiting for deployments to become ready ($(ENVIRONMENT))...$(NC)"
	@prefix=""; \
	if [ "$(ENVIRONMENT)" = "local" ]; then \
		prefix="local-"; \
	fi; \
	for svc in $(SERVICES); do \
		deploy_name="$$prefix$$svc"; \
		if kubectl get deployment "$$deploy_name" -n $(NAMESPACE) >/dev/null 2>&1; then \
			echo -e "$(CYAN)→ rollout status deployment/$$deploy_name$(NC)"; \
			kubectl rollout status deployment/"$$deploy_name" -n $(NAMESPACE) --timeout=$(K8S_WAIT_TIMEOUT); \
		else \
			echo -e "$(YELLOW)• deployment/$$deploy_name not found, skipping$(NC)"; \
		fi; \
	done
	@echo -e "$(GREEN)✓ Rollouts complete$(NC)"

k8s-local-url: ## Show local api-gateway URL
	@$(MAKE) $(NO_PRINT) check-minikube
	@echo -e "$(BLUE)Local access URL:$(NC)"
	@echo "  http://$$(minikube ip):30080/health"

k8s-bootstrap-local: ENVIRONMENT=local
k8s-bootstrap-local: ## One-command local bootstrap (start minikube, build, deploy, wait)
	@$(MAKE) $(NO_PRINT) minikube-start ENVIRONMENT=$(ENVIRONMENT)
	@$(MAKE) $(NO_PRINT) k8s-deploy-local ENVIRONMENT=$(ENVIRONMENT)
	@$(MAKE) $(NO_PRINT) k8s-wait ENVIRONMENT=$(ENVIRONMENT)
	@echo -e "$(GREEN)✓ Local Kubernetes bootstrap complete$(NC)"
	@$(MAKE) $(NO_PRINT) k8s-local-url ENVIRONMENT=$(ENVIRONMENT)

dev-up: ## Alias for one-command local bootstrap
	@$(MAKE) $(NO_PRINT) k8s-bootstrap-local ENVIRONMENT=local

k8s-preview: ## Preview Kubernetes manifests without deploying (ENVIRONMENT=local)
	@$(MAKE) $(NO_PRINT) check-kustomize
	@echo -e "$(BLUE)Kubernetes manifests for $(ENVIRONMENT):$(NC)"
	@kustomize build $(KUSTOMIZE_DIR)

k8s-apply: ## Apply Kubernetes manifests (ENVIRONMENT=local)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@$(MAKE) $(NO_PRINT) check-kustomize
	@$(MAKE) $(NO_PRINT) check-k8s-cluster
	@echo -e "$(BLUE)Applying Kubernetes manifests to cluster ($(ENVIRONMENT))...$(NC)"
	@kubectl apply -k $(KUSTOMIZE_DIR) --validate=false || { echo -e "$(RED)✗ Apply failed$(NC)"; exit 1; }
	@echo -e "$(GREEN)✓ Applied$(NC)"

k8s-update-images: ## Update image tags in running deployments
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Updating image tags ($(IMAGE_TAG)) in Kubernetes cluster...$(NC)"
	@kubectl set image deployment/api-gateway api-gateway=$(REGISTRY)/api-gateway:$(IMAGE_TAG) -n $(NAMESPACE) || true
	@kubectl set image deployment/auth-service auth-service=$(REGISTRY)/auth-service:$(IMAGE_TAG) -n $(NAMESPACE) || true
	@kubectl set image deployment/dynamic-api dynamic-api=$(REGISTRY)/dynamic-api:$(IMAGE_TAG) -n $(NAMESPACE) || true
	@kubectl set image deployment/schema-service schema-service=$(REGISTRY)/schema-service:$(IMAGE_TAG) -n $(NAMESPACE) || true
	@echo -e "$(GREEN)✓ Images updated$(NC)"

k8s-delete: ## Delete all mini-baas deployments from Kubernetes
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(YELLOW)Deleting deployments from Kubernetes...$(NC)"
	@kubectl delete deployment api-gateway auth-service dynamic-api schema-service -n $(NAMESPACE) --ignore-not-found
	@kubectl delete service api-gateway auth-service dynamic-api schema-service -n $(NAMESPACE) --ignore-not-found
	@echo -e "$(GREEN)✓ Deployments deleted$(NC)"

k8s-status: ## Show Kubernetes deployment status
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Kubernetes Deployment Status (Namespace: $(NAMESPACE)):$(NC)"
	@kubectl get deployments -n $(NAMESPACE) -l app.mini-baas/managed-by=kustomize -o wide || echo "No deployments found"
	@echo ""
	@echo -e "$(BLUE)Pods:$(NC)"
	@kubectl get pods -n $(NAMESPACE) -l app.mini-baas/managed-by=kustomize -o wide || echo "No pods found"
	@echo ""
	@echo -e "$(BLUE)Services:$(NC)"
	@kubectl get services -n $(NAMESPACE) -l app.mini-baas/managed-by=kustomize -o wide || echo "No services found"

k8s-logs: ## Show logs for a service (SERVICE=api-gateway make k8s-logs)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Logs for $(SERVICE) (Namespace: $(NAMESPACE)):$(NC)"
	@kubectl logs -n $(NAMESPACE) -l app=$(SERVICE) --all-containers=true --tail=100 -f

k8s-describe: ## Describe a service deployment (SERVICE=api-gateway make k8s-describe)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Deployment details for $(SERVICE) (Namespace: $(NAMESPACE)):$(NC)"
	@kubectl describe deployment $(SERVICE) -n $(NAMESPACE) || echo "Deployment not found"

k8s-port-forward: ## Port forward to a service (SERVICE=api-gateway PORT=3000 make k8s-port-forward)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@svc="$(SERVICE)"; \
	if [ "$(ENVIRONMENT)" = "local" ] && [[ "$$svc" != local-* ]]; then \
		svc="local-$$svc"; \
	fi; \
	echo -e "$(BLUE)Port forwarding $$svc to localhost:$(PORT)$(NC)"; \
	kubectl get svc "$$svc" -n $(NAMESPACE) >/dev/null 2>&1 || { \
		echo -e "$(RED)✗ Service '$$svc' not found in namespace '$(NAMESPACE)'$(NC)"; \
		exit 1; \
	}; \
	kubectl port-forward -n $(NAMESPACE) svc/$$svc $(PORT):$(PORT)

k8s-scale: ## Scale a deployment (SERVICE=api-gateway REPLICAS=3 make k8s-scale)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Scaling $(SERVICE) to $(REPLICAS) replicas...$(NC)"
	@kubectl scale deployment/$(SERVICE) --replicas=$(REPLICAS) -n $(NAMESPACE)
	@echo -e "$(GREEN)✓ Scaled$(NC)"

k8s-restart: ## Restart a deployment (SERVICE=api-gateway make k8s-restart)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Restarting $(SERVICE)...$(NC)"
	@kubectl rollout restart deployment/$(SERVICE) -n $(NAMESPACE)
	@echo -e "$(GREEN)✓ Restarted$(NC)"

k8s-rollback: ## Rollback last deployment change (SERVICE=api-gateway make k8s-rollback)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(YELLOW)Rolling back $(SERVICE)...$(NC)"
	@kubectl rollout undo deployment/$(SERVICE) -n $(NAMESPACE)
	@echo -e "$(GREEN)✓ Rolled back$(NC)"

k8s-events: ## Show recent Kubernetes events
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Recent events in $(NAMESPACE):$(NC)"
	@kubectl get events -n $(NAMESPACE) --sort-by='.lastTimestamp' | tail -20

# ============================================================================
# CI/CD Integration Targets
# ============================================================================

build-and-push: ## Build all images and push to registry
	@$(MAKE) $(NO_PRINT) docker-build
	@$(MAKE) $(NO_PRINT) docker-push
	@echo -e "$(GREEN)✓ All images built and pushed$(NC)"

deploy-staging: ENVIRONMENT=staging
deploy-staging: REGISTRY?=registry.example.com
deploy-staging: IMAGE_TAG?=staging-latest
deploy-staging: ## Build and deploy to staging environment
	@$(MAKE) $(NO_PRINT) k8s-deploy ENVIRONMENT=$(ENVIRONMENT) REGISTRY=$(REGISTRY) IMAGE_TAG=$(IMAGE_TAG)

deploy-production: ENVIRONMENT=production
deploy-production: REGISTRY?=registry.example.com
deploy-production: IMAGE_TAG?=v1.0.0
deploy-production: ## Build and deploy to production environment
	@$(MAKE) $(NO_PRINT) k8s-deploy ENVIRONMENT=$(ENVIRONMENT) REGISTRY=$(REGISTRY) IMAGE_TAG=$(IMAGE_TAG)

dashboard: ## Open Kubernetes dashboard (minikube)
	@minikube dashboard

help: ## ❓ Show this help message
	@echo ""
	@echo -e "$(BOLD)mini-baas-infrastructure - Available Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-25s$(NC) %s\n", $$1, $$2}'
	@echo ""


.PHONY: check-docker check-kubectl check-minikube check-kustomize check-k8s-cluster \
	docker-build docker-build-no-cache docker-tag docker-push docker-images docker-clean \
	minikube-start k8s-load-local-images k8s-deploy k8s-deploy-local k8s-wait k8s-local-url k8s-bootstrap-local dev-up k8s-preview k8s-apply k8s-update-images k8s-delete k8s-status k8s-logs k8s-describe k8s-port-forward k8s-scale k8s-restart k8s-rollback k8s-events \
	build-and-push deploy-staging deploy-production \
	help