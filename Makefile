.PHONY: help install-hooks lint-yaml lint-scripts validate-k8s qa-all

################################################################################
# mini-baas-infra Makefile
# QA & CI/CD orchestration for Infrastructure-as-Code
# 
# Usage:
#   make help              # Show this help message
#   make install-hooks     # Install Git hooks
#   make lint-yaml         # Lint YAML files (Phase 2)
#   make lint-scripts      # Lint shell scripts (Phase 3)
#   make validate-k8s      # Validate Kubernetes manifests (Phase 3)
#   make qa-all            # Run all QA checks (Phase 4)
################################################################################

help:
	@echo "mini-baas-infra QA & CI/CD"
	@echo ""
	@echo "PHASE 1: Native Hooks Foundation"
	@echo "  make install-hooks"
	@echo ""
	@echo "PHASE 2: Infra Pre-Commit Guard"
	@echo "  (Pre-commit hook targets - auto-run)"
	@echo ""
	@echo "PHASE 3: Infra Pre-Push Guard"
	@echo "  (Pre-push hook targets - auto-run)"
	@echo ""
	@echo "PHASE 4: Universal Makefile Orchestrator"
	@echo "  make lint-yaml"
	@echo "  make lint-scripts"
	@echo "  make validate-k8s"
	@echo "  make qa-all"
	@echo ""

################################################################################
# PHASE 1: Native Hooks Foundation
################################################################################

install-hooks:
	@echo "Setting up native Git hooks..."
	@git config --local core.hooksPath scripts/hooks
	@echo "✅ Git hooks path configured to scripts/hooks"
	@chmod +x scripts/hooks/* 2>/dev/null || true
	@echo "✅ Hook scripts made executable"
	@echo "✅ Git hooks installed successfully"

################################################################################
# PHASE 2: Infra Pre-Commit Guard (Syntax & Secrets)
# NOTE: Implemented in scripts/hooks/pre-commit
################################################################################

################################################################################
# PHASE 3: Infra Pre-Push Guard (K8s Validation & Shellcheck)
# NOTE: Implemented in scripts/hooks/pre-push
# The following targets are called from the pre-push hook:
################################################################################

lint-yaml:
	@echo "🔍 Linting YAML files in deployments/ and platform/..."
	@if command -v yamllint &> /dev/null; then \
		find deployments platform -type f \( -name "*.yaml" -o -name "*.yml" \) -print0 | \
			xargs -0 yamllint --config-data "{extends: default, rules: {line-length: {max: 120}}}" || exit 1; \
		echo "✅ YAML linting passed"; \
	else \
		echo "⚠️  yamllint not found, skipping YAML linting"; \
		exit 0; \
	fi

lint-scripts:
	@echo "🔍 Linting shell scripts in scripts/..."
	@if command -v shellcheck &> /dev/null; then \
		find scripts -type f -name "*.sh" -print0 | \
			xargs -0 shellcheck --severity=warning || exit 1; \
		echo "✅ Shell script linting passed"; \
	else \
		echo "⚠️  shellcheck not found, skipping shell script linting"; \
		exit 0; \
	fi

validate-k8s:
	@echo "🔍 Validating Kubernetes manifests via kustomize..."
	@if command -v kubectl &> /dev/null && kubectl kustomize --help &>/dev/null; then \
		echo "  → Validating local overlay..."; \
		kubectl kustomize deployments/overlays/local > /dev/null || exit 1; \
		echo "  → Validating staging overlay..."; \
		if [ -d deployments/overlays/staging ] && [ -f deployments/overlays/staging/kustomization.yaml ]; then \
			kubectl kustomize deployments/overlays/staging > /dev/null || exit 1; \
		fi; \
		echo "  → Validating production overlay..."; \
		if [ -d deployments/overlays/production ] && [ -f deployments/overlays/production/kustomization.yaml ]; then \
			kubectl kustomize deployments/overlays/production > /dev/null || exit 1; \
		fi; \
		echo "✅ Kubernetes manifest validation passed"; \
	elif command -v kustomize &> /dev/null; then \
		echo "  → Validating local overlay (via kustomize)..."; \
		kustomize build deployments/overlays/local > /dev/null || exit 1; \
		echo "  → Validating staging overlay (via kustomize)..."; \
		if [ -d deployments/overlays/staging ] && [ -f deployments/overlays/staging/kustomization.yaml ]; then \
			kustomize build deployments/overlays/staging > /dev/null || exit 1; \
		fi; \
		echo "  → Validating production overlay (via kustomize)..."; \
		if [ -d deployments/overlays/production ] && [ -f deployments/overlays/production/kustomization.yaml ]; then \
			kustomize build deployments/overlays/production > /dev/null || exit 1; \
		fi; \
		echo "✅ Kubernetes manifest validation passed"; \
	else \
		echo "⚠️  kubectl/kustomize not found, skipping Kubernetes validation"; \
		exit 0; \
	fi

################################################################################
# PHASE 4: Universal Makefile Orchestrator
################################################################################

qa-all: lint-yaml lint-scripts validate-k8s
	@echo ""
	@echo "✅ All QA checks passed!"
