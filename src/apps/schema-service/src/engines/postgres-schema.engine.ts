import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';
import { ColumnDefinition } from '../schemas/dto/schema.dto';

const TABLE_REGEX = /^[a-zA-Z_]\w{0,63}$/;
const VALID_TYPES = new Set([
  'text', 'varchar', 'char', 'integer', 'int', 'bigint', 'smallint',
  'serial', 'bigserial', 'boolean', 'bool', 'timestamp', 'timestamptz',
  'date', 'time', 'uuid', 'jsonb', 'json', 'numeric', 'decimal',
  'real', 'double precision', 'bytea', 'inet', 'cidr', 'macaddr',
]);

@Injectable()
export class PostgresSchemaEngine {
  private readonly logger = new Logger(PostgresSchemaEngine.name);

  async createTable(
    connectionString: string,
    tableName: string,
    columns: ColumnDefinition[],
    enableRls: boolean,
  ): Promise<{ created: boolean; ddl: string }> {
    if (!TABLE_REGEX.test(tableName)) {
      throw new BadRequestException(`Invalid table name: ${tableName}`);
    }

    const colDefs: string[] = [
      `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
      `owner_id UUID NOT NULL`,
    ];

    for (const col of columns) {
      const type = col.type.toLowerCase();
      if (!VALID_TYPES.has(type)) {
        throw new BadRequestException(`Unsupported column type: ${col.type}`);
      }
      let def = `"${col.name}" ${type}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.unique) def += ' UNIQUE';
      if (col.default_value) def += ` DEFAULT ${col.default_value}`;
      colDefs.push(def);
    }

    colDefs.push(`created_at TIMESTAMPTZ DEFAULT now()`);
    colDefs.push(`updated_at TIMESTAMPTZ DEFAULT now()`);

    const ddl = `CREATE TABLE IF NOT EXISTS public."${tableName}" (\n  ${colDefs.join(',\n  ')}\n)`;

    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query(ddl);

      if (enableRls) {
        await client.query(`ALTER TABLE public."${tableName}" ENABLE ROW LEVEL SECURITY`);
        await client.query(
          `DO $$ BEGIN
             IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'owner_isolation') THEN
               CREATE POLICY owner_isolation ON public."${tableName}" FOR ALL USING (owner_id = auth.uid());
             END IF;
           END $$`,
        );
      }

      // Grant access
      await client.query(`GRANT ALL ON public."${tableName}" TO authenticated`);
      await client.query(`GRANT ALL ON public."${tableName}" TO service_role`);

      this.logger.log(`Table created: ${tableName} (RLS=${enableRls})`);
      return { created: true, ddl };
    } finally {
      await client.end();
    }
  }

  async dropTable(connectionString: string, tableName: string): Promise<{ dropped: boolean }> {
    if (!TABLE_REGEX.test(tableName)) {
      throw new BadRequestException(`Invalid table name: ${tableName}`);
    }

    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS public."${tableName}" CASCADE`);
      this.logger.warn(`Table dropped: ${tableName}`);
      return { dropped: true };
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
}
