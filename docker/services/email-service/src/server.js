/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   server.js                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:34:13 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/11 12:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const nodemailer = require('nodemailer');

// ─── Environment validation ──────────────────────────────────────
// JWT verification is handled by Kong; JWT_SECRET no longer required here.
const required = ['SMTP_HOST'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3030);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
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
app.use(express.json({ limit: '64kb' }));

// Correlation ID is injected by Kong's correlation-id plugin (X-Request-ID).
app.use((req, _res, next) => {
  req.requestId = req.headers['x-request-id'] || 'no-request-id';
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

// Prometheus metrics are now exposed by Kong's prometheus plugin on :8001/metrics.

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
