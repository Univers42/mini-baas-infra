# Project Status: BaaS Integration Snapshot

## Purpose

This note captures the current state of the local BaaS infrastructure and the practical next steps.

## Current State

The project is running as a Docker Compose-first stack with Kong as ingress and GoTrue/PostgREST/Realtime/MinIO/Studio and supporting services wired into the same environment.

The previous gateway-integration blocker is no longer the primary issue. Route-level API key enforcement, CORS, and test automation are already implemented and running through CI.

## What Is Working

- Kong declarative routing is active for auth, rest, realtime, storage, and admin endpoints.
- Route-level plugins are active for key-auth, rate limiting, and storage request-size limiting.
- Repeatable test suites exist for Phases 1 through 13 and are wired through `make tests`.
- GitHub Actions runs shell checks and full compose integration tests on push and pull request.

## Current Gaps

The main remaining issues are alignment and hardening rather than initial integration:

1. Documentation drift in a few files (status wording, command references, and endpoint expectations).
2. A few late-phase test assertions are permissive and should be tightened.
3. Gateway policy is suitable for local development but still needs production-oriented hardening.
4. Service contract docs need deeper operational detail beyond placeholders.

## Immediate Priorities

1. Keep docs aligned with the current stack behavior and available Make targets.
2. Tighten Phase 11-13 assertions so soft-pass checks become explicit validations.
3. Keep REST metadata endpoints as the near-term contract for gateway health and documentation.
4. Define an environment-specific security profile for CORS origins and key management.

## Summary

The project is in a functional and testable state for local BaaS development. The next phase is reliability and documentation hardening, not first-time gateway bring-up.
