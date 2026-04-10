import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PostgresSchemaEngine } from '../engines/postgres-schema.engine';
import { MongoSchemaEngine } from '../engines/mongo-schema.engine';
import { CreateSchemaDto } from './dto/schema.dto';
import { PostgresService } from '@mini-baas/database';

interface AdapterResponse {
  engine: string;
  connection_string: string;
}

export interface SchemaRecord {
  id: string;
  database_id: string;
  name: string;
  engine: string;
  columns: unknown;
  enable_rls: boolean;
  created_at: string;
}

@Injectable()
export class SchemasService {
  private readonly registryUrl: string;
  private readonly serviceToken: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly pg: PostgresService,
    private readonly pgEngine: PostgresSchemaEngine,
    private readonly mongoEngine: MongoSchemaEngine,
  ) {
    this.registryUrl = this.config.getOrThrow<string>('ADAPTER_REGISTRY_URL');
    this.serviceToken = this.config.get<string>('ADAPTER_REGISTRY_SERVICE_TOKEN', '');
  }

  private async fetchConnection(dbId: string, userId: string): Promise<AdapterResponse> {
    const url = `${this.registryUrl}/databases/${dbId}/connect`;
    const { data } = await firstValueFrom(
      this.http.get<AdapterResponse>(url, {
        headers: {
          'X-Service-Token': this.serviceToken,
          'X-Tenant-Id': userId,
        },
      }),
    );
    return data;
  }

  async create(userId: string, dto: CreateSchemaDto) {
    const { engine, connection_string } = await this.fetchConnection(dto.database_id, userId);

    if (engine !== dto.engine) {
      throw new BadRequestException(
        `Engine mismatch — database is ${engine} but schema spec says ${dto.engine}`,
      );
    }

    if (engine === 'postgresql') {
      const result = await this.pgEngine.createTable(
        connection_string,
        dto.name,
        dto.columns,
        dto.enable_rls !== false,
      );

      // Record in schema registry
      await this.pg.adminQuery(
        `INSERT INTO schema_registry (database_id, name, engine, columns, enable_rls, created_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT (database_id, name) DO UPDATE SET columns = $4::jsonb, enable_rls = $5`,
        [dto.database_id, dto.name, engine, JSON.stringify(dto.columns), dto.enable_rls !== false, userId],
      );

      return result;
    }

    if (engine === 'mongodb') {
      const url = new URL(connection_string);
      const dbName = url.pathname.replace(/^\//, '') || 'test';
      const result = await this.mongoEngine.createCollection(
        connection_string,
        dbName,
        dto.name,
        dto.columns,
      );

      await this.pg.adminQuery(
        `INSERT INTO schema_registry (database_id, name, engine, columns, enable_rls, created_by)
         VALUES ($1, $2, $3, $4::jsonb, false, $5)
         ON CONFLICT (database_id, name) DO UPDATE SET columns = $4::jsonb`,
        [dto.database_id, dto.name, engine, JSON.stringify(dto.columns), userId],
      );

      return result;
    }

    throw new BadRequestException(`Unsupported engine: ${engine}`);
  }

  async list(userId: string): Promise<SchemaRecord[]> {
    return this.pg.adminQuery<SchemaRecord>(
      `SELECT id, database_id, name, engine, columns, enable_rls, created_at
         FROM schema_registry WHERE created_by = $1 ORDER BY created_at DESC`,
      [userId],
    );
  }

  async drop(userId: string, schemaId: string) {
    const rows = await this.pg.adminQuery<SchemaRecord & { connection_string?: string }>(
      `SELECT sr.*, td.engine as db_engine
         FROM schema_registry sr
         JOIN tenant_databases td ON td.id = sr.database_id
        WHERE sr.id = $1 AND sr.created_by = $2`,
      [schemaId, userId],
    );

    if (!rows.length) {
      throw new BadRequestException('Schema not found');
    }

    const schema = rows[0]!;
    const { connection_string } = await this.fetchConnection(schema.database_id, userId);

    if (schema.engine === 'postgresql') {
      await this.pgEngine.dropTable(connection_string, schema.name);
    } else if (schema.engine === 'mongodb') {
      const url = new URL(connection_string);
      const dbName = url.pathname.replace(/^\//, '') || 'test';
      await this.mongoEngine.dropCollection(connection_string, dbName, schema.name);
    }

    await this.pg.adminQuery(`DELETE FROM schema_registry WHERE id = $1`, [schemaId]);
    return { dropped: true };
  }
}
