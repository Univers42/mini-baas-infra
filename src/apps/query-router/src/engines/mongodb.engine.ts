import { BadRequestException, Injectable } from '@nestjs/common';
import { Collection, MongoClient } from 'mongodb';

const COLLECTION_REGEX = /^[\w-]{1,64}$/;

export interface MongoQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

interface MongoExecuteOptions {
  data?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  sort?: Record<string, string>;
  limit?: number;
  offset?: number;
  userId?: string;
}

@Injectable()
export class MongodbEngine {

  private validateCollection(name: string): void {
    if (!COLLECTION_REGEX.test(name)) {
      throw new BadRequestException(`Invalid collection name: ${name}`);
    }
  }

  private normalizeDoc(doc: Record<string, unknown>): Record<string, unknown> {
    const { _id, ...rest } = doc;
    return { id: String(_id), ...rest };
  }

  private cloneFilter(filter?: Record<string, unknown>): Record<string, unknown> {
    return filter ? { ...filter } : {};
  }

  private applyOwnerFilter(filter: Record<string, unknown>, userId?: string): Record<string, unknown> {
    if (userId) {
      filter['owner_id'] = userId;
    }
    return filter;
  }

  private buildSort(sortInput?: Record<string, string>): Record<string, 1 | -1> | undefined {
    if (!sortInput) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(sortInput).map(([field, dir]) => [
        field,
        dir.toLowerCase() === 'asc' ? 1 : -1,
      ]),
    );
  }

  private async find(col: Collection, opts: MongoExecuteOptions): Promise<MongoQueryResult> {
    const filter = this.applyOwnerFilter(this.cloneFilter(opts.filter), opts.userId);
    delete filter['$where'];

    const limit = Math.min(opts.limit ?? 100, 100);
    let cursor = col.find(filter).skip(opts.offset ?? 0).limit(limit);
    const sort = this.buildSort(opts.sort);
    if (sort) {
      cursor = cursor.sort(sort);
    }

    const docs = await cursor.toArray();
    return {
      rows: docs.map((d) => this.normalizeDoc(d as Record<string, unknown>)),
      rowCount: docs.length,
    };
  }

  private async insertOne(col: Collection, opts: MongoExecuteOptions): Promise<MongoQueryResult> {
    if (!opts.data) throw new BadRequestException('data is required for insertOne');
    const { _id: _, owner_id: __, ...clean } = opts.data;
    const doc: Record<string, unknown> = {
      ...clean,
      created_at: new Date(),
      updated_at: new Date(),
    };
    if (opts.userId) {
      doc['owner_id'] = opts.userId;
    }
    const result = await col.insertOne(doc);
    return {
      rows: [{ id: result.insertedId.toString(), ...doc }],
      rowCount: 1,
    };
  }

  private async updateMany(col: Collection, opts: MongoExecuteOptions): Promise<MongoQueryResult> {
    if (!opts.data) throw new BadRequestException('data is required for updateMany');
    const { _id: _, owner_id: __, ...cleanData } = opts.data;
    const updateFilter = this.applyOwnerFilter(this.cloneFilter(opts.filter), opts.userId);
    const result = await col.updateMany(updateFilter, {
      $set: { ...cleanData, updated_at: new Date() },
    });
    return {
      rows: [],
      rowCount: result.modifiedCount,
    };
  }

  private async deleteMany(col: Collection, opts: MongoExecuteOptions): Promise<MongoQueryResult> {
    const deleteFilter = this.applyOwnerFilter(this.cloneFilter(opts.filter), opts.userId);
    const result = await col.deleteMany(deleteFilter);
    return {
      rows: [],
      rowCount: result.deletedCount,
    };
  }

  async execute(
    connectionString: string,
    dbName: string,
    collection: string,
    action: string,
    opts: MongoExecuteOptions,
  ): Promise<MongoQueryResult> {
    this.validateCollection(collection);

    const client = new MongoClient(connectionString, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5_000,
    });
    await client.connect();

    try {
      const db = client.db(dbName);
      const col = db.collection(collection);

      switch (action) {
        case 'find':
          return this.find(col, opts);
        case 'insertOne':
          return this.insertOne(col, opts);
        case 'updateMany':
          return this.updateMany(col, opts);
        case 'deleteMany':
          return this.deleteMany(col, opts);

        default:
          throw new BadRequestException(`Unknown MongoDB action: ${action}`);
      }
    } finally {
      await client.close();
    }
  }

  async listCollections(connectionString: string, dbName: string): Promise<string[]> {
    const client = new MongoClient(connectionString, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5_000,
    });
    await client.connect();
    try {
      const db = client.db(dbName);
      const cols = await db.listCollections().toArray();
      return cols.map((c) => c.name);
    } finally {
      await client.close();
    }
  }
}
