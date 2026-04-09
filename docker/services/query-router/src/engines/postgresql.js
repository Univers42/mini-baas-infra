/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   postgresql.js                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:36:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:36:23 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// File: docker/services/query-router/src/engines/postgresql.js
// PostgreSQL query engine for query-router
const pg = require('pg');

const TABLE_RE = /^[a-zA-Z_]\w{0,63}$/;
const COL_RE = /^[a-zA-Z_]\w*$/;

/** Validate a column name against the safe pattern. */
function validateCol(name) {
  if (!COL_RE.test(name)) throw new Error(`Invalid column: ${name}`);
}

/** Build a parameterised WHERE clause from a filter object. */
function buildWhere(filterObj, params, startIdx) {
  let idx = startIdx;
  const parts = Object.entries(filterObj).map(([k, v]) => {
    validateCol(k);
    params.push(v);
    return `"${k}" = $${idx++}`;
  });
  return { clause: parts.join(' AND '), nextIdx: idx };
}

/** Build a SELECT query. */
function buildSelect(table, filter, sort, limit, offset) {
  let sql = `SELECT * FROM "${table}"`;
  const params = [];
  let idx = 1;

  if (filter && typeof filter === 'object') {
    const w = buildWhere(filter, params, idx);
    idx = w.nextIdx;
    if (w.clause) sql += ` WHERE ${w.clause}`;
  }

  if (sort && typeof sort === 'string') {
    const [col, dir] = sort.split(':');
    if (COL_RE.test(col)) {
      sql += ` ORDER BY "${col}" ${dir === 'desc' ? 'DESC' : 'ASC'}`;
    }
  }

  sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(Math.min(limit, 100), Math.max(offset, 0));
  return { sql, params };
}

/** Build an INSERT query. */
function buildInsert(table, data) {
  if (!data || typeof data !== 'object') throw new Error('data object required for insert');
  const cols = Object.keys(data).filter(k => COL_RE.test(k));
  const vals = cols.map(c => data[c]);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const colList = cols.map(c => `"${c}"`).join(', ');
  const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return { sql, params: vals };
}

/** Build an UPDATE query. */
function buildUpdate(table, data, filter) {
  if (!data || typeof data !== 'object') throw new Error('data object required for update');
  if (!filter || typeof filter !== 'object') throw new Error('filter required for update');
  const setCols = Object.keys(data).filter(k => COL_RE.test(k));
  const params = [];
  let idx = 1;
  const setClause = setCols.map(c => { params.push(data[c]); return `"${c}" = $${idx++}`; }).join(', ');
  const w = buildWhere(filter, params, idx);
  const sql = `UPDATE "${table}" SET ${setClause} WHERE ${w.clause} RETURNING *`;
  return { sql, params };
}

/** Build a DELETE query. */
function buildDelete(table, filter) {
  if (!filter || typeof filter !== 'object') throw new Error('filter required for delete');
  const params = [];
  const w = buildWhere(filter, params, 1);
  const sql = `DELETE FROM "${table}" WHERE ${w.clause} RETURNING *`;
  return { sql, params };
}

/**
 * Execute a query against a PostgreSQL database
 * @param {string} connectionString - PostgreSQL connection URI
 * @param {string} table - Table name
 * @param {object} body - Query body { action, data, filter, sort, limit, offset }
 */
async function query(connectionString, table, body = {}) {
  const { action = 'select', data, filter, sort, limit = 20, offset = 0 } = body;

  if (!TABLE_RE.test(table)) {
    throw new Error('Invalid table name');
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    switch (action) {
      case 'select': {
        const q = buildSelect(table, filter, sort, limit, offset);
        return (await client.query(q.sql, q.params)).rows;
      }
      case 'insert': {
        const q = buildInsert(table, data);
        return (await client.query(q.sql, q.params)).rows[0];
      }
      case 'update': {
        const q = buildUpdate(table, data, filter);
        return (await client.query(q.sql, q.params)).rows;
      }
      case 'delete': {
        const q = buildDelete(table, filter);
        return { deleted: (await client.query(q.sql, q.params)).rowCount };
      }
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  } finally {
    await client.end();
  }
}

/**
 * List all user tables in the public schema
 * @param {string} connectionString - PostgreSQL connection URI
 * @returns {Promise<string[]>} Array of table names
 */
async function listTables(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    return result.rows.map(r => r.table_name);
  } finally {
    await client.end();
  }
}

module.exports = { query, listTables };
