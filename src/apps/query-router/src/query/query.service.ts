import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PostgresqlEngine } from '../engines/postgresql.engine';
import { MongodbEngine } from '../engines/mongodb.engine';
import { ExecuteQueryDto } from './dto/query.dto';

interface AdapterResponse {
  engine: string;
  connection_string: string;
}

@Injectable()
export class QueryService {
  private readonly registryUrl: string;
  private readonly serviceToken: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly pgEngine: PostgresqlEngine,
    private readonly mongoEngine: MongodbEngine,
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

  async executeQuery(dbId: string, table: string, userId: string, dto: ExecuteQueryDto) {
    const { engine, connection_string } = await this.fetchConnection(dbId, userId);

    if (engine === 'postgresql') {
      return this.pgEngine.execute(connection_string, table, dto.action, {
        data: dto.data,
        filter: dto.filter,
        sort: dto.sort,
        limit: dto.limit,
        offset: dto.offset,
        userId,
      });
    }

    if (engine === 'mongodb') {
      // Extract DB name from connection string
      const url = new URL(connection_string);
      const dbName = url.pathname.replace(/^\//, '') || 'test';
      return this.mongoEngine.execute(connection_string, dbName, table, dto.action, {
        data: dto.data,
        filter: dto.filter,
        sort: dto.sort,
        limit: dto.limit,
        offset: dto.offset,
        userId,
      });
    }

    throw new BadRequestException(`Unsupported engine: ${engine}`);
  }

  async listTables(dbId: string, userId: string) {
    const { engine, connection_string } = await this.fetchConnection(dbId, userId);

    if (engine === 'postgresql') {
      const tables = await this.pgEngine.listTables(connection_string);
      return { engine, tables };
    }

    if (engine === 'mongodb') {
      const url = new URL(connection_string);
      const dbName = url.pathname.replace(/^\//, '') || 'test';
      const collections = await this.mongoEngine.listCollections(connection_string, dbName);
      return { engine, collections };
    }

    throw new BadRequestException(`Unsupported engine: ${engine}`);
  }
}
