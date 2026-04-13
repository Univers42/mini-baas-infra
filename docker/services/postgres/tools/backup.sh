#!/usr/bin/env bash
# File: docker/services/postgres/tools/backup.sh
# Description: Run pg_dump inside the postgres container and save a custom-format backup
# Usage: ./backup.sh
set -euo pipefail

BACKUP_FILE="backup_$(date +%Y%m%d).dump"

echo "Creating PostgreSQL backup: ${BACKUP_FILE}"
docker compose exec postgres pg_dump -U postgres -Fc > "${BACKUP_FILE}"
echo "Backup saved to ${BACKUP_FILE}"
