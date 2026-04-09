// File: docker/services/mongo-api/src/lib/mongo.js
// MongoDB connection pool with monitoring
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'mini_baas';

let client;
let db;

const connectMongo = async (logger) => {
  client = new MongoClient(MONGO_URI, {
    maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '10'),
    minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '2'),
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    monitorCommands: true,
  });

  client.on('commandFailed', (event) => {
    logger.warn({ command: event.commandName, duration: event.duration }, 'MongoDB command failed');
  });

  await client.connect();
  db = client.db(MONGO_DB_NAME);
  logger.info({ uri: MONGO_URI, database: MONGO_DB_NAME }, 'MongoDB connected');
};

const getDb = () => db;
const getClient = () => client;

const closeMongo = async () => {
  if (client) {
    await client.close();
  }
};

module.exports = { connectMongo, getDb, getClient, closeMongo };
