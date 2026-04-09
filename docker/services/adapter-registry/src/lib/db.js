// File: docker/services/adapter-registry/src/lib/db.js
const { Pool } = require('pg');

let pool;

const initDb = async (logger) => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected PG pool error');
  });

  // Ensure adapter registry tables exist
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_databases (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        TEXT NOT NULL,
        engine           TEXT NOT NULL CHECK (engine IN ('postgresql','mongodb','mysql','redis','sqlite')),
        name             TEXT NOT NULL,
        connection_enc   BYTEA NOT NULL,
        connection_iv    BYTEA NOT NULL,
        connection_tag   BYTEA NOT NULL,
        created_at       TIMESTAMPTZ DEFAULT now(),
        last_healthy_at  TIMESTAMPTZ,
        UNIQUE(tenant_id, name)
      );
    `);
    logger.info('Adapter registry tables ready');
  } finally {
    client.release();
  }
};

const query = (text, params) => pool.query(text, params);
const getPool = () => pool;

module.exports = { initDb, query, getPool };
