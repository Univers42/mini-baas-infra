/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   server.js                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:36:31 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/11 12:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const healthRoutes = require('./routes/health');
const queryRoutes = require('./routes/query');

// ─── Environment validation ──────────────────────────────────────
// JWT verification is handled by Kong; JWT_SECRET no longer required here.
const required = ['ADAPTER_REGISTRY_URL'];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 4001);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logger = pino({
  level: LOG_LEVEL,
  base: { service: 'query-router', version: '0.1.0' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const app = express();
app.use(express.json({ limit: '1mb' }));

// Correlation ID is injected by Kong's correlation-id plugin (X-Request-ID).
app.use((req, _res, next) => {
  req.requestId = req.headers['x-request-id'] || 'no-request-id';
  next();
});

app.use(pinoHttp({ logger, genReqId: (req) => req.requestId }));

// ─── Routes ──────────────────────────────────────────────────────
app.use('/', healthRoutes);
app.use('/query', queryRoutes);

// Prometheus metrics are now exposed by Kong's prometheus plugin on :8001/metrics.

// ─── Error handler ───────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error({ err, requestId: req.requestId }, 'Unhandled error');
  res.status(500).json({ success: false, error: { code: 'internal_error', message: 'Unexpected server error' } });
});

// ─── Startup ─────────────────────────────────────────────────────
let server;

const start = async () => {
  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'query-router listening');
  });
};

// ─── Graceful shutdown ───────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutdown initiated');
  if (server) {
    server.close(() => {
      logger.info('Clean shutdown complete');
      process.exit(0);
    });
  }
  setTimeout(() => process.exit(1), 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start query-router');
  process.exit(1);
});
