#!/usr/bin/env bash
# File: docker/services/mongo-api/tools/seed.sh
# Description: Seed the mock_catalog collection with sample data via the Mongo API
# Usage: ./seed.sh
set -euo pipefail

API_URL="${MONGO_API_URL:-http://localhost:3100}"
COLLECTION="mock_catalog"

echo "Seeding ${COLLECTION} with sample data …"

curl -s -X POST "${API_URL}/api/v1/${COLLECTION}" \
  -H "Content-Type: application/json" \
  -d '[
    {"name": "Widget A", "category": "electronics", "price": 29.99, "stock": 150},
    {"name": "Widget B", "category": "electronics", "price": 49.99, "stock": 80},
    {"name": "Gadget X", "category": "accessories", "price": 9.99,  "stock": 500},
    {"name": "Gadget Y", "category": "accessories", "price": 14.99, "stock": 320}
  ]' | jq .

echo "Seeding complete."
