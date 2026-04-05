// File: docker/services/adapter-registry/src/routes/health.js
const { Router } = require('express');
const { getPool } = require('../lib/db');

const router = Router();

// Liveness: process running
router.get('/health/live', (req, res) => {
  res.json({ status: 'ok' });
});

// Readiness: Postgres connection healthy
router.get('/health/ready', async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    res.json({ status: 'ready', dependencies: { postgres: 'ok' } });
  } catch (err) {
    res.status(503).json({ status: 'not ready', dependencies: { postgres: 'error' } });
  }
});

module.exports = router;
