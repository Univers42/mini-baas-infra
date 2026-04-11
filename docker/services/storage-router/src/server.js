/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   server.js                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:37:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/11 12:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// ─── Environment validation ──────────────────────────────────────
// JWT verification is handled by Kong; JWT_SECRET no longer required here.
const required = ['S3_ENDPOINT'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3040);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const DEFAULT_EXPIRES = Number(process.env.PRESIGN_EXPIRES_SECONDS || 3600);

const logger = pino({
  level: LOG_LEVEL,
  base: { service: 'storage-router', version: '0.1.0' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ─── S3 client (MinIO-compatible) ────────────────────────────────
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true, // required for MinIO
});

// ─── JWT middleware (reads trusted headers from Kong) ──────────
const requireUser = (req, res, next) => {
  const id = req.headers['x-user-id'];
  if (!id) {
    return res.status(401).json({ success: false, error: { code: 'unauthorized', message: 'Authenticated user required' } });
  }
  req.user = { id, email: req.headers['x-user-email'] || null, role: req.headers['x-user-role'] || null };
  next();
};

// ─── App ─────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '16kb' }));

// Correlation ID is injected by Kong's correlation-id plugin (X-Request-ID).
app.use((req, _res, next) => {
  req.requestId = req.headers['x-request-id'] || 'no-request-id';
  next();
});

app.use(pinoHttp({ logger, genReqId: (req) => req.requestId }));

// ─── Health ──────────────────────────────────────────────────────
app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', (_req, res) => res.json({ status: 'ok' }));

// ─── POST /sign/:bucket/*path ────────────────────────────────────
// Generates a presigned GET or PUT URL for the given object.
// Bucket access is enforced by requiring the object key to begin
// with the tenant's user id: <tenant_id>/...
app.post('/sign/:bucket/*', requireUser, async (req, res) => {
  try {
    const bucket = req.params.bucket;
    const objectPath = req.params[0]; // everything after /sign/:bucket/

    if (!bucket || !objectPath) {
      return res.status(400).json({ success: false, error: { code: 'invalid_params', message: 'Bucket and path are required' } });
    }

    // ── Tenant isolation: key must start with tenant_id/ ──────────
    const key = `${req.user.id}/${objectPath}`;

    const method = (req.body.method || 'GET').toUpperCase();
    const expiresIn = Math.min(
      Math.max(Number(req.body.expiresIn) || DEFAULT_EXPIRES, 60),
      86400 // max 24 hours
    );

    let command;
    if (method === 'PUT') {
      command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: req.body.contentType || 'application/octet-stream',
      });
    } else {
      command = new GetObjectCommand({ Bucket: bucket, Key: key });
    }

    const signedUrl = await getSignedUrl(s3, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    logger.info({ bucket, key, method, expiresIn, userId: req.user.id }, 'Presigned URL generated');
    res.json({ success: true, data: { signedUrl, expiresAt, method, bucket, key } });
  } catch (err) {
    req.log.error({ err }, 'Failed to generate presigned URL');
    res.status(500).json({ success: false, error: { code: 'presign_failed', message: 'Failed to generate presigned URL' } });
  }
});

// Prometheus metrics are now exposed by Kong's prometheus plugin on :8001/metrics.

// ─── Error handler ───────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error({ err, requestId: req.requestId }, 'Unhandled error');
  res.status(500).json({ success: false, error: { code: 'internal_error', message: 'Unexpected server error' } });
});

// ─── Startup ─────────────────────────────────────────────────────
let server;

const start = async () => {
  server = app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'Storage router listening');
  });
};

const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutting down');
  server?.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
