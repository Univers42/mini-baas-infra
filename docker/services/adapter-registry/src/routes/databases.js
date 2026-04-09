/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databases.js                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 16:33:08 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 16:57:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const { Router } = require('express');
const { tenantQuery, adminQuery } = require('../lib/db');
const { encrypt, decrypt } = require('../lib/crypto');
const { requireUser, requireServiceOrUser, requireServiceRole } = require('../lib/jwt');
const router = Router();
const VALID_ENGINES = ['postgresql', 'mongodb', 'mysql', 'redis', 'sqlite'];



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
    const result = await tenantQuery(
      req.user.id,
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


// List registered databases for the authenticated user (RLS filters by tenant)
router.get('/', requireUser, async (req, res) => {
  try {
    const result = await tenantQuery(
      req.user.id,
      `SELECT id, tenant_id, engine, name, created_at, last_healthy_at
      FROM tenant_databases ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    req.log.error({ err }, 'Failed to list databases');
    res.status(500).json({ success: false, error: { code: 'internal_error', message: 'Failed to list databases' } });
  }
});


// Get a specific database (without connection string) — RLS enforces ownership
router.get('/:id', requireUser, async (req, res) => {
  try {
    const result = await tenantQuery(
      req.user.id,
      `SELECT id, tenant_id, engine, name, created_at, last_healthy_at
      FROM tenant_databases WHERE id = $1`,
      [req.params.id]
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


// Get decrypted connection string (internal use by query-router) — RLS enforces ownership
router.get('/:id/connect', requireServiceOrUser, async (req, res) => {
  try {
    const result = await tenantQuery(
      req.user.id,
      `SELECT id, engine, name, connection_enc, connection_iv, connection_tag, connection_salt
       FROM tenant_databases WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'not_found', message: 'Database not found' } });
    }
    const row = result.rows[0];
    const connectionString = await decrypt(row.connection_enc, row.connection_iv, row.connection_tag, row.connection_salt);
    await tenantQuery(req.user.id, 'UPDATE tenant_databases SET last_healthy_at = now() WHERE id = $1', [row.id]);
    res.json({ success: true, data: { id: row.id, engine: row.engine, name: row.name, connection_string: connectionString } });
  } catch (err) {
    req.log.error({ err }, 'Failed to get connection');
    res.status(500).json({ success: false, error: { code: 'internal_error', message: 'Failed to get connection' } });
  }
});


// Admin-only: delete a tenant's database entry (bypasses RLS via superuser)
router.delete('/:id', requireServiceRole, async (req, res) => {
  try {
    const result = await adminQuery(
      'DELETE FROM tenant_databases WHERE id = $1 RETURNING id',
      [req.params.id]
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
