/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   001_mock_catalog.js                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:37:43 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:37:44 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// File: scripts/migrations/mongodb/001_mock_catalog.js
// Migration: Create mock_catalog collection with JSON Schema validation
// Run with: mongosh <uri> scripts/migrations/mongodb/001_mock_catalog.js

const DB_NAME = process.env.MONGO_DB_NAME || 'mini_baas';
const COLLECTION = 'mock_catalog';

const db = db || connect(`mongodb://localhost:27017/${DB_NAME}`);

const existing = db.getCollectionNames().filter(n => n === COLLECTION);
if (existing.length === 0) {
  db.createCollection(COLLECTION, {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['owner_id', 'sku', 'name', 'price_cents', 'category', 'created_at', 'updated_at'],
        additionalProperties: true,
        properties: {
          owner_id:    { bsonType: 'string', minLength: 1 },
          sku:         { bsonType: 'string', minLength: 2, maxLength: 64 },
          name:        { bsonType: 'string', minLength: 2, maxLength: 120 },
          category:    { bsonType: 'string', minLength: 2, maxLength: 64 },
          price_cents: { bsonType: 'int', minimum: 0 },
          tags:        { bsonType: 'array', items: { bsonType: 'string' } },
          in_stock:    { bsonType: 'bool' },
          created_at:  { bsonType: 'date' },
          updated_at:  { bsonType: 'date' },
        },
      },
    },
    validationLevel: 'strict',
    validationAction: 'error',
  });
  print(`Created collection: ${COLLECTION}`);
} else {
  db.runCommand({
    collMod: COLLECTION,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['owner_id', 'sku', 'name', 'price_cents', 'category', 'created_at', 'updated_at'],
        additionalProperties: true,
        properties: {
          owner_id:    { bsonType: 'string', minLength: 1 },
          sku:         { bsonType: 'string', minLength: 2, maxLength: 64 },
          name:        { bsonType: 'string', minLength: 2, maxLength: 120 },
          category:    { bsonType: 'string', minLength: 2, maxLength: 64 },
          price_cents: { bsonType: 'int', minimum: 0 },
          tags:        { bsonType: 'array', items: { bsonType: 'string' } },
          in_stock:    { bsonType: 'bool' },
          created_at:  { bsonType: 'date' },
          updated_at:  { bsonType: 'date' },
        },
      },
    },
    validationLevel: 'strict',
    validationAction: 'error',
  });
  print(`Updated validator for: ${COLLECTION}`);
}

db[COLLECTION].createIndex({ owner_id: 1, created_at: -1 });
print(`Index ensured on ${COLLECTION}: {owner_id: 1, created_at: -1}`);
