# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    create-bucket.sh                                   :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2026/04/09 23:34:43 by dlesieur          #+#    #+#              #
#    Updated: 2026/04/09 23:34:44 by dlesieur         ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

#!/usr/bin/env bash
# File: docker/services/minio/tools/create-bucket.sh
# Description: Create a new bucket in MinIO using the mc (MinIO Client) CLI
# Usage: ./create-bucket.sh <bucket-name>
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <bucket-name>"
  exit 1
fi

BUCKET_NAME="$1"

echo "Configuring MinIO client alias..."
docker compose exec minio mc alias set local http://localhost:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"

echo "Creating bucket: ${BUCKET_NAME}"
docker compose exec minio mc mb "local/${BUCKET_NAME}"
echo "Bucket '${BUCKET_NAME}' created."
