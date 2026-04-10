import { BadRequestException, Injectable } from '@nestjs/common';
import { MongoClient } from 'mongodb';

const COLLECTION_REGEX = /^[\w-]{1,64}$/;

export interface MongoQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
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

  async execute(
    connectionString: string,
    dbName: string,
    collection: string,
    action: string,
    opts: {
      data?: Record<string, unknown>;
      filter?: Record<string, unknown>;
      sort?: Record<string, string>;
      limit?: number;
      offset?: number;
    },
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
        case 'find': {
          // Strip $where to prevent injection
          const filter = { ...(opts.filter ?? {}) };
          delete filter['$where'];

          const sort: Record<string, 1 | -1> = {};
          if (opts.sort) {
            for (const [field, dir] of Object.entries(opts.sort)) {
              sort[field] = dir.toLowerCase() === 'asc' ? 1 : -1;
            }
          }

          const limit = Math.min(opts.limit ?? 100, 100);
          const docs = await col.find(filter).sort(sort).skip(opts.offset ?? 0).limit(limit).toArray();

          return {
            rows: docs.map((d) => this.normalizeDoc(d as Record<string, unknown>)),
            rowCount: docs.length,
          };
        }

        case 'insertOne': {
          if (!opts.data) throw new BadRequestException('data is required for insertOne');
          const result = await col.insertOne(opts.data);
          return {
            rows: [{ id: result.insertedId.toString(), ...opts.data }],
            rowCount: 1,
          };
        }

        case 'updateMany': {
          if (!opts.data) throw new BadRequestException('data is required for updateMany');
          const result = await col.updateMany(opts.filter ?? {}, { $set: opts.data });
          return {
            rows: [],
            rowCount: result.modifiedCount,
          };
        }

        case 'deleteMany': {
          const result = await col.deleteMany(opts.filter ?? {});
          return {
            rows: [],
            rowCount: result.deletedCount,
          };
        }

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
