// File: docker/services/mongo-api/src/routes/health.js
const { Router } = require('express');
const { getDb } = require('../lib/mongo');
const router = Router();

// Liveness: process running
router.get('/health/live', (req, res) => {
  res.json({ status: 'ok' });
});

// Also support legacy /health endpoint
router.get('/health', async (req, res) => {
  try {
    await getDb().command({ ping: 1 });
    res.json({ success: true, data: { mongo: 'ok' } });
  } catch {
    res.status(503).json({ success: false, error: { code: 'mongo_unavailable', message: 'MongoDB is unavailable' } });
  }
});

// Readiness: MongoDB healthy
router.get('/health/ready', async (req, res) => {
  try {
    await getDb().command({ ping: 1 });
    res.json({ status: 'ready', dependencies: { mongo: 'ok' } });
  } catch {
    res.status(503).json({ status: 'not ready', dependencies: { mongo: 'error' } });
  }
});

module.exports = router;
