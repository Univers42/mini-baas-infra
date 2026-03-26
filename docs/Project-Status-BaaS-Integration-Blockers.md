# Project Status: BaaS Integration Blockers

## Purpose

This note summarizes where the project currently stands, the main technical blocker I am facing, and where I need feedback from partners.

## Current Situation

I have the infrastructure stack running with Docker Compose and prebuilt images for key services (Kong, Postgres, GoTrue, PostgREST, Realtime, Redis, MinIO, Supavisor, Studio, and Trino).

The main blocker is adapting those prebuilt images to our specific Backend as a Service behavior without changing service source code.

## Main Blocker

### 1) Prebuilt image customization limits

I am relying on already built images, so I cannot edit internal application code. This limits customization to:

- Environment variables
- Mounted configuration files
- Startup command flags
- Sidecar or companion containers

If required behavior is not exposed through those mechanisms, I currently have no direct way to implement it.

### 2) Kong API gateway configuration is not yet functional for our BaaS flow

The biggest practical issue right now is Kong.

I still need to make Kong route and enforce policies correctly for this BaaS setup, including:

- Route mapping for auth, REST, realtime, storage, and admin endpoints
- Correct upstream targets and ports for each internal service
- Plugin behavior (auth, key handling, CORS, request/response transforms)
- Service-to-service and public client access patterns

Because Kong is running from a prebuilt image, I cannot change internal source behavior. I need to solve this only through declarative config and runtime settings.

## Why This Is Difficult

- Each service has specific expectations for headers, tokens, and URL paths.
- Kong must be configured as the central ingress, but mistakes in one route/plugin can break cross-service flows.
- Without source-level changes, debugging options are narrower and often depend on logs plus iterative config updates.

## What I Need Feedback On

I would like partner feedback on these decisions:

1. Should we keep a strict prebuilt-image-only strategy, or allow custom image layers when configuration is insufficient?
2. What is the minimal gateway policy set we want in phase 1 (routing only vs. routing + auth + transforms)?
3. Do we agree on a canonical endpoint map for all BaaS modules before continuing Kong fine-tuning?
4. Should we add a dedicated validation checklist (smoke tests per route) before marking gateway setup as complete?

## Proposed Short-Term Plan

1. Freeze and document expected external API paths.
2. Build a minimal Kong declarative config that only performs route-to-upstream mapping.
3. Add plugins incrementally (CORS, auth, transforms) and validate each step.
4. Add repeatable smoke tests for auth, SQL/REST access, and realtime paths.

## Risks If Unresolved

- Delays in making the stack usable by application developers
- Inconsistent behavior between local environments
- Rework risk if we later decide the prebuilt-only approach is too restrictive

## Summary

The project is progressing, but gateway integration is currently the critical bottleneck. The key challenge is making Kong fully operational for our BaaS architecture while staying within prebuilt image constraints.

I need alignment on customization boundaries and gateway scope to unblock the next implementation phase.
