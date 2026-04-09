// File: docker/services/email-service/src/server.js
const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const crypto = require('node:crypto');
const { register } = require('prom-client');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// ─── Environment validation ──────────────────────────────────────
const required = ['SMTP_HOST', 'JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3030);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const JWT_SECRET = process.env.JWT_SECRET;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@mini-baas.local';

const logger = pino({
  level: LOG_LEVEL,
  base: { service: 'email-service', version: '0.1.0' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ─── Nodemailer transport ────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth:
    process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
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
app.use(express.json({ limit: '64kb' }));

app.use((req, _res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  next();
});

app.use(pinoHttp({ logger, genReqId: (req) => req.requestId }));

// ─── Health ──────────────────────────────────────────────────────
app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', async (_req, res) => {
  try {
    await transporter.verify();
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

// ─── POST /send ──────────────────────────────────────────────────
app.post('/send', requireUser, async (req, res) => {
  try {
    const { to, subject, html, text } = req.body;

    if (!to || typeof to !== 'string') {
      return res.status(400).json({ success: false, error: { code: 'invalid_to', message: '"to" email address is required' } });
    }
    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({ success: false, error: { code: 'invalid_subject', message: '"subject" is required' } });
    }
    if (!html && !text) {
      return res.status(400).json({ success: false, error: { code: 'invalid_body', message: 'At least one of "html" or "text" is required' } });
    }

    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

    logger.info({ messageId: info.messageId, to, userId: req.user.id }, 'Email sent');
    res.json({ success: true, data: { messageId: info.messageId } });
  } catch (err) {
    req.log.error({ err }, 'Failed to send email');
    res.status(500).json({ success: false, error: { code: 'send_failed', message: 'Failed to send email' } });
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
  try {
    await transporter.verify();
    logger.info('SMTP connection verified');
  } catch (err) {
    logger.warn({ err: err.message }, 'SMTP not reachable at startup — emails will fail until SMTP is available');
  }

  server = app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'Email service listening');
  });
};

const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutting down');
  transporter.close();
  server?.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
