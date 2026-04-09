/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   db.js                                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:33:44 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:33:45 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// File: docker/services/adapter-registry/src/lib/db.js
const { Pool } = require('pg');

/** Superuser pool – used ONLY for DDL / schema migrations at startup. */
let adminPool;

/** Limited-privilege pool – adapter_registry_role with RLS enforced. */
let tenantPool;

const initDb = async (logger) => {
  // ── Admin pool (superuser) for one-time DDL ──────────────────────
  adminPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });

  adminPool.on('error', (err) => {
    logger.error({ err }, 'Unexpected admin PG pool error');
  });

  // Ensure adapter registry table exists (idempotent)
  const client = await adminPool.connect();
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
        connection_salt  BYTEA,
        created_at       TIMESTAMPTZ DEFAULT now(),
        last_healthy_at  TIMESTAMPTZ,
        UNIQUE(tenant_id, name)
      );
    `);
    logger.info('Adapter registry tables ready');
  } finally {
    client.release();
  }

  // ── Tenant pool (limited role, RLS enforced) ─────────────────────
  const dbUser = process.env.ADAPTER_REGISTRY_DB_USER || 'adapter_registry_role';
  const dbPass = process.env.ADAPTER_REGISTRY_DB_PASSWORD || 'adapter_registry_pw';
  // Build the limited-role connection string from DATABASE_URL
  const baseUrl = new URL(process.env.DATABASE_URL);
  baseUrl.username = dbUser;
  baseUrl.password = dbPass;

  tenantPool = new Pool({
    connectionString: baseUrl.toString(),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  tenantPool.on('error', (err) => {
    logger.error({ err }, 'Unexpected tenant PG pool error');
  });
};

/**
 * Execute a query scoped to a specific tenant via RLS.
 *
 * Acquires a client, opens a transaction, sets `app.current_user_id`
 * to the caller's sub, runs the query, then commits.
 * This ensures Postgres RLS policies filter every row by tenant.
 */
const tenantQuery = async (userId, text, params) => {
  const client = await tenantPool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(userId)]);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Execute a query as superuser (admin pool).
 * Only use for operations that intentionally bypass RLS (e.g. admin delete).
 */
const adminQuery = (text, params) => adminPool.query(text, params);

const getPool = () => tenantPool;

module.exports = { initDb, tenantQuery, adminQuery, getPool };
