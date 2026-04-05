// File: docker/services/query-router/src/engines/mongodb.js
// MongoDB query engine for query-router
const { MongoClient } = require('mongodb');

/**
 * Execute a query against a MongoDB database
 * @param {string} connectionString - MongoDB connection URI
 * @param {string} collection - Collection name
 * @param {object} body - Query body { action, data, filter, sort, limit, offset }
 */
async function query(connectionString, collection, body = {}) {
  const { action = 'find', data, filter = {}, sort, limit = 20, offset = 0 } = body;

  // Validate collection name
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(collection)) {
    throw new Error('Invalid collection name');
  }

  const client = new MongoClient(connectionString, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 5,
  });

  await client.connect();

  try {
    // Extract DB name from connection string or default
    const url = new URL(connectionString);
    const dbName = url.pathname.slice(1) || 'test';
    const db = client.db(dbName);
    const coll = db.collection(collection);

    switch (action) {
      case 'find': {
        const safeFilter = { ...filter };
        // Remove potentially dangerous operators
        delete safeFilter.$where;

        let cursor = coll.find(safeFilter);

        if (sort && typeof sort === 'object') {
          cursor = cursor.sort(sort);
        } else if (typeof sort === 'string') {
          const [field, dir] = sort.split(':');
          if (field) cursor = cursor.sort({ [field]: dir === 'desc' ? -1 : 1 });
        }

        cursor = cursor.skip(Math.max(offset, 0)).limit(Math.min(limit, 100));
        const items = await cursor.toArray();
        return items.map(doc => ({
          ...doc,
          id: String(doc._id),
          _id: undefined,
        }));
      }

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

module.exports = { query };
