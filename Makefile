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
# Local-only project: always deploy Kubernetes resources with local overlay.
override ENVIRONMENT := local
NAMESPACE ?= default
KUSTOMIZE_DIR ?= deployments/overlays/$(ENVIRONMENT)
SERVICES ?= api-gateway auth-service dynamic-api schema-service
K8S_WAIT_TIMEOUT ?= 180s
MINIKUBE_CPUS ?= 4
MINIKUBE_MEMORY ?= 8192
MINIKUBE_DISK_SIZE ?= 30g
RANDOM_TAG_PREFIX ?= dev
SHOW_NEXT_STEPS ?= 1

define print-next
@if [ "$(SHOW_NEXT_STEPS)" = "1" ]; then \
	echo -e "$(DIM)Next: $(1)$(NC)"; \
fi
endef

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
	$(call print-next,Run make k8s-load-local-images IMAGE_TAG=$(IMAGE_TAG) then make k8s-update-images ENVIRONMENT=local IMAGE_TAG=$(IMAGE_TAG).)

docker-build-no-cache: ## Build all Docker images without cache
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Building Docker images (no cache)...$(NC)"
	@docker build --no-cache -t mini-baas/api-gateway:$(IMAGE_TAG) deployments/base/api-gateway
	@docker build --no-cache -t mini-baas/auth-service:$(IMAGE_TAG) deployments/base/auth-service
	@docker build --no-cache -t mini-baas/dynamic-api:$(IMAGE_TAG) deployments/base/dynamic-api
	@docker build --no-cache -t mini-baas/schema-service:$(IMAGE_TAG) deployments/base/schema-service
	@echo -e "$(GREEN)✓ Docker images built (no cache)$(NC)"
	$(call print-next,Run make k8s-load-local-images IMAGE_TAG=$(IMAGE_TAG) for a fresh local cluster image refresh.)

docker-build-%: ## Build specific service image (e.g., make docker-build-api-gateway)
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Building Docker image for $*...$(NC)"
	@docker build -t mini-baas/$*:$(IMAGE_TAG) deployments/base/$*/
	$(call print-next,Run make k8s-load-local-images IMAGE_TAG=$(IMAGE_TAG) then make k8s-restart ENVIRONMENT=local SERVICE=$*.)

docker-tag: ## Tag all images for registry (REGISTRY=myregistry.com make docker-tag)
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Tagging Docker images for registry: $(REGISTRY)$(NC)"
	@docker tag mini-baas/api-gateway:$(IMAGE_TAG) $(REGISTRY)/api-gateway:$(IMAGE_TAG)
	@docker tag mini-baas/auth-service:$(IMAGE_TAG) $(REGISTRY)/auth-service:$(IMAGE_TAG)
	@docker tag mini-baas/dynamic-api:$(IMAGE_TAG) $(REGISTRY)/dynamic-api:$(IMAGE_TAG)
	@docker tag mini-baas/schema-service:$(IMAGE_TAG) $(REGISTRY)/schema-service:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ Images tagged$(NC)"
	$(call print-next,Run make docker-push REGISTRY=$(REGISTRY) IMAGE_TAG=$(IMAGE_TAG).)

docker-push: ## Push all tagged images to registry (REGISTRY=myregistry.com make docker-push)
	@$(MAKE) $(NO_PRINT) docker-tag
	@echo -e "$(BLUE)Pushing Docker images to $(REGISTRY)...$(NC)"
	@docker push $(REGISTRY)/api-gateway:$(IMAGE_TAG)
	@docker push $(REGISTRY)/auth-service:$(IMAGE_TAG)
	@docker push $(REGISTRY)/dynamic-api:$(IMAGE_TAG)
	@docker push $(REGISTRY)/schema-service:$(IMAGE_TAG)
	@echo -e "$(GREEN)✓ All images pushed$(NC)"
	$(call print-next,Run make k8s-update-images ENVIRONMENT=local REGISTRY=$(REGISTRY) IMAGE_TAG=$(IMAGE_TAG).)

docker-images: ## Show built Docker images
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(BLUE)Mini-BaaS Docker images:$(NC)"
	@docker images | grep mini-baas || echo "No images found. Run 'make docker-build' first."
	$(call print-next,Pick an IMAGE_TAG and deploy with make k8s-update-images ENVIRONMENT=local IMAGE_TAG=<tag>.)

docker-clean: ## Remove all mini-baas Docker images
	@$(MAKE) $(NO_PRINT) check-docker
	@echo -e "$(YELLOW)Removing Docker images for mini-baas services...$(NC)"
	@docker rmi -f $(shell docker images -q mini-baas/* 2>/dev/null) 2>/dev/null || echo "No images to remove"
	@echo -e "$(GREEN)✓ Images cleaned$(NC)"
	$(call print-next,Rebuild with make docker-build IMAGE_TAG=<tag>.)

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
	$(call print-next,Run make k8s-deploy-local to build and deploy services.)

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
	$(call print-next,Run make k8s-update-images ENVIRONMENT=local IMAGE_TAG=$(IMAGE_TAG).)

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
	$(call print-next,Run make k8s-wait ENVIRONMENT=$(ENVIRONMENT) to watch rollouts.)

k8s-deploy-local: ## Build images, load into minikube, and deploy to Kubernetes (ENVIRONMENT=local)
	@$(MAKE) $(NO_PRINT) docker-clean
	@$(MAKE) $(NO_PRINT) docker-build
	@$(MAKE) $(NO_PRINT) k8s-load-local-images
	@$(MAKE) $(NO_PRINT) k8s-deploy
	$(call print-next,Run make k8s-wait ENVIRONMENT=local and then make k8s-local-url.)

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
	$(call print-next,Run make k8s-status to inspect pods and services.)

k8s-local-url: ## Show local service URLs
	@$(MAKE) $(NO_PRINT) check-minikube
	@ip="$$(minikube ip)"; \
	echo -e "$(BLUE)Local service URLs:$(NC)"; \
	echo "  api-gateway:   http://$$ip:30080/health"; \
	echo "  auth-service:  http://$$ip:30081/health"; \
	echo "  dynamic-api:   http://$$ip:30082/health"; \
	echo "  schema-service:http://$$ip:30083/health"
	$(call print-next,Use /docs on auth-service, dynamic-api, and schema-service for Swagger UIs.)

k8s-bootstrap-local: ENVIRONMENT=local
k8s-bootstrap-local: ## One-command local bootstrap (start minikube, build, deploy, wait)
	@$(MAKE) $(NO_PRINT) minikube-start ENVIRONMENT=$(ENVIRONMENT)
	@$(MAKE) $(NO_PRINT) k8s-deploy-local ENVIRONMENT=$(ENVIRONMENT)
	@$(MAKE) $(NO_PRINT) k8s-wait ENVIRONMENT=$(ENVIRONMENT)
	@echo -e "$(GREEN)✓ Local Kubernetes bootstrap complete$(NC)"
	@$(MAKE) $(NO_PRINT) k8s-local-url ENVIRONMENT=$(ENVIRONMENT)
	$(call print-next,Run make k8s-status then make k8s-logs ENVIRONMENT=local SERVICE=api-gateway.)

k8s-refresh-local: ENVIRONMENT=local
k8s-refresh-local: ## Fast local refresh (new random tag, no infra re-apply)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@$(MAKE) $(NO_PRINT) check-k8s-cluster
	@echo -e "$(BLUE)Refreshing local app services with a new random image tag...$(NC)"
	@$(MAKE) $(NO_PRINT) k8s-update-images-random ENVIRONMENT=$(ENVIRONMENT) NAMESPACE=$(NAMESPACE) REGISTRY=$(REGISTRY) RANDOM_TAG_PREFIX=$(RANDOM_TAG_PREFIX)
	@$(MAKE) $(NO_PRINT) k8s-wait ENVIRONMENT=$(ENVIRONMENT) NAMESPACE=$(NAMESPACE)
	@echo -e "$(GREEN)✓ Local service refresh complete$(NC)"
	@$(MAKE) $(NO_PRINT) k8s-local-url ENVIRONMENT=$(ENVIRONMENT)
	$(call print-next,Run make k8s-status to verify the rollout and then test service endpoints.)

dev-up: ## Bootstrap once, then fast refresh with random image tags
	@$(MAKE) $(NO_PRINT) minikube-start ENVIRONMENT=local
	@if kubectl get deployment local-api-gateway -n $(NAMESPACE) >/dev/null 2>&1; then \
		echo -e "$(BLUE)Detected existing local deployments. Using fast refresh path.$(NC)"; \
		$(MAKE) $(NO_PRINT) k8s-refresh-local ENVIRONMENT=local NAMESPACE=$(NAMESPACE); \
	else \
		echo -e "$(YELLOW)No existing local deployments detected. Running full bootstrap once.$(NC)"; \
		$(MAKE) $(NO_PRINT) k8s-bootstrap-local ENVIRONMENT=local NAMESPACE=$(NAMESPACE); \
	fi
	$(call print-next,Run make k8s-status to verify all local services.)

k8s-preview: ## Preview Kubernetes manifests without deploying (ENVIRONMENT=local)
	@$(MAKE) $(NO_PRINT) check-kustomize
	@echo -e "$(BLUE)Kubernetes manifests for $(ENVIRONMENT):$(NC)"
	@kustomize build $(KUSTOMIZE_DIR)
	$(call print-next,Apply these manifests with make k8s-apply ENVIRONMENT=$(ENVIRONMENT).)

k8s-apply: ## Apply Kubernetes manifests (ENVIRONMENT=local)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@$(MAKE) $(NO_PRINT) check-kustomize
	@$(MAKE) $(NO_PRINT) check-k8s-cluster
	@echo -e "$(BLUE)Applying Kubernetes manifests to cluster ($(ENVIRONMENT))...$(NC)"
	@kubectl apply -k $(KUSTOMIZE_DIR) --validate=false || { echo -e "$(RED)✗ Apply failed$(NC)"; exit 1; }
	@echo -e "$(GREEN)✓ Applied$(NC)"
	$(call print-next,Run make k8s-wait ENVIRONMENT=$(ENVIRONMENT).)

k8s-update-images: ## Update image tags in running deployments
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Updating image tags ($(IMAGE_TAG)) in Kubernetes cluster...$(NC)"
	@deploy_prefix=""; image_prefix="$(REGISTRY)"; \
	if [ "$(ENVIRONMENT)" = "local" ]; then \
		deploy_prefix="local-"; \
		image_prefix="mini-baas"; \
	fi; \
	for svc in $(SERVICES); do \
		deploy_name="$$deploy_prefix$$svc"; \
		if kubectl get deployment "$$deploy_name" -n $(NAMESPACE) >/dev/null 2>&1; then \
			echo -e "$(CYAN)→ set image deployment/$$deploy_name $$svc=$$image_prefix/$$svc:$(IMAGE_TAG)$(NC)"; \
			kubectl set image deployment/"$$deploy_name" "$$svc"="$$image_prefix/$$svc:$(IMAGE_TAG)" -n $(NAMESPACE); \
		else \
			echo -e "$(YELLOW)• deployment/$$deploy_name not found, skipping$(NC)"; \
		fi; \
	done
	@echo -e "$(GREEN)✓ Images updated$(NC)"
	$(call print-next,Run make k8s-restart ENVIRONMENT=$(ENVIRONMENT) SERVICE=<service> if pods do not auto-roll.)

random-tag: ## Print a random image tag
	@echo "$(RANDOM_TAG_PREFIX)-$$(date +%Y%m%d%H%M%S)-$$RANDOM"
	$(call print-next,Use it with make docker-build IMAGE_TAG=<printed-tag>.)

k8s-update-images-random: ## Build + (local load) + update images using a random tag
	@$(MAKE) $(NO_PRINT) check-kubectl
	@tag="$(RANDOM_TAG_PREFIX)-$$(date +%Y%m%d%H%M%S)-$$RANDOM"; \
	echo -e "$(BLUE)Using random IMAGE_TAG=$$tag$(NC)"; \
	$(MAKE) $(NO_PRINT) docker-build IMAGE_TAG="$$tag"; \
	if [ "$(ENVIRONMENT)" = "local" ]; then \
		$(MAKE) $(NO_PRINT) k8s-load-local-images IMAGE_TAG="$$tag" ENVIRONMENT=$(ENVIRONMENT); \
	fi; \
	$(MAKE) $(NO_PRINT) k8s-update-images IMAGE_TAG="$$tag" ENVIRONMENT=$(ENVIRONMENT) NAMESPACE=$(NAMESPACE) REGISTRY=$(REGISTRY); \
	echo -e "$(GREEN)✓ Random tag rollout prepared with IMAGE_TAG=$$tag$(NC)"
	$(call print-next,Run make k8s-wait ENVIRONMENT=$(ENVIRONMENT) and then check /docs endpoints.)

k8s-delete: ## Delete all mini-baas deployments from Kubernetes
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(YELLOW)Deleting deployments from Kubernetes...$(NC)"
	@prefix=""; \
	if [ "$(ENVIRONMENT)" = "local" ]; then \
		prefix="local-"; \
	fi; \
	for svc in $(SERVICES); do \
		kubectl delete deployment "$$prefix$$svc" -n $(NAMESPACE) --ignore-not-found; \
		kubectl delete service "$$prefix$$svc" -n $(NAMESPACE) --ignore-not-found; \
	done
	@echo -e "$(GREEN)✓ Deployments deleted$(NC)"
	$(call print-next,Redeploy with make k8s-deploy-local or make k8s-apply ENVIRONMENT=$(ENVIRONMENT).)

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
	$(call print-next,Inspect one service logs with make k8s-logs ENVIRONMENT=$(ENVIRONMENT) SERVICE=dynamic-api.)

k8s-logs: ## Show logs for a service (SERVICE=api-gateway make k8s-logs)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Logs for $(SERVICE) (Namespace: $(NAMESPACE)):$(NC)"
	@kubectl logs -n $(NAMESPACE) -l app=$(SERVICE) --all-containers=true --tail=100 -f
	$(call print-next,Open docs endpoint to verify route exposure after logs review.)

k8s-describe: ## Describe a service deployment (SERVICE=api-gateway make k8s-describe)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Deployment details for $(SERVICE) (Namespace: $(NAMESPACE)):$(NC)"
	@kubectl describe deployment $(SERVICE) -n $(NAMESPACE) || echo "Deployment not found"
	$(call print-next,If needed run make k8s-restart ENVIRONMENT=$(ENVIRONMENT) SERVICE=$(SERVICE).)

k8s-port-forward: ## Port forward to a service (SERVICE=api-gateway PORT=3000 make k8s-port-forward)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@svc="$(SERVICE)"; \
	if [ -z "$$svc" ]; then \
		svc="api-gateway"; \
	fi; \
	if [ "$(ENVIRONMENT)" = "local" ] && [[ "$$svc" != local-* ]]; then \
		svc="local-$$svc"; \
	fi; \
	port="$(PORT)"; \
	kubectl get svc "$$svc" -n $(NAMESPACE) >/dev/null 2>&1 || { \
		echo -e "$(RED)✗ Service '$$svc' not found in namespace '$(NAMESPACE)'$(NC)"; \
		echo -e "$(YELLOW)Available services:$(NC)"; \
		kubectl get svc -n $(NAMESPACE) -o custom-columns=NAME:.metadata.name,PORT:.spec.ports[0].port --no-headers || true; \
		exit 1; \
	}; \
	if [ -z "$$port" ]; then \
		port="$$(kubectl get svc "$$svc" -n $(NAMESPACE) -o jsonpath='{.spec.ports[0].port}')"; \
	fi; \
	if [ -z "$$port" ]; then \
		echo -e "$(RED)✗ Could not determine a port for service '$$svc'$(NC)"; \
		exit 1; \
	fi; \
	echo -e "$(BLUE)Port forwarding $$svc to localhost:$$port$(NC)"; \
	kubectl port-forward -n $(NAMESPACE) svc/$$svc $$port:$$port
	$(call print-next,Open http://localhost:<port>/docs where <port> is the forwarded local port.)

k8s-port-forward-%: ## Port forward one specific service (e.g., make k8s-port-forward-auth-service)
	@$(MAKE) $(NO_PRINT) k8s-port-forward SERVICE=$* PORT=$(PORT) ENVIRONMENT=$(ENVIRONMENT) NAMESPACE=$(NAMESPACE)
	$(call print-next,Stop forwarding with Ctrl+C when done.)

k8s-port-forward-api-gateway: ## Port forward only api-gateway
	@$(MAKE) $(NO_PRINT) k8s-port-forward SERVICE=api-gateway PORT=$(PORT) ENVIRONMENT=$(ENVIRONMENT) NAMESPACE=$(NAMESPACE)

k8s-port-forward-auth-service: ## Port forward only auth-service
	@$(MAKE) $(NO_PRINT) k8s-port-forward SERVICE=auth-service PORT=$(PORT) ENVIRONMENT=$(ENVIRONMENT) NAMESPACE=$(NAMESPACE)

k8s-port-forward-dynamic-api: ## Port forward only dynamic-api
	@$(MAKE) $(NO_PRINT) k8s-port-forward SERVICE=dynamic-api PORT=$(PORT) ENVIRONMENT=$(ENVIRONMENT) NAMESPACE=$(NAMESPACE)

k8s-port-forward-schema-service: ## Port forward only schema-service
	@$(MAKE) $(NO_PRINT) k8s-port-forward SERVICE=schema-service PORT=$(PORT) ENVIRONMENT=$(ENVIRONMENT) NAMESPACE=$(NAMESPACE)

# Compatibility aliases for requested naming style/typo ("fordward").
make-k8s-port-fordward-api-gateway:
	@$(MAKE) $(NO_PRINT) k8s-port-forward-api-gateway PORT=$(PORT)

make-k8s-port-fordward-auth-service:
	@$(MAKE) $(NO_PRINT) k8s-port-forward-auth-service PORT=$(PORT)

make-k8s-port-fordward-dynamic-api:
	@$(MAKE) $(NO_PRINT) k8s-port-forward-dynamic-api PORT=$(PORT)

make-k8s-port-fordward-schema-service:
	@$(MAKE) $(NO_PRINT) k8s-port-forward-schema-service PORT=$(PORT)

k8s-scale: ## Scale a deployment (SERVICE=api-gateway REPLICAS=3 make k8s-scale)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@svc="$(SERVICE)"; \
	if [ "$(ENVIRONMENT)" = "local" ] && [[ "$$svc" != local-* ]]; then \
		svc="local-$$svc"; \
	fi; \
	echo -e "$(BLUE)Scaling $$svc to $(REPLICAS) replicas...$(NC)"; \
	kubectl scale deployment/$$svc --replicas=$(REPLICAS) -n $(NAMESPACE)
	@echo -e "$(GREEN)✓ Scaled$(NC)"
	$(call print-next,Run make k8s-wait ENVIRONMENT=$(ENVIRONMENT) and make k8s-status.)

k8s-restart: ## Restart a deployment (SERVICE=api-gateway make k8s-restart)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@svc="$(SERVICE)"; \
	if [ "$(ENVIRONMENT)" = "local" ] && [[ "$$svc" != local-* ]]; then \
		svc="local-$$svc"; \
	fi; \
	echo -e "$(BLUE)Restarting $$svc...$(NC)"; \
	kubectl rollout restart deployment/$$svc -n $(NAMESPACE)
	@echo -e "$(GREEN)✓ Restarted$(NC)"
	$(call print-next,Watch rollout with make k8s-wait ENVIRONMENT=$(ENVIRONMENT).)

k8s-rollback: ## Rollback last deployment change (SERVICE=api-gateway make k8s-rollback)
	@$(MAKE) $(NO_PRINT) check-kubectl
	@svc="$(SERVICE)"; \
	if [ "$(ENVIRONMENT)" = "local" ] && [[ "$$svc" != local-* ]]; then \
		svc="local-$$svc"; \
	fi; \
	echo -e "$(YELLOW)Rolling back $$svc...$(NC)"; \
	kubectl rollout undo deployment/$$svc -n $(NAMESPACE)
	@echo -e "$(GREEN)✓ Rolled back$(NC)"
	$(call print-next,Validate recovery with make k8s-status and service /health endpoint.)

k8s-events: ## Show recent Kubernetes events
	@$(MAKE) $(NO_PRINT) check-kubectl
	@echo -e "$(BLUE)Recent events in $(NAMESPACE):$(NC)"
	@kubectl get events -n $(NAMESPACE) --sort-by='.lastTimestamp' | tail -20
	$(call print-next,If errors appear, inspect with make k8s-describe ENVIRONMENT=$(ENVIRONMENT) SERVICE=<service>.)

# ============================================================================
# CI/CD Integration Targets
# ============================================================================

build-and-push: ## Build all images and push to registry
	@$(MAKE) $(NO_PRINT) docker-build
	@$(MAKE) $(NO_PRINT) docker-push
	@echo -e "$(GREEN)✓ All images built and pushed$(NC)"
	$(call print-next,Deploy locally with make k8s-deploy-local IMAGE_TAG=$(IMAGE_TAG).)

deploy-staging: ## Deprecated alias: local-only deploy
	@echo -e "$(YELLOW)⚠ deploy-staging is mapped to local deploy (project is local-only).$(NC)"
	@$(MAKE) $(NO_PRINT) k8s-deploy ENVIRONMENT=local REGISTRY=$(REGISTRY) IMAGE_TAG=$(IMAGE_TAG)
	$(call print-next,Verify local rollout with make k8s-status ENVIRONMENT=local NAMESPACE=$(NAMESPACE).)

deploy-production: ## Deprecated alias: local-only deploy
	@echo -e "$(YELLOW)⚠ deploy-production is mapped to local deploy (project is local-only).$(NC)"
	@$(MAKE) $(NO_PRINT) k8s-deploy ENVIRONMENT=local REGISTRY=$(REGISTRY) IMAGE_TAG=$(IMAGE_TAG)
	$(call print-next,Verify local rollout with make k8s-wait ENVIRONMENT=local.)

dashboard: ## Open Kubernetes dashboard (minikube)
	@minikube dashboard
	$(call print-next,Keep terminal open and monitor resources in the dashboard UI.)

help: ## ❓ Show this help message
	@echo ""
	@echo -e "$(BOLD)mini-baas-infrastructure - Available Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-25s$(NC) %s\n", $$1, $$2}'
	@echo ""
	$(call print-next,Start with make k8s-update-images-random ENVIRONMENT=local for rapid local iteration.)


.PHONY: check-docker check-kubectl check-minikube check-kustomize check-k8s-cluster \
	docker-build docker-build-no-cache docker-tag docker-push docker-images docker-clean \
	minikube-start k8s-load-local-images k8s-deploy k8s-deploy-local k8s-wait k8s-local-url k8s-bootstrap-local dev-up k8s-preview k8s-apply k8s-update-images k8s-delete k8s-status k8s-logs k8s-describe k8s-port-forward k8s-port-forward-% k8s-port-forward-api-gateway k8s-port-forward-auth-service k8s-port-forward-dynamic-api k8s-port-forward-schema-service make-k8s-port-fordward-api-gateway make-k8s-port-fordward-auth-service make-k8s-port-fordward-dynamic-api make-k8s-port-fordward-schema-service k8s-scale k8s-restart k8s-rollback k8s-events \
	random-tag k8s-update-images-random \
	build-and-push deploy-staging deploy-production \
	help