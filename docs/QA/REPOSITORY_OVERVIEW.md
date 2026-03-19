# mini-baas-infra: Technical Repository Overview

## Executive Summary

The `mini-baas-infra` repository serves as the central infrastructure-as-code hub for the mini-BaaS (Backend-as-a-Service) platform. It is a **tool-agnostic Kubernetes infrastructure repository** designed to decouple infrastructure concerns from specific deployment tooling (Kustomize, Helm, ArgoCD). This repository centralizes environment contracts, service deployment conventions, and delivery workflows while maintaining flexibility in the choice of orchestration mechanisms.

The repository is intentionally structured to be **environment-neutral at its core** while allowing for environment-specific customizations through a layered overlay pattern.

---

## Core Philosophy

1. **Tool Agnostic**: No hard dependency on any specific deployment tool. Kustomize, Helm, and ArgoCD are treated as optional adapters.
2. **Contract-Driven**: Each service defines its deployment contract independently, ensuring clarity of expectations.
3. **Centralized Conventions**: Platform-wide policies, namespace standards, and deployment best practices are codified in a single repository.
4. **Environment Promotion**: Clear separation between base configurations (shared across all environments) and environment-specific overlays (local, staging, production).
5. **GitOps Ready**: Supports GitOps workflows through optional ArgoCD integration while remaining independent of it.

---

## Directory Structure and Detailed Breakdown

### 1. **`docs/`** — Architecture Decisions and Operational Playbooks

**Purpose**: Documentation hub for architectural decisions, runbooks, and operational playbooks.

**Expected Contents**:
- ADRs (Architecture Decision Records): Design decisions affecting infrastructure
- Runbooks: Step-by-step operational procedures
- Troubleshooting guides: Common issues and resolution strategies
- Architecture diagrams: System component relationships
- Policy documentation: Security, compliance, and operational policies

**Example Files**:
```
docs/
├── adr-001-service-mesh-decision.md
├── adr-002-namespace-isolation-strategy.md
├── runbooks/
│   ├── cluster-bootstrap.md
│   ├── disaster-recovery.md
│   └── observability-setup.md
├── troubleshooting/
│   ├── pod-crashes.md
│   └── network-connectivity.md
└── architecture/
    └── platform-overview.md
```

---

### 2. **`platform/`** — Cluster and Namespace Conventions

**Purpose**: Defines platform-level policies and baseline conventions for all Kubernetes clusters and namespaces.

**Structure**:
- **`platform/clusters/`**: Per-cluster baseline configurations and policies
  - `local/`: Local development cluster conventions
  - `staging/`: Staging cluster standards
  - `production/`: Production cluster requirements and hardening policies

- **`platform/namespaces/`**: Namespace topology and defaults
  - **Recommended Namespaces**:
    - `baas-local`: Development/testing environment
    - `baas-staging`: Pre-production staging environment
    - `baas-prod`: Production environment

**Expected Configurations**:
```
platform/
├── clusters/
│   ├── local/
│   │   ├── ingress-class.yaml
│   │   ├── network-policies.yaml
│   │   └── resource-quotas.yaml
│   ├── staging/
│   │   ├── tls-policies.yaml
│   │   └── pod-security-standards.yaml
│   └── production/
│       ├── rbac-policies.yaml
│       ├── admission-controllers.yaml
│       └── backup-policies.yaml
└── namespaces/
    └── defaults.yaml (namespace templates)
```

---

### 3. **`services/contracts/`** — Service-Level Deployment Contracts

**Purpose**: Centralizes deployment contracts and runtime workload specifications for each service in scope.

**Services in Scope**:
- `api-gateway`: API entry point and routing service
- `auth-service`: Authentication and authorization service
- `dynamic-api`: Dynamic API generation and execution
- `schema-service`: Schema management and versioning

**Expected Contents** (per service):
```
services/contracts/
├── api-gateway/
│   ├── deployment-contract.md
│   ├── service-dependencies.md
│   ├── resource-requirements.yaml
│   └── health-check-spec.md
├── auth-service/
│   ├── deployment-contract.md
│   ├── secret-management.md
│   └── oauth-configuration.md
├── dynamic-api/
│   ├── deployment-contract.md
│   └── scaling-policies.md
└── schema-service/
    ├── deployment-contract.md
    └── persistence-requirements.md
```

**Example Contract Structure**:
```yaml
# services/contracts/api-gateway/deployment-contract.md

## Service: API Gateway

### Resources
- CPU: 500m-1000m (local), 2000m (prod)
- Memory: 256Mi-512Mi (local), 1Gi (prod)

### Dependencies
- auth-service (for token validation)
- dynamic-api (for endpoint routing)

### Network Requirements
- Ingress on port 443 (TLS)
- Service-to-service communication on port 8080

### Liveness/Readiness Probes
- Endpoint: /health
- Initial Delay: 10s
- Timeout: 5s
```

---

### 4. **`deployments/base/`** — Canonical Kubernetes Definitions

**Purpose**: Environment-neutral Kubernetes resource definitions shared across all environments.

**Structure**:
```
deployments/base/
├── api-gateway/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   └── kustomization.yaml
├── auth-service/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── secret-sealed.yaml
│   └── kustomization.yaml
├── dynamic-api/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── statefulset.yaml
│   └── kustomization.yaml
└── schema-service/
    ├── deployment.yaml
    ├── service.yaml
    ├── pvc.yaml
    └── kustomization.yaml
```

**Expected File Contents**:

```yaml
# deployments/base/api-gateway/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  labels:
    app: api-gateway
    version: v1
spec:
  replicas: 1  # Overridden in overlays
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: <registry>/api-gateway:latest
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: 500m
            memory: 256Mi
          limits:
            cpu: 1000m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

---

### 5. **`deployments/overlays/`** — Environment-Specific Customizations

**Purpose**: Apply environment-specific patches and customizations while reusing base configurations.

**Structure**:
```
deployments/overlays/
├── local/
│   ├── kustomization.yaml
│   ├── replicas-patch.yaml
│   ├── resource-patch.yaml
│   └── image-patch.yaml
├── staging/
│   ├── kustomization.yaml
│   ├── replicas-patch.yaml
│   ├── resource-patch.yaml
│   └── tls-ingress-patch.yaml
└── production/
    ├── kustomization.yaml
    ├── replicas-patch.yaml
    ├── resource-patch.yaml
    ├── affinity-patch.yaml
    └── ingress-patch.yaml
```

**Example Overlay Pattern**:

```yaml
# deployments/overlays/production/kustomization.yaml

apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

bases:
  - ../../base/api-gateway
  - ../../base/auth-service
  - ../../base/dynamic-api
  - ../../base/schema-service

namespace: baas-prod

commonLabels:
  environment: production

patches:
  - target:
      kind: Deployment
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 3
  - target:
      kind: Deployment
    patch: resource-patch.yaml

images:
  - name: api-gateway
    newTag: "v1.0.0"
```

```yaml
# deployments/overlays/local/kustomization.yaml

apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

bases:
  - ../../base/api-gateway
  - ../../base/auth-service

namespace: baas-local

commonLabels:
  environment: local

patches:
  - target:
      kind: Deployment
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 1
      - op: replace
        path: /spec/template/spec/containers/0/resources/limits/memory
        value: "256Mi"

images:
  - name: api-gateway
    newName: localhost:5000/api-gateway
```

---

### 6. **`tooling/`** — Optional Tool Adapters

**Purpose**: Provide optional integration points for deployment tooling while keeping the core structure tool-agnostic.

**Substructure**:

- **`tooling/kustomize/`**: Optional Kustomize entrypoints
  ```
  tooling/kustomize/
  ├── kustomization.yaml (root Kustomization)
  ├── local-entrypoint.yaml
  ├── staging-entrypoint.yaml
  └── production-entrypoint.yaml
  ```

- **`tooling/helm/`**: Optional Helm entrypoints (values files, chart templates)
  ```
  tooling/helm/
  ├── Chart.yaml
  ├── values.yaml
  ├── values-local.yaml
  ├── values-staging.yaml
  ├── values-production.yaml
  └── templates/
      └── service-deployments.yaml
  ```

**Example Kustomize Entrypoint**:
```yaml
# tooling/kustomize/kustomization.yaml

apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

# Selectable via: kustomize build tooling/kustomize --load-restrictor=LoadRestrictionsNone

bases:
  - ../../deployments/overlays/local    # Or staging/production
  
# Additional cross-cutting concerns
commonLabels:
  managed-by: kustomize
  
commonAnnotations:
  sync-policy: "auto"
```

---

### 7. **`argocd/applications/`** — Optional GitOps Application Manifests

**Purpose**: Centralize ArgoCD Application definitions for environment promotion and drift control, independent from core infrastructure definitions.

**Expected Structure**:
```
argocd/applications/
├── base/
│   ├── api-gateway-app.yaml
│   ├── auth-service-app.yaml
│   ├── dynamic-api-app.yaml
│   └── schema-service-app.yaml
├── local/
│   └── kustomization.yaml
├── staging/
│   └── kustomization.yaml
└── production/
    └── kustomization.yaml
```

**Example ArgoCD Application**:
```yaml
# argocd/applications/base/api-gateway-app.yaml

apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api-gateway
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/mini-baas/infra
    targetRevision: main
    path: deployments/overlays/{{ENVIRONMENT}}
  destination:
    server: https://kubernetes.default.svc
    namespace: baas-{{ENVIRONMENT}}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

---

### 8. **`scripts/`** — Operational and Bootstrap Helpers

**Purpose**: Automation scripts for cluster bootstrap, image promotion, smoke tests, and operational tasks.

**Expected Contents**:
```
scripts/
├── bootstrap/
│   ├── setup-local-cluster.sh
│   ├── setup-staging-cluster.sh
│   └── setup-production-cluster.sh
├── promotion/
│   ├── promote-images.sh
│   └── promote-configurations.sh
├── testing/
│   ├── smoke-tests.sh
│   └── integration-tests.sh
└── maintenance/
    ├── backup-state.sh
    └── cleanup-resources.sh
```

**Example Bootstrap Script**:
```bash
#!/bin/bash
# scripts/bootstrap/setup-local-cluster.sh

set -e

CLUSTER_NAME="mini-baas-local"
NAMESPACE="baas-local"

echo "Bootstrapping local Kubernetes cluster..."

# Create cluster
kind create cluster --name "${CLUSTER_NAME}"

# Create namespace
kubectl create namespace "${NAMESPACE}"

# Apply base configurations
kubectl apply -k deployments/overlays/local/

echo "✅ Local cluster ready at baas-local namespace"
```

---

## Services in Scope

The platform manages four core microservices:

### 1. **api-gateway**
- **Role**: API entry point and request routing layer
- **Responsibilities**: 
  - HTTP/REST endpoint exposure
  - Request routing to backend services
  - API versioning management
  - Rate limiting and throttling
- **Dependencies**: auth-service, dynamic-api

### 2. **auth-service**
- **Role**: Authentication and authorization
- **Responsibilities**:
  - OAuth2/OpenID Connect integration
  - Token generation and validation
  - RBAC enforcement
  - Session management
- **Dependencies**: Schema for permission definitions

### 3. **dynamic-api**
- **Role**: Dynamic API generation and execution
- **Responsibilities**:
  - Schema-based endpoint generation
  - Query execution engine
  - Transformation and filtering
  - Data orchestration across services
- **Dependencies**: schema-service, data persistence layer

### 4. **schema-service**
- **Role**: Schema management and versioning
- **Responsibilities**:
  - Schema versioning and storage
  - Schema validation
  - Schema evolution tracking
  - Compatibility checks
- **Dependencies**: None (foundational service)

### **shared-library**
- **Status**: Treated as a build-time dependency
- **Evolution Path**: May evolve into a network service if complexity warrants microservice treatment

---

## Deployment Flow and Environment Topology

### Local Development Environment
```
┌─────────────────────────────────────────┐
│ Local Kubernetes (kind/minikube)       │
├─────────────────────────────────────────┤
│ Namespace: baas-local                   │
├─────────────────────────────────────────┤
│ Resources: Minimal                      │
│  - CPU: 500m per pod (limits: 1000m)   │
│  - Memory: 256Mi per pod (limits: 512Mi)│
│ Replicas: 1 per service                 │
│ Image Registry: localhost:5000          │
└─────────────────────────────────────────┘
```

### Staging Environment
```
┌─────────────────────────────────────────┐
│ Staging Kubernetes Cluster              │
├─────────────────────────────────────────┤
│ Namespace: baas-staging                 │
├─────────────────────────────────────────┤
│ Resources: Medium-sized                 │
│  - CPU: 1000m per pod (limits: 2000m)  │
│  - Memory: 512Mi per pod (limits: 1Gi)  │
│ Replicas: 2 per service                 │
│ Image Registry: staging-registry        │
│ TLS: Enabled                            │
└─────────────────────────────────────────┘
```

### Production Environment
```
┌─────────────────────────────────────────┐
│ Production Kubernetes Cluster           │
├─────────────────────────────────────────┤
│ Namespace: baas-prod                    │
├─────────────────────────────────────────┤
│ Resources: High-availability            │
│  - CPU: 2000m per pod (limits: 4000m)  │
│  - Memory: 1Gi per pod (limits: 2Gi)    │
│ Replicas: 3+ per service                │
│ Image Registry: production-registry     │
│ TLS: Required                           │
│ Pod Affinity: Anti-affinity rules       │
│ Network Policies: Strict ingress/egress │
└─────────────────────────────────────────┘
```

---

## Configuration Management Strategy

### Base vs. Overlay Pattern

**Base Configurations** (`deployments/base/`)
- Environment-neutral Kubernetes manifests
- Shared across all environments
- Contain common resource specifications
- Default liveness/readiness probes
- Generic image references

**Overlays** (`deployments/overlays/`)
- Environment-specific customizations
- Patch base configurations
- Override resource limits
- Set concrete image tags/registries
- Apply environment-specific networking rules
- Configure environment-specific secrets

### Example Customization Flow

```
┌─────────────────────────────────────────────────┐
│ deployments/base/api-gateway/                  │
│  ├── deployment.yaml (generic)                  │
│  ├── service.yaml (generic)                     │
│  └── kustomization.yaml                         │
└─────────────────────────────────────────────────┘
                      ↓ (patched by)
┌─────────────────────────────────────────────────┐
│ deployments/overlays/local/                    │
│  ├── replicas-patch.yaml (1 replica)           │
│  ├── resource-patch.yaml (minimal resources)   │
│  ├── image-patch.yaml (localhost registry)     │
│  └── kustomization.yaml                        │
└─────────────────────────────────────────────────┘
                      ↓ (produces)
        Local Deployment Configuration
```

---

## Key Features and Design Patterns

### 1. **Layered Architecture**
- Clear separation of concerns: base definitions, environment overlays, tooling adapters
- Enables reuse and reduces configuration duplication
- Supports incremental environment setup

### 2. **Contract-Driven Development**
- Each service defines explicit deployment contracts
- Clarifies resource requirements, dependencies, and health checks
- Enables independent service evolution within agreed contracts

### 3. **Environment Parity**
- Same base definitions across environments
- Controlled divergence through environment-specific overlays
- Reduces "works on my machine" problems

### 4. **Tool Flexibility**
- Core definitions in pure Kubernetes manifests
- Optional Kustomize, Helm, and ArgoCD adapters
- Allows adoption of new tools without restructuring core repository

### 5. **GitOps-Ready**
- All configurations are version-controlled
- Supports drift detection and automated reconciliation
- Enables audit trails and rollback capabilities

---

## Implementation Roadmap

### Phase 1: Foundation (Current)
- ✅ Repository structure established
- ✅ Namespace topology defined
- ⏳ Base deployment manifests for each service
- ⏳ Service deployment contracts

### Phase 2: Environment Configuration
- ⏳ Local overlay configuration
- ⏳ Staging overlay configuration  
- ⏳ Production overlay configuration
- ⏳ Environment-specific policies (secrets, RBAC)

### Phase 3: Tooling Integration
- ⏳ Kustomize entrypoints
- ⏳ Helm charts and values files
- ⏳ ArgoCD application definitions

### Phase 4: Automation
- ⏳ Bootstrap scripts
- ⏳ Image promotion pipeline
- ⏳ Smoke test suite
- ⏳ Operational runbooks

### Phase 5: Governance
- ⏳ Network policies
- ⏳ RBAC definitions
- ⏳ Backup and disaster recovery procedures
- ⏳ Security scanning integration

---

## Usage Examples

### Deploy to Local Environment with Kustomize
```bash
kustomize build deployments/overlays/local | kubectl apply -f -
```

### Deploy to Staging with Helm
```bash
helm install mini-baas tooling/helm/ \
  -f tooling/helm/values-staging.yaml \
  --namespace baas-staging
```

### Deploy via ArgoCD
```bash
kubectl apply -f argocd/applications/staging/
```

### Run Bootstrap Script
```bash
./scripts/bootstrap/setup-local-cluster.sh
```

### View Service Contracts
```bash
cat services/contracts/api-gateway/deployment-contract.md
```

---

## File Conventions

### Naming Standards
- Service names use lowercase with hyphens: `api-gateway`, `auth-service`
- Namespace naming: `baas-{environment}` (local, staging, prod)
- Manifest files: descriptive names with `.yaml` extension
- Script files: kebab-case with executable permissions

### Documentation Standards
- README files in each directory explaining purpose and contents
- Inline comments for non-obvious configurations
- Service contracts specify resource requirements, dependencies, and health checks
- Architecture Decision Records (ADRs) document infrastructure choices

---

## Integration Points

### With Service Repositories
Each service repository (api-gateway, auth-service, etc.) references:
- Deployment contract from `services/contracts/{service}/`
- Base Kubernetes definitions from `deployments/base/{service}/`
- Example overlays from `deployments/overlays/`

### With CI/CD Pipeline
- Image build triggers based on service repository commits
- Image promotion through overlay image patches
- Automated testing against staging/production overlays

### With Observability
- Service definitions include probe configurations
- Scripts can integrate with APM/monitoring tooling
- Namespace labels enable traffic monitoring

---

## Security Considerations

- Secrets management: Sealed secrets or external secret operators (implementation pending)
- RBAC: Service accounts and role definitions per namespace (implementation pending)
- Network Policies: Namespace-level ingress/egress rules (implementation pending)
- Pod Security Policies: Admission controller configuration (implementation pending)
- Image Registry: Private registries with authentication (environment-specific)

---

## Future Extensibility

This repository is designed to scale with:
- **Additional Services**: New microservices follow the existing pattern
- **New Environments**: Additional overlays for testing, staging variations, or disaster recovery zones
- **Advanced Tooling**: Can adopt service mesh (Istio/Linkerd), policy engines (Kyverno/OPA), or other additions without restructuring
- **Multi-Region Deployments**: Overlay patterns support regional variations
- **Hybrid/Multi-Cloud**: Base definitions are cloud-agnostic; overlays can be cloud-specific

---

## Repository Maintenance

- **Regular Reviews**: Overlay and base configurations should be reviewed quarterly
- **Contract Evolution**: Service contracts should reflect current operational reality
- **Documentation Updates**: Runbooks and ADRs should be updated as practices evolve
- **Tool Upgrades**: Kustomize, Helm, and ArgoCD versions should be tracked and updated regularly

