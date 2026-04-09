// File: docker/services/storage-router/src/server.js
const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { register } = require('prom-client');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// ─── Environment validation ──────────────────────────────────────
const required = ['JWT_SECRET', 'S3_ENDPOINT'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3040);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const JWT_SECRET = process.env.JWT_SECRET;
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

// ─── JWT middleware ──────────────────────────────────────────────
const requireUser = (req, res, next) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'unauthorized', message: 'Bearer token required' } });
  }
  try {
    const claims = jwt.verify(auth.slice(7).trim(), JWT_SECRET, { algorithms: ['HS256'] });
    if (!claims?.sub) throw new Error('missing sub');
    req.user = { id: claims.sub, email: claims.email || null, role: claims.role || null };
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'invalid_token', message: 'Invalid JWT' } });
  }
};

// ─── App ─────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '16kb' }));

app.use((req, _res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
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

// ─── Prometheus metrics ──────────────────────────────────────────
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

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
