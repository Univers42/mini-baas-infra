# Kubernetes: What It Is and Why It Matters in Real Projects

## What Is Kubernetes?

Kubernetes (often shortened to **[K8s][k8s-ref]**) is an open-source platform for orchestrating containers.
It helps you deploy, run, scale, and maintain applications made of one or many containerized services.

If Docker defines how to package and run one container, Kubernetes defines how to run a full system of containers reliably in production.

## Why Kubernetes Exists

As applications grow, teams usually face recurring operational problems:

- Many services must run together ([API][api-ref], worker, database, cache, gateway, etc.).
- Traffic changes over time and needs automatic scaling.
- Containers crash and must restart automatically.
- Deployments should happen with minimal downtime.
- Environments (dev/staging/prod) should be reproducible.

Kubernetes solves these problems by providing a declarative control plane: you describe the desired state, and Kubernetes continuously works to keep reality aligned with that state.

## Core Concepts (Practical View)

- `Pod`: The smallest deployable unit, usually one container (sometimes sidecars).
- `Deployment`: Manages stateless app replicas and rolling updates.
- `Service`: Stable internal endpoint that routes traffic to pods.
- `Ingress`: [HTTP][http-ref]/[HTTPS][https-ref] entry point from outside the cluster.
- `ConfigMap` and `Secret`: Configuration and sensitive values injected into pods.
- `Namespace`: Logical isolation inside one cluster (team/app/environment boundaries).
- `Job` / `CronJob`: Run one-time or scheduled tasks.

These resources are typically defined in [YAML][yaml-ref] files and applied through [CI/CD][cicd-ref].

## Purpose in a Real Project

In production projects, Kubernetes is usually not the product itself. It is the **execution platform** that provides operational guarantees.

Typical concrete goals:

- **Reliability**: automatic restarts, self-healing, health checks (`liveness` and `readiness`).
- **Scalability**: horizontal scaling based on load.
- **Safer releases**: rolling updates and easy rollbacks.
- **Portability**: same deployment model across cloud providers and on-prem.
- **Operational consistency**: infrastructure as code ([IaC][iac-ref]) and predictable environments.

## Example: How It Helps a Backend Platform

For a backend platform (multi-service [API][api-ref], workers, async jobs), Kubernetes can:

- Keep [API][api-ref] replicas available even when one node fails.
- Split internal and external traffic cleanly.
- Run background workers independently from [API][api-ref] pods.
- Rotate configuration and secrets without manual host changes.
- Support progressive rollout strategies (canary/blue-green with extra tooling).

## Typical Adoption Path

Most teams do not start directly with Kubernetes.

1. Local development with Docker Compose.
2. [CI/CD][cicd-ref] and container image standardization.
3. Move staging, then production workloads to Kubernetes.
4. Add observability (metrics/logs/traces), autoscaling, and policy enforcement.

This phased approach reduces risk and keeps complexity manageable.

## Benefits vs Trade-Offs

### Main Benefits

- Strong automation for operations.
- Better uptime for distributed systems.
- Standardized deployment workflow.

### Main Trade-Offs

- Steeper learning curve.
- Additional platform complexity (networking, security, storage, observability).
- Requires clear ownership ([DevOps][devops-ref]/[SRE][sre-ref]/platform engineering practices).

Kubernetes is most valuable when your system complexity is already high enough to justify orchestration.

## When to Use Kubernetes

Kubernetes is a good fit when:

- You run multiple services in production.
- You need reliable scaling and high availability.
- You have frequent deployments and need controlled rollouts.
- You want reproducible infrastructure across environments.

It may be overkill for a very small single-service project with low traffic.

## Summary

Kubernetes is a production orchestration platform for containerized applications.
In real projects, its purpose is to provide reliability, scalability, and standardized operations so teams can ship features faster with less infrastructure risk.

## mini-baas Kubernetes Deployment Blueprint

This section provides a practical target architecture for this repository.

### 1) Namespaces and Environment Boundaries

Use one namespace per environment:

- `mini-baas-dev`
- `mini-baas-staging`
- `mini-baas-prod`

Benefits:

- Clear isolation of resources, quotas, and secrets.
- Safer promotion flow (`dev` -> `staging` -> `prod`).
- Easier incident response and rollback scope.

### 2) Suggested Workload Layout

Core workloads that fit this codebase:

- `backend-api` (`Deployment` + `Service`): NestJS [API][api-ref] application in `app/`.
- `job-worker` (`Deployment`): asynchronous tasks and queue processing (if enabled).
- `db-migrations` (`Job`): one-time schema migrations during release.
- `seed-data` (`Job` or `CronJob`): optional controlled seeding for non-prod.

Suggested minimum replicas:

- `dev`: 1 replica per service.
- `staging`: 2 replicas for [API][api-ref].
- `prod`: 3+ replicas for [API][api-ref] and critical workers.

### 3) Traffic and Networking

- Expose [API][api-ref] internally with a `ClusterIP` `Service`.
- Expose public endpoints through `Ingress` ([TLS][tls-ref] enabled).
- Keep internal-only endpoints private (no ingress route).
- Apply `NetworkPolicy` to restrict traffic to only required paths.

Example external routing model:

- `api.dev.example.com` -> `mini-baas-dev/backend-api`
- `api.staging.example.com` -> `mini-baas-staging/backend-api`
- `api.example.com` -> `mini-baas-prod/backend-api`

### 4) Configuration and Secrets Strategy

- Store non-sensitive config in `ConfigMap` (feature flags, runtime options).
- Store credentials in `Secret` (database [URL][url-ref], [JWT][jwt-ref] secrets, [API][api-ref] keys).
- Never hardcode secrets in images or manifests.
- Rotate secrets regularly and redeploy safely.

Recommended split:

- Shared config per environment (global `ConfigMap`).
- Service-specific overrides (`backend-api` config and secrets).

### 5) Health, Reliability, and Autoscaling

- Define `readinessProbe` so traffic only reaches ready pods.
- Define `livenessProbe` so stuck containers restart automatically.
- Set [CPU][cpu-ref]/memory `requests` and `limits` for all workloads.
- Enable [HPA][hpa-ref] for [API][api-ref] based on [CPU][cpu-ref] and/or request latency.

Practical [HPA][hpa-ref] baseline for [API][api-ref]:

- `minReplicas: 2`
- `maxReplicas: 10`
- [CPU][cpu-ref] target around 60-70%

### 6) Release Flow in [CI/CD][cicd-ref]

Reference flow:

1. Build image from `docker/Dockerfile.backend`.
2. Tag image with commit [SHA][sha-ref] (and semver if applicable).
3. Push image to registry.
4. Apply manifests/overlays for target environment.
5. Run migration `Job` before switching traffic.
6. Monitor rollout status and rollback if probe/error thresholds fail.

Recommended promotion policy:

- Auto deploy to `dev` on merge.
- Manual approval to `staging`.
- Manual approval + checks (tests, security, [SLO][slo-ref]) to `prod`.

### 7) Observability Baseline

Minimum signals to collect:

- Logs: structured [JSON][json-ref] logs with request [ID][id-ref] and tenant [ID][id-ref].
- Metrics: request rate, error rate, latency, [CPU][cpu-ref]/memory, restart count.
- Tracing: [API][api-ref] to worker and external dependency spans.

Useful [SLO][slo-ref] examples:

- 99.9% monthly [API][api-ref] availability.
- p95 latency under defined threshold for critical endpoints.
- Error rate below 1% for non-4xx responses.

### 8) Security and Policy Guardrails

- Run containers as non-root.
- Use read-only root filesystem when possible.
- Enforce image provenance and vulnerability scans in pipeline.
- Restrict [RBAC][rbac-ref] to least privilege per service account.
- Keep secrets in managed secret backends if available.

### 9) Incremental Rollout Plan for This Repository

1. Start by deploying only `backend-api` to `mini-baas-dev`.
2. Add probes, resource limits, and [HPA][hpa-ref].
3. Add `staging` namespace and promotion gates.
4. Introduce migration `Job` and rollback automation.
5. Finalize production hardening: policies, alerts, and [SLO][slo-ref] dashboards.

This approach keeps complexity under control while delivering immediate operational value.

[api-ref]: https://en.wikipedia.org/wiki/API
[cicd-ref]: https://en.wikipedia.org/wiki/CI/CD
[cpu-ref]: https://en.wikipedia.org/wiki/Central_processing_unit
[devops-ref]: https://en.wikipedia.org/wiki/DevOps
[hpa-ref]: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
[http-ref]: https://en.wikipedia.org/wiki/HTTP
[https-ref]: https://en.wikipedia.org/wiki/HTTPS
[iac-ref]: https://en.wikipedia.org/wiki/Infrastructure_as_code
[id-ref]: https://en.wikipedia.org/wiki/Identifier
[json-ref]: https://www.json.org/json-en.html
[jwt-ref]: https://jwt.io/introduction
[k8s-ref]: https://kubernetes.io/docs/concepts/overview/
[rbac-ref]: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
[sha-ref]: https://en.wikipedia.org/wiki/SHA-2
[slo-ref]: https://sre.google/sre-book/service-level-objectives/
[sre-ref]: https://en.wikipedia.org/wiki/Site_reliability_engineering
[tls-ref]: https://en.wikipedia.org/wiki/Transport_Layer_Security
[url-ref]: https://en.wikipedia.org/wiki/URL
[yaml-ref]: https://yaml.org/spec/1.2.2/
