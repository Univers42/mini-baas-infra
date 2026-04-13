#!/usr/bin/env bash
# File: docker/services/mongo/tools/backup.sh
# Description: Create a MongoDB backup using mongodump in archive format
# Usage: ./backup.sh
set -euo pipefail

BACKUP_FILE="mongo_backup_$(date +%Y%m%d).archive"

echo "Creating MongoDB backup: ${BACKUP_FILE}"
docker compose exec mongo mongodump --archive > "${BACKUP_FILE}"
echo "Backup saved to ${BACKUP_FILE}"
