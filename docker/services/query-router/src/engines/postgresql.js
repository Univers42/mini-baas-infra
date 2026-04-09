// File: docker/services/query-router/src/engines/postgresql.js
// PostgreSQL query engine for query-router
const pg = require('pg');

/**
 * Execute a query against a PostgreSQL database
 * @param {string} connectionString - PostgreSQL connection URI
 * @param {string} table - Table name
 * @param {object} body - Query body { action, data, filter, sort, limit, offset }
 */
async function query(connectionString, table, body = {}) {
  const { action = 'select', data, filter, sort, limit = 20, offset = 0 } = body;

  // Validate table name
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(table)) {
    throw new Error('Invalid table name');
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    switch (action) {
      case 'select': {
        let sql = `SELECT * FROM "${table}"`;
        const params = [];
        let paramIdx = 1;

        if (filter && typeof filter === 'object') {
          const conditions = Object.entries(filter).map(([key, val]) => {
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) throw new Error(`Invalid column: ${key}`);
            params.push(val);
            return `"${key}" = $${paramIdx++}`;
          });
          if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
        }

        if (sort && typeof sort === 'string') {
          const [col, dir] = sort.split(':');
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
            sql += ` ORDER BY "${col}" ${dir === 'desc' ? 'DESC' : 'ASC'}`;
          }
        }

        sql += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
        params.push(Math.min(limit, 100), Math.max(offset, 0));

        const result = await client.query(sql, params);
        return result.rows;
      }

      case 'insert': {
        if (!data || typeof data !== 'object') throw new Error('data object required for insert');
        const cols = Object.keys(data).filter(k => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
        const vals = cols.map(c => data[c]);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const sql = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await client.query(sql, vals);
        return result.rows[0];
      }

      case 'update': {
        if (!data || typeof data !== 'object') throw new Error('data object required for update');
        if (!filter || typeof filter !== 'object') throw new Error('filter required for update');
        const setCols = Object.keys(data).filter(k => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
        const params = [];
        let idx = 1;
        const setClause = setCols.map(c => { params.push(data[c]); return `"${c}" = $${idx++}`; }).join(', ');
        const whereClause = Object.entries(filter).map(([k, v]) => { params.push(v); return `"${k}" = $${idx++}`; }).join(' AND ');
        const sql = `UPDATE "${table}" SET ${setClause} WHERE ${whereClause} RETURNING *`;
        const result = await client.query(sql, params);
        return result.rows;
      }

      case 'delete': {
        if (!filter || typeof filter !== 'object') throw new Error('filter required for delete');
        const params = [];
        let idx = 1;
        const whereClause = Object.entries(filter).map(([k, v]) => { params.push(v); return `"${k}" = $${idx++}`; }).join(' AND ');
        const sql = `DELETE FROM "${table}" WHERE ${whereClause} RETURNING *`;
        const result = await client.query(sql, params);
        return { deleted: result.rowCount };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  } finally {
    await client.end();
  }
}

module.exports = { query };
