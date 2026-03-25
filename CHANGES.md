# Infrastructure Change Log

## 2026-03-25

### Switched To Docker Compose-Only Management

- Replaced the root `Makefile` with a Docker Compose-first workflow.
- Removed all orchestration targets tied to cluster-based deployment tooling.
- Added clear Compose lifecycle targets:
  - `compose-up`
  - `compose-up-build`
  - `compose-ps`
  - `compose-logs`
  - `compose-down`
  - `compose-down-volumes`
  - `compose-restart`
  - `compose-pull`
  - `compose-health`
- Kept Docker image preparation and publishing workflows:
  - `docker-build`
  - `docker-build-<service>`
  - `docker-tag`
  - `docker-push`
  - `build-and-push`
- Updated `README.md` to align with local Docker Compose operations.

### Outcome

The repository is now documented and automated around Docker Compose as the runtime and operations entrypoint.
