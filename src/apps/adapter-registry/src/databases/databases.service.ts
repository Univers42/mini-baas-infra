import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PostgresService } from '@mini-baas/database';
import { CryptoService } from '../crypto/crypto.service';
import { RegisterDatabaseDto } from './dto/register-database.dto';

export interface TenantDatabase {
  id: string;
  tenant_id: string;
  engine: string;
  name: string;
  created_at: string;
  last_healthy_at: string | null;
}

export interface TenantDatabaseRow extends TenantDatabase {
  connection_enc: Buffer;
  connection_iv: Buffer;
  connection_tag: Buffer;
  connection_salt: Buffer;
}

@Injectable()
export class DatabasesService implements OnModuleInit {
  private readonly logger = new Logger(DatabasesService.name);

  constructor(
    private readonly pg: PostgresService,
    private readonly crypto: CryptoService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Ensure the tenant_databases table exists (idempotent DDL)
    await this.pg.adminQuery(`
      CREATE TABLE IF NOT EXISTS tenant_databases (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL,
        engine          TEXT NOT NULL CHECK (engine IN ('postgresql','mongodb','mysql','redis','sqlite')),
        name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
        connection_enc  BYTEA NOT NULL,
        connection_iv   BYTEA NOT NULL,
        connection_tag  BYTEA NOT NULL,
        connection_salt BYTEA NOT NULL,
        created_at      TIMESTAMPTZ DEFAULT now(),
        last_healthy_at TIMESTAMPTZ,
        UNIQUE (tenant_id, name)
      );

      ALTER TABLE tenant_databases ENABLE ROW LEVEL SECURITY;

      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'tenant_databases' AND policyname = 'tenant_isolation'
        ) THEN
          CREATE POLICY tenant_isolation ON tenant_databases
            FOR ALL USING (tenant_id::text = current_setting('app.current_user_id'));
        END IF;
      END $$;
    `);
    this.logger.log('tenant_databases table ensured');
  }

  async register(
    userId: string,
    dto: RegisterDatabaseDto,
  ): Promise<{ id: string; engine: string; name: string; created_at: string }> {
    const { encrypted, iv, tag, salt } = this.crypto.encrypt(dto.connection_string);

    try {
      const rows = await this.pg.tenantQuery<TenantDatabase>(
        userId,
        `INSERT INTO tenant_databases (tenant_id, engine, name, connection_enc, connection_iv, connection_tag, connection_salt)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, engine, name, created_at`,
        [userId, dto.engine, dto.name, encrypted, iv, tag, salt],
      );
      return rows[0]!;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException(`Database "${dto.name}" already registered`);
      }
      throw err;
    }
  }

  async listAll(userId: string): Promise<TenantDatabase[]> {
    return this.pg.tenantQuery<TenantDatabase>(
      userId,
      `SELECT id, tenant_id, engine, name, created_at, last_healthy_at
         FROM tenant_databases
        ORDER BY created_at DESC`,
    );
  }

  async findOne(userId: string, id: string): Promise<TenantDatabase> {
    const rows = await this.pg.tenantQuery<TenantDatabase>(
      userId,
      `SELECT id, tenant_id, engine, name, created_at, last_healthy_at
         FROM tenant_databases
        WHERE id = $1`,
      [id],
    );
    if (!rows.length) {
      throw new NotFoundException('Database not found');
    }
    return rows[0]!;
  }

  async getConnectionString(userId: string, id: string): Promise<{ engine: string; connection_string: string }> {
    const rows = await this.pg.tenantQuery<TenantDatabaseRow>(
      userId,
      `SELECT engine, connection_enc, connection_iv, connection_tag, connection_salt
         FROM tenant_databases
        WHERE id = $1`,
      [id],
    );
    if (!rows.length) {
      throw new NotFoundException('Database not found');
    }

    const row = rows[0]!;
    const connectionString = this.crypto.decrypt({
      encrypted: row.connection_enc,
      iv: row.connection_iv,
      tag: row.connection_tag,
      salt: row.connection_salt,
    });

    // Update last_healthy_at (fire and forget)
    void this.pg
      .tenantQuery(userId, `UPDATE tenant_databases SET last_healthy_at = now() WHERE id = $1`, [id])
      .catch(() => {});

    return { engine: row.engine, connection_string: connectionString };
  }

  async remove(id: string): Promise<void> {
    const rows = await this.pg.adminQuery<{ id: string }>(
      `DELETE FROM tenant_databases WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!rows.length) {
      throw new NotFoundException('Database not found');
    }
  }
}
