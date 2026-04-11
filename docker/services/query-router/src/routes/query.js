/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   query.js                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:36:28 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/11 12:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const { Router } = require('express');
const postgresqlEngine = require('../engines/postgresql');
const mongodbEngine = require('../engines/mongodb');

const router = Router();
const ADAPTER_REGISTRY_URL = process.env.ADAPTER_REGISTRY_URL;
const SERVICE_TOKEN = process.env.ADAPTER_REGISTRY_SERVICE_TOKEN;

/** Validate that a path segment contains only safe characters. */
const DB_ID_RE = /^[\w-]{1,128}$/;
const validatePathParam = (value) => DB_ID_RE.test(value);

// JWT verification is handled by Kong. We read trusted headers.
const requireUser = (req, res, next) => {
  const id = req.headers['x-user-id'];
  if (!id) {
    return res.status(401).json({ success: false, error: { code: 'unauthorized', message: 'Authenticated user required' } });
  }
  req.user = { id, role: req.headers['x-user-role'] || null };
  next();
};

const ENGINES = {
  postgresql: postgresqlEngine,
  mongodb: mongodbEngine,
};

// Query a registered database's table/collection
// POST /query/:dbId/tables/:table
router.post('/:dbId/tables/:table', requireUser, async (req, res) => {
  try {
    if (!validatePathParam(req.params.dbId)) {
      return res.status(400).json({ success: false, error: { code: 'invalid_param', message: 'Invalid database ID' } });
    }
    // Fetch connection info from adapter-registry using internal service token
    const regResponse = await fetch(`${ADAPTER_REGISTRY_URL}/databases/${encodeURIComponent(req.params.dbId)}/connect`, {
      headers: {
        'X-Service-Token': SERVICE_TOKEN,
        'X-Tenant-Id': req.user.id,
      },
    });

    if (!regResponse.ok) {
      const err = await regResponse.json().catch(() => ({}));
      return res.status(regResponse.status).json(err);
    }

    const { data } = await regResponse.json();
    const engine = ENGINES[data.engine];

    if (!engine) {
      return res.status(400).json({ success: false, error: { code: 'unsupported_engine', message: `Engine '${data.engine}' is not supported yet` } });
    }

    const result = await engine.query(data.connection_string, req.params.table, req.body);
    res.json({ success: true, engine: data.engine, data: result });
  } catch (err) {
    req.log.error({ err }, 'Query execution failed');
    res.status(500).json({ success: false, error: { code: 'query_failed', message: err.message } });
  }
});

// List tables/collections in a registered database
// GET /query/:dbId/tables
router.get('/:dbId/tables', requireUser, async (req, res) => {
  try {
    if (!validatePathParam(req.params.dbId)) {
      return res.status(400).json({ success: false, error: { code: 'invalid_param', message: 'Invalid database ID' } });
    }
    const regResponse = await fetch(`${ADAPTER_REGISTRY_URL}/databases/${encodeURIComponent(req.params.dbId)}/connect`, {
      headers: {
        'X-Service-Token': SERVICE_TOKEN,
        'X-Tenant-Id': req.user.id,
      },
    });

    if (!regResponse.ok) {
      const err = await regResponse.json().catch(() => ({}));
      return res.status(regResponse.status).json(err);
    }

    const { data } = await regResponse.json();
    const engine = ENGINES[data.engine];

    if (!engine) {
      return res.status(400).json({ success: false, error: { code: 'unsupported_engine', message: `Engine '${data.engine}' not supported` } });
    }

    const tables = await engine.listTables(data.connection_string);
    res.json({ success: true, engine: data.engine, data: tables });
  } catch (err) {
    req.log.error({ err }, 'Table listing failed');
    res.status(500).json({ success: false, error: { code: 'query_failed', message: err.message } });
  }
});

module.exports = router;
