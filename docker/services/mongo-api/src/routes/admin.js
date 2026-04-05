// File: docker/services/mongo-api/src/routes/admin.js
const { Router } = require('express');
const { getDb } = require('../lib/mongo');
const { requireUser } = require('../middleware/auth');

const router = Router();
const COLLECTION_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

const ok = (res, status, data) => res.status(status).json({ success: true, data });
const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, error: { code, message } });

// ─── List collections ────────────────────────────────────────────
router.get('/collections', requireUser, async (req, res) => {
  const db = getDb();
  const collections = await db.listCollections().toArray();
  return ok(res, 200, collections.map(c => ({ name: c.name, type: c.type })));
});

// ─── Get collection schema ───────────────────────────────────────
router.get('/schemas/:name', requireUser, async (req, res) => {
  const { name } = req.params;
  if (!COLLECTION_NAME_PATTERN.test(name)) {
    return fail(res, 400, 'invalid_collection', 'Collection name must match ^[a-zA-Z0-9_-]{1,64}$');
  }

  const db = getDb();
  const collections = await db.listCollections({ name }).toArray();
  if (collections.length === 0) {
    return fail(res, 404, 'not_found', `Collection '${name}' not found`);
  }

  const info = collections[0];
  return ok(res, 200, {
    name: info.name,
    type: info.type,
    options: info.options || {},
  });
});

// ─── Create or update collection schema ──────────────────────────
router.put('/schemas/:name', requireUser, async (req, res) => {
  const { name } = req.params;
  if (!COLLECTION_NAME_PATTERN.test(name)) {
    return fail(res, 400, 'invalid_collection', 'Collection name must match ^[a-zA-Z0-9_-]{1,64}$');
  }

  // Only service_role may manage schemas
  if (req.user.role !== 'service_role') {
    return fail(res, 403, 'forbidden', 'Only service_role may manage schemas');
  }

  const { validator, validationLevel, validationAction } = req.body || {};
  if (!validator) {
    return fail(res, 400, 'invalid_payload', 'Body must include a validator object');
  }

  const db = getDb();
  const existing = await db.listCollections({ name }).toArray();

  if (existing.length === 0) {
    await db.createCollection(name, {
      validator,
      validationLevel: validationLevel || 'strict',
      validationAction: validationAction || 'error',
    });
  } else {
    await db.command({
      collMod: name,
      validator,
      validationLevel: validationLevel || 'strict',
      validationAction: validationAction || 'error',
    });
  }

  return ok(res, 200, { collection: name, schema: 'applied' });
});

// ─── Drop collection ─────────────────────────────────────────────
router.delete('/schemas/:name', requireUser, async (req, res) => {
  const { name } = req.params;
  if (!COLLECTION_NAME_PATTERN.test(name)) {
    return fail(res, 400, 'invalid_collection', 'Collection name must match ^[a-zA-Z0-9_-]{1,64}$');
  }

  if (req.user.role !== 'service_role') {
    return fail(res, 403, 'forbidden', 'Only service_role may drop collections');
  }

  const db = getDb();
  await db.dropCollection(name);
  return ok(res, 200, { collection: name, dropped: true });
});

// ─── Create index ────────────────────────────────────────────────
router.post('/indexes/:name', requireUser, async (req, res) => {
  const { name } = req.params;
  if (!COLLECTION_NAME_PATTERN.test(name)) {
    return fail(res, 400, 'invalid_collection', 'Collection name must match ^[a-zA-Z0-9_-]{1,64}$');
  }

  if (req.user.role !== 'service_role') {
    return fail(res, 403, 'forbidden', 'Only service_role may manage indexes');
  }

  const { keys, options } = req.body || {};
  if (!keys || typeof keys !== 'object') {
    return fail(res, 400, 'invalid_payload', 'Body must include a keys object');
  }

  const db = getDb();
  const indexName = await db.collection(name).createIndex(keys, options || {});
  return ok(res, 201, { collection: name, index: indexName });
});

module.exports = router;
