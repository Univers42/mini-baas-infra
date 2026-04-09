/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   server.js                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:35:31 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:53:21 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const crypto = require('node:crypto');
const { register } = require('prom-client');
const { connectMongo, getDb, closeMongo } = require('./lib/mongo');
const { requireUser } = require('./middleware/auth');
const correlationId = require('./middleware/correlationId');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const collectionsRoutes = require('./routes/collections');
const adminRoutes = require('./routes/admin');

// ─── Environment validation ──────────────────────────────────────
const required = ['MONGO_URI', 'JWT_SECRET'];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3010);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logger = pino({
  level: LOG_LEVEL,
  base: { service: 'mongo-api', version: '0.1.0' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(correlationId);
app.use(pinoHttp({ logger, genReqId: (req) => req.requestId }));

// ─── Routes ──────────────────────────────────────────────────────
app.use('/', healthRoutes);
app.use('/collections', collectionsRoutes);
app.use('/admin', adminRoutes);

// ─── Prometheus metrics ──────────────────────────────────────────
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// ─── Error handler ───────────────────────────────────────────────
app.use(errorHandler);

// ─── Startup ─────────────────────────────────────────────────────
let server;

const MOCK_COLLECTION = process.env.MONGO_MOCK_COLLECTION || 'mock_catalog';

const MOCK_COLLECTION_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['owner_id', 'sku', 'name', 'price_cents', 'category', 'created_at', 'updated_at'],
    additionalProperties: true,
    properties: {
      owner_id: { bsonType: 'string', minLength: 1 },
      sku: { bsonType: 'string', minLength: 2, maxLength: 64 },
      name: { bsonType: 'string', minLength: 2, maxLength: 120 },
      category: { bsonType: 'string', minLength: 2, maxLength: 64 },
      price_cents: { bsonType: 'int', minimum: 0 },
      tags: { bsonType: 'array', items: { bsonType: 'string' } },
      in_stock: { bsonType: 'bool' },
      created_at: { bsonType: 'date' },
      updated_at: { bsonType: 'date' },
    },
  },
};

const ensureMongoMockSchema = async (db) => {
  const existing = await db.listCollections({ name: MOCK_COLLECTION }).toArray();
  if (existing.length === 0) {
    await db.createCollection(MOCK_COLLECTION, {
      validator: MOCK_COLLECTION_VALIDATOR,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await db.command({
      collMod: MOCK_COLLECTION,
      validator: MOCK_COLLECTION_VALIDATOR,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }
  await db.collection(MOCK_COLLECTION).createIndex({ owner_id: 1, created_at: -1 });
  logger.info({ collection: MOCK_COLLECTION }, 'Mock schema ready');
};

const start = async () => {
  await connectMongo(logger);
  const db = getDb();
  await ensureMongoMockSchema(db);

  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'mongo-api listening');
  });
};

// ─── Graceful shutdown ───────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutdown initiated');
  if (server) {
    server.close(async () => {
      await closeMongo();
      logger.info('Clean shutdown complete');
      process.exit(0);
    });
  }
  setTimeout(() => process.exit(1), 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start mongo-api');
  process.exit(1);
});
