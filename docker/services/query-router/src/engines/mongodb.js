/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mongodb.js                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:36:20 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:36:21 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// File: docker/services/query-router/src/engines/mongodb.js
// MongoDB query engine for query-router
const { MongoClient } = require('mongodb');

const COLL_RE = /^[\w-]{1,64}$/;

/** Parse a sort parameter into a MongoDB sort object. */
function parseSort(sort) {
  if (sort && typeof sort === 'object') return sort;
  if (typeof sort === 'string') {
    const [field, dir] = sort.split(':');
    if (field) return { [field]: dir === 'desc' ? -1 : 1 };
  }
  return undefined;
}

/** Normalise a Mongo document: _id → id string. */
function normalise(doc) {
  return { ...doc, id: String(doc._id), _id: undefined };
}

/** Connect to the database described by a connection string. */
function getDbFromUrl(client, connectionString) {
  const url = new URL(connectionString);
  const dbName = url.pathname.slice(1) || 'test';
  return client.db(dbName);
}

/** Execute a find query. */
async function execFind(coll, filter, sort, limit, offset) {
  const safeFilter = { ...filter };
  delete safeFilter.$where;

  let cursor = coll.find(safeFilter);
  const sortObj = parseSort(sort);
  if (sortObj) cursor = cursor.sort(sortObj);
  cursor = cursor.skip(Math.max(offset, 0)).limit(Math.min(limit, 100));
  const items = await cursor.toArray();
  return items.map(normalise);
}

/**
 * Execute a query against a MongoDB database
 * @param {string} connectionString - MongoDB connection URI
 * @param {string} collection - Collection name
 * @param {object} body - Query body { action, data, filter, sort, limit, offset }
 */
async function query(connectionString, collection, body = {}) {
  const { action = 'find', data, filter = {}, sort, limit = 20, offset = 0 } = body;

  if (!COLL_RE.test(collection)) {
    throw new Error('Invalid collection name');
  }

  const client = new MongoClient(connectionString, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 5,
  });

  await client.connect();

  try {
    const db = getDbFromUrl(client, connectionString);
    const coll = db.collection(collection);

    switch (action) {
      case 'find':
        return execFind(coll, filter, sort, limit, offset);

      case 'insertOne': {
        if (!data || typeof data !== 'object') throw new Error('data object required for insertOne');
        const result = await coll.insertOne(data);
        return { id: String(result.insertedId), ...data };
      }

      case 'updateMany': {
        if (!data || typeof data !== 'object') throw new Error('data object required for updateMany');
        if (!filter || typeof filter !== 'object') throw new Error('filter required for updateMany');
        const result = await coll.updateMany(filter, { $set: data });
        return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
      }

      case 'deleteMany': {
        if (!filter || typeof filter !== 'object') throw new Error('filter required for deleteMany');
        const result = await coll.deleteMany(filter);
        return { deletedCount: result.deletedCount };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  } finally {
    await client.close();
  }
}

/**
 * List all collection names in the database
 * @param {string} connectionString - MongoDB connection URI
 * @returns {Promise<string[]>} Array of collection names
 */
async function listTables(connectionString) {
  const client = new MongoClient(connectionString, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 5,
  });
  await client.connect();
  try {
    const db = getDbFromUrl(client, connectionString);
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    return collections.map(c => c.name).sort();
  } finally {
    await client.close();
  }
}

module.exports = { query, listTables };
