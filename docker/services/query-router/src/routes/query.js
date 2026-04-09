// File: docker/services/query-router/src/routes/query.js
const { Router } = require('express');
const jwt = require('jsonwebtoken');
const postgresqlEngine = require('../engines/postgresql');
const mongodbEngine = require('../engines/mongodb');

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
const ADAPTER_REGISTRY_URL = process.env.ADAPTER_REGISTRY_URL;
const SERVICE_TOKEN = process.env.ADAPTER_REGISTRY_SERVICE_TOKEN;

/** Validate that a path segment contains only safe characters. */
const DB_ID_RE = /^[\w-]{1,128}$/;
const validatePathParam = (value) => DB_ID_RE.test(value);

const requireUser = (req, res, next) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'unauthorized', message: 'Bearer token required' } });
  }
  try {
    const claims = jwt.verify(auth.slice(7).trim(), JWT_SECRET, { algorithms: ['HS256'] });
    if (!claims?.sub) throw new Error('no sub');
    req.user = { id: claims.sub, role: claims.role };
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'invalid_token', message: 'Invalid JWT' } });
  }
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
