// File: docker/services/adapter-registry/src/routes/databases.js
const { Router } = require('express');
const { query } = require('../lib/db');
const { encrypt, decrypt } = require('../lib/crypto');
const { requireUser, requireServiceOrUser } = require('../lib/jwt');

const router = Router();

const VALID_ENGINES = ['postgresql', 'mongodb', 'mysql', 'redis', 'sqlite'];

// Register a new database
router.post('/', requireUser, async (req, res) => {
  try {
    const { engine, name, connection_string } = req.body;

    if (!engine || !VALID_ENGINES.includes(engine)) {
      return res.status(400).json({ success: false, error: { code: 'invalid_engine', message: `Engine must be one of: ${VALID_ENGINES.join(', ')}` } });
    }
    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 64) {
      return res.status(400).json({ success: false, error: { code: 'invalid_name', message: 'Name is required (1-64 chars)' } });
    }
    if (!connection_string || typeof connection_string !== 'string') {
      return res.status(400).json({ success: false, error: { code: 'invalid_connection', message: 'Connection string is required' } });
    }

    const { encrypted, iv, tag, salt } = await encrypt(connection_string);

    const result = await query(
      `INSERT INTO tenant_databases (tenant_id, engine, name, connection_enc, connection_iv, connection_tag, connection_salt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, tenant_id, engine, name, created_at`,
      [req.user.id, engine, name, encrypted, iv, tag, salt]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: { code: 'duplicate', message: 'A database with this name already exists for your tenant' } });
    }
    req.log.error({ err }, 'Failed to register database');
    res.status(500).json({ success: false, error: { code: 'internal_error', message: 'Failed to register database' } });
  }
});

// List registered databases for the authenticated user
router.get('/', requireUser, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, tenant_id, engine, name, created_at, last_healthy_at
       FROM tenant_databases WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    req.log.error({ err }, 'Failed to list databases');
    res.status(500).json({ success: false, error: { code: 'internal_error', message: 'Failed to list databases' } });
  }
});

// Get a specific database (without connection string)
router.get('/:id', requireUser, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, tenant_id, engine, name, created_at, last_healthy_at
       FROM tenant_databases WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'not_found', message: 'Database not found' } });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    req.log.error({ err }, 'Failed to get database');
    res.status(500).json({ success: false, error: { code: 'internal_error', message: 'Failed to get database' } });
  }
});

// Get decrypted connection string (internal use by query-router)
router.get('/:id/connect', requireServiceOrUser, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, engine, name, connection_enc, connection_iv, connection_tag, connection_salt
       FROM tenant_databases WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'not_found', message: 'Database not found' } });
    }

    const row = result.rows[0];
    const connectionString = await decrypt(row.connection_enc, row.connection_iv, row.connection_tag, row.connection_salt);

    // Update last_healthy_at
    await query('UPDATE tenant_databases SET last_healthy_at = now() WHERE id = $1', [row.id]);

    res.json({ success: true, data: { id: row.id, engine: row.engine, name: row.name, connection_string: connectionString } });
  } catch (err) {
    req.log.error({ err }, 'Failed to get connection');
    res.status(500).json({ success: false, error: { code: 'internal_error', message: 'Failed to get connection' } });
  }
});

// Delete a registered database
router.delete('/:id', requireUser, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM tenant_databases WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'not_found', message: 'Database not found' } });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    req.log.error({ err }, 'Failed to delete database');
    res.status(500).json({ success: false, error: { code: 'internal_error', message: 'Failed to delete database' } });
  }
});

module.exports = router;
