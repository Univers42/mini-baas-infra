/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collections.js                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:35:26 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:35:27 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// File: docker/services/mongo-api/src/routes/collections.js
const { Router } = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../lib/mongo');
const { requireUser } = require('../middleware/auth');
const { httpRequestDuration, mongoOperations } = require('../lib/metrics');

const router = Router();
const COLLECTION_NAME_PATTERN = /^[\w-]{1,64}$/;

// ─── Helpers ─────────────────────────────────────────────────────
const ok = (res, status, data, meta) => {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
};

const fail = (res, status, code, message, details) => {
  const payload = { success: false, error: { code, message } };
  if (details) payload.error.details = details;
  return res.status(status).json(payload);
};

const parseCollectionName = (req, res) => {
  const { name } = req.params;
  if (!COLLECTION_NAME_PATTERN.test(name)) {
    fail(res, 400, 'invalid_collection', 'Collection name must match ^[a-zA-Z0-9_-]{1,64}$');
    return null;
  }
  return name;
};

const parseObjectId = (value) => {
  if (!ObjectId.isValid(value)) return null;
  return new ObjectId(value);
};

const parsePagination = (req) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  return { limit, offset };
};

const parseSort = (rawSort) => {
  if (!rawSort || typeof rawSort !== 'string') return { created_at: -1 };
  const [field, direction] = rawSort.split(':');
  if (!field || !/^\w{1,64}$/.test(field)) return { created_at: -1 };
  return { [field]: String(direction || 'asc').toLowerCase() === 'desc' ? -1 : 1 };
};

const parseFilter = (rawFilter) => {
  if (!rawFilter || typeof rawFilter !== 'string') return {};
  const parsed = JSON.parse(rawFilter);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('filter must be a JSON object');
  }
  const safeFilter = { ...parsed };
  delete safeFilter.owner_id;
  delete safeFilter._id;
  return safeFilter;
};

const normalize = (item) => ({ ...item, id: String(item._id), _id: undefined });

// ─── Create document ─────────────────────────────────────────────
router.post('/:name/documents', requireUser, async (req, res) => {
  const collectionName = parseCollectionName(req, res);
  if (!collectionName) return;

  const input = req.body?.document;
  if (!input || Array.isArray(input) || typeof input !== 'object') {
    return fail(res, 400, 'invalid_payload', 'Body must include a document object');
  }

  const document = { ...input };
  if (Object.hasOwn(document, '_id') || Object.hasOwn(document, 'owner_id')) {
    return fail(res, 400, 'forbidden_fields', 'document must not include _id or owner_id');
  }

  const now = new Date();
  document.owner_id = req.user.id;
  document.created_at = now;
  document.updated_at = now;

  const db = getDb();
  const result = await db.collection(collectionName).insertOne(document);
  mongoOperations.inc({ operation: 'insert', collection: collectionName });

  return ok(res, 201, { id: String(result.insertedId), ...document });
});

// ─── List documents ──────────────────────────────────────────────
router.get('/:name/documents', requireUser, async (req, res) => {
  const collectionName = parseCollectionName(req, res);
  if (!collectionName) return;

  try {
    const { limit, offset } = parsePagination(req);
    const sort = parseSort(req.query.sort);
    const extraFilter = parseFilter(req.query.filter);
    const query = { owner_id: req.user.id, ...extraFilter };

    const db = getDb();
    const collection = db.collection(collectionName);
    const [items, total] = await Promise.all([
      collection.find(query).sort(sort).skip(offset).limit(limit).toArray(),
      collection.countDocuments(query),
    ]);
    mongoOperations.inc({ operation: 'find', collection: collectionName });

    return ok(res, 200, items.map(normalize), { total, limit, offset });
  } catch (error) {
    return fail(res, 400, 'invalid_filter', 'Invalid filter query parameter', error.message);
  }
});

// ─── Get single document ─────────────────────────────────────────
router.get('/:name/documents/:id', requireUser, async (req, res) => {
  const collectionName = parseCollectionName(req, res);
  if (!collectionName) return;

  const objectId = parseObjectId(req.params.id);
  if (!objectId) {
    return fail(res, 400, 'invalid_id', 'Document id is not a valid ObjectId');
  }

  const db = getDb();
  const item = await db.collection(collectionName).findOne({ _id: objectId, owner_id: req.user.id });
  mongoOperations.inc({ operation: 'findOne', collection: collectionName });
  if (!item) {
    return fail(res, 404, 'not_found', 'Document not found');
  }
  return ok(res, 200, normalize(item));
});

// ─── Update document ─────────────────────────────────────────────
router.patch('/:name/documents/:id', requireUser, async (req, res) => {
  const collectionName = parseCollectionName(req, res);
  if (!collectionName) return;

  const objectId = parseObjectId(req.params.id);
  if (!objectId) {
    return fail(res, 400, 'invalid_id', 'Document id is not a valid ObjectId');
  }

  const patch = req.body?.patch;
  if (!patch || Array.isArray(patch) || typeof patch !== 'object') {
    return fail(res, 400, 'invalid_payload', 'Body must include a patch object');
  }

  if (Object.hasOwn(patch, '_id') || Object.hasOwn(patch, 'owner_id')) {
    return fail(res, 400, 'forbidden_fields', 'patch must not include _id or owner_id');
  }

  const update = { ...patch, updated_at: new Date() };

  const db = getDb();
  const result = await db.collection(collectionName).findOneAndUpdate(
    { _id: objectId, owner_id: req.user.id },
    { $set: update },
    { returnDocument: 'after', includeResultMetadata: false }
  );
  mongoOperations.inc({ operation: 'update', collection: collectionName });

  if (!result) {
    return fail(res, 404, 'not_found', 'Document not found');
  }
  return ok(res, 200, normalize(result));
});

// ─── Delete document ─────────────────────────────────────────────
router.delete('/:name/documents/:id', requireUser, async (req, res) => {
  const collectionName = parseCollectionName(req, res);
  if (!collectionName) return;

  const objectId = parseObjectId(req.params.id);
  if (!objectId) {
    return fail(res, 400, 'invalid_id', 'Document id is not a valid ObjectId');
  }

  const db = getDb();
  const result = await db.collection(collectionName).deleteOne({ _id: objectId, owner_id: req.user.id });
  mongoOperations.inc({ operation: 'delete', collection: collectionName });

  if (result.deletedCount !== 1) {
    return fail(res, 404, 'not_found', 'Document not found');
  }
  return ok(res, 200, { deleted: true });
});

module.exports = router;
