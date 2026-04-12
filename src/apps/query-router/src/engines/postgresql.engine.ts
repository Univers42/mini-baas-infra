import { BadRequestException, Injectable } from '@nestjs/common';
import { Client } from 'pg';

const TABLE_REGEX = /^[a-zA-Z_]\w{0,63}$/;
const COLUMN_REGEX = /^[a-zA-Z_]\w*$/;

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

@Injectable()
export class PostgresqlEngine {

  private validateTable(name: string): void {
    if (!TABLE_REGEX.test(name)) {
      throw new BadRequestException(`Invalid table name: ${name}`);
    }
  }

  private validateColumn(name: string): void {
    if (!COLUMN_REGEX.test(name)) {
      throw new BadRequestException(`Invalid column name: ${name}`);
    }
  }

  async execute(
    connectionString: string,
    table: string,
    action: string,
    opts: {
      data?: Record<string, unknown>;
      filter?: Record<string, unknown>;
      sort?: Record<string, string>;
      limit?: number;
      offset?: number;
      userId?: string;
    },
  ): Promise<QueryResult> {
    this.validateTable(table);

    const client = new Client({ connectionString });
    await client.connect();

    try {
      // Set user context so RLS policies (owner_id = current_setting('app.current_user_id'))
      // can enforce row-level isolation on user-registered databases.
      if (opts.userId) {
        await client.query('BEGIN');
        await client.query(`SET LOCAL app.current_user_id = $1`, [opts.userId]);
      }

      let result: QueryResult;
      switch (action) {
        case 'select':
          result = await this.select(client, table, opts);
          break;
        case 'insert':
          result = await this.insert(client, table, opts.data ?? {}, opts.userId);
          break;
        case 'update':
          result = await this.update(client, table, opts.data ?? {}, opts.filter ?? {});
          break;
        case 'delete':
          result = await this.deleteRows(client, table, opts.filter ?? {});
          break;
        default:
          throw new BadRequestException(`Unknown SQL action: ${action}`);
      }

      if (opts.userId) {
        await client.query('COMMIT');
      }
      return result;
    } catch (err) {
      if (opts.userId) {
        await client.query('ROLLBACK').catch(() => {});
      }
      throw err;
    } finally {
      await client.end();
    }
  }

  async listTables(connectionString: string): Promise<string[]> {
    const client = new Client({ connectionString });
    await client.connect();
    try {
      const res = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
      );
      return res.rows.map((r) => r['table_name'] as string);
    } finally {
      await client.end();
    }
  }

  private async select(
    client: Client,
    table: string,
    opts: { filter?: Record<string, unknown>; sort?: Record<string, string>; limit?: number; offset?: number },
  ): Promise<QueryResult> {
    const params: unknown[] = [];
    let sql = `SELECT * FROM "${table}"`;

    // WHERE
    const where = this.buildWhere(opts.filter ?? {}, params);
    if (where) sql += ` WHERE ${where}`;

    // ORDER BY
    if (opts.sort) {
      const orderParts: string[] = [];
      for (const [col, dir] of Object.entries(opts.sort)) {
        this.validateColumn(col);
        orderParts.push(`"${col}" ${dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`);
      }
      if (orderParts.length) sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    // LIMIT / OFFSET
    const limit = Math.min(opts.limit ?? 100, 100);
    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    if (opts.offset) {
      params.push(opts.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const res = await client.query(sql, params);
    return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount ?? 0 };
  }

  private async insert(client: Client, table: string, data: Record<string, unknown>, userId?: string): Promise<QueryResult> {
    // Auto-inject owner_id for tenant isolation (mirrors schema-service's auto-added column)
    const enriched = { ...data };
    if (userId && !enriched['owner_id']) {
      enriched['owner_id'] = userId;
    }

    const cols = Object.keys(enriched);
    if (!cols.length) throw new BadRequestException('No data to insert');
    cols.forEach((c) => this.validateColumn(c));

    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;

    const res = await client.query(sql, Object.values(enriched));
    return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount ?? 0 };
  }

  private async update(
    client: Client,
    table: string,
    data: Record<string, unknown>,
    filter: Record<string, unknown>,
  ): Promise<QueryResult> {
    const setCols = Object.keys(data);
    if (!setCols.length) throw new BadRequestException('No data to update');
    setCols.forEach((c) => this.validateColumn(c));

    const params: unknown[] = [];
    const setParts = setCols.map((col) => {
      params.push(data[col]);
      return `"${col}" = $${params.length}`;
    });

    let sql = `UPDATE "${table}" SET ${setParts.join(', ')}`;

    const where = this.buildWhere(filter, params);
    if (where) sql += ` WHERE ${where}`;

    sql += ' RETURNING *';

    const res = await client.query(sql, params);
    return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount ?? 0 };
  }

  private async deleteRows(
    client: Client,
    table: string,
    filter: Record<string, unknown>,
  ): Promise<QueryResult> {
    const params: unknown[] = [];
    let sql = `DELETE FROM "${table}"`;

    const where = this.buildWhere(filter, params);
    if (where) sql += ` WHERE ${where}`;

    sql += ' RETURNING *';

    const res = await client.query(sql, params);
    return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount ?? 0 };
  }

  private buildWhere(filter: Record<string, unknown>, params: unknown[]): string {
    const conditions: string[] = [];
    for (const [col, val] of Object.entries(filter)) {
      this.validateColumn(col);
      params.push(val);
      conditions.push(`"${col}" = $${params.length}`);
    }
    return conditions.join(' AND ');
  }
}
