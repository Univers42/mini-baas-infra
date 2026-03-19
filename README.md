# mini-baas-infra

Tool-agnostic Kubernetes infrastructure repository for the mini-baas platform.

## Purpose

This repository is intentionally independent from Kustomize or Helm.
It centralizes environment contracts, service deployment conventions, and delivery workflows.

## Structure

- `docs/`: architecture decisions and operational notes.
- `platform/`: cluster and namespace-level conventions.
- `services/contracts/`: per-service deployment contract docs.
- `deployments/base/`: canonical Kubernetes resource definitions.
- `deployments/overlays/`: environment-specific customizations.
- `tooling/kustomize/`: optional Kustomize entrypoints.
- `tooling/helm/`: optional Helm entrypoints.
- `argocd/applications/`: optional GitOps app manifests.
- `scripts/`: platform bootstrap and promotion helpers.

## Services in Scope

- `api-gateway`
- `auth-service`
- `dynamic-api`
- `schema-service`

`shared-library` is treated as a build-time dependency unless it evolves into a network service.
a