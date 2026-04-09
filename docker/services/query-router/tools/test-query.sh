# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    test-query.sh                                      :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2026/04/09 23:36:34 by dlesieur          #+#    #+#              #
#    Updated: 2026/04/09 23:36:35 by dlesieur         ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

#!/usr/bin/env bash
# File: docker/services/query-router/tools/test-query.sh
# Description: Send a test query through the query-router service
# Usage: ./test-query.sh [database] [query]
set -euo pipefail

DATABASE="${1:-postgres}"
QUERY="${2:-SELECT 1 AS ok}"
ROUTER_URL="${ROUTER_URL:-http://localhost:3300}"

echo "Routing query to '${DATABASE}': ${QUERY}"
curl -s -X POST "${ROUTER_URL}/api/v1/query" \
  -H "Content-Type: application/json" \
  -d "{\"database\": \"${DATABASE}\", \"query\": \"${QUERY}\"}" | jq .

echo "Query test complete."
