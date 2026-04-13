import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { MongoService } from '@mini-baas/database';
import { Collection, ObjectId, Sort } from 'mongodb';

const COLLECTION_REGEX = /^[\w-]{1,64}$/;

@Injectable()
export class CollectionsService implements OnModuleInit {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
    @InjectMetric('mongo_operations_total')
    private readonly opsCounter: Counter<string>,
  ) {}

  async onModuleInit(): Promise<void> {
    const mockCollection = this.config.get<string>('MONGO_MOCK_COLLECTION', 'mock_catalog');
    const db = this.mongo.getDb();

    // Bootstrap a demo collection with a generic schema.
    // The collection name and validator are intentionally minimal and domain-agnostic.
    // Consuming apps should create their own collections via the /collections API.
    const existing = await db.listCollections({ name: mockCollection }).toArray();
    if (!existing.length) {
      await db.createCollection(mockCollection, {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['owner_id', 'title', 'created_at', 'updated_at'],
            properties: {
              owner_id: { bsonType: 'string', description: 'UUID of the owning user' },
              title:    { bsonType: 'string', description: 'Human-readable title' },
              body:     { bsonType: 'string', description: 'Optional free-form content' },
              tags:     { bsonType: 'array',  description: 'Optional string tags',
                          items: { bsonType: 'string' } },
            },
          },
        },
      });
      await db.collection(mockCollection).createIndex({ owner_id: 1, created_at: -1 });
      this.logger.log(`Created ${mockCollection} collection with validator`);
    }
  }

  private validateCollectionName(name: string): void {
    if (!COLLECTION_REGEX.test(name)) {
      throw new BadRequestException('Invalid collection name (1-64 alphanumeric/dash/underscore)');
    }
  }

  private getCollection(name: string): Collection {
    this.validateCollectionName(name);
    return this.mongo.getDb().collection(name);
  }

  private normalizeDoc(doc: Record<string, unknown>): Record<string, unknown> {
    const { _id, ...rest } = doc;
    return { id: String(_id), ...rest };
  }

  async create(collectionName: string, userId: string, data: Record<string, unknown>) {
    // Strip forbidden fields
    const { _id: _, owner_id: __, ...clean } = data;

    const doc = {
      ...clean,
      owner_id: userId,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const col = this.getCollection(collectionName);
    const result = await col.insertOne(doc);
    this.opsCounter.inc({ collection: collectionName, operation: 'insert' });

    return this.normalizeDoc({ _id: result.insertedId, ...doc });
  }

  async findAll(
    collectionName: string,
    userId: string,
    opts: { limit: number; offset: number; sort?: string; filter?: string },
  ) {
    const col = this.getCollection(collectionName);
    const query: Record<string, unknown> = { owner_id: userId };

    // Merge optional filter (strip dangerous keys)
    if (opts.filter) {
      try {
        const parsed = JSON.parse(opts.filter) as Record<string, unknown>;
        delete parsed['owner_id'];
        delete parsed['_id'];
        Object.assign(query, parsed);
      } catch {
        throw new BadRequestException('Invalid JSON in filter parameter');
      }
    }

    // Parse sort
    let sort: Sort = { created_at: -1 };
    if (opts.sort) {
      const [field, dir] = opts.sort.split(':');
      if (field && dir) {
        sort = { [field]: dir.toLowerCase() === 'asc' ? 1 : -1 };
      }
    }

    const [data, total] = await Promise.all([
      col.find(query).sort(sort).skip(opts.offset).limit(opts.limit).toArray(),
      col.countDocuments(query),
    ]);

    this.opsCounter.inc({ collection: collectionName, operation: 'find' });

    return {
      data: data.map((d) => this.normalizeDoc(d as Record<string, unknown>)),
      meta: { total, limit: opts.limit, offset: opts.offset },
    };
  }

  async findOne(collectionName: string, userId: string, docId: string) {
    if (!ObjectId.isValid(docId)) {
      throw new BadRequestException('Invalid document ID');
    }

    const col = this.getCollection(collectionName);
    const doc = await col.findOne({ _id: new ObjectId(docId), owner_id: userId });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    this.opsCounter.inc({ collection: collectionName, operation: 'findOne' });
    return this.normalizeDoc(doc as Record<string, unknown>);
  }

  async patch(collectionName: string, userId: string, docId: string, patch: Record<string, unknown>) {
    if (!ObjectId.isValid(docId)) {
      throw new BadRequestException('Invalid document ID');
    }

    // Strip forbidden fields
    const { _id: _, owner_id: __, ...clean } = patch;

    const col = this.getCollection(collectionName);
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(docId), owner_id: userId },
      { $set: { ...clean, updated_at: new Date() } },
      { returnDocument: 'after' },
    );

    if (!result) {
      throw new NotFoundException('Document not found');
    }

    this.opsCounter.inc({ collection: collectionName, operation: 'update' });
    return this.normalizeDoc(result as Record<string, unknown>);
  }

  async remove(collectionName: string, userId: string, docId: string) {
    if (!ObjectId.isValid(docId)) {
      throw new BadRequestException('Invalid document ID');
    }

    const col = this.getCollection(collectionName);
    const result = await col.deleteOne({ _id: new ObjectId(docId), owner_id: userId });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Document not found');
    }

    this.opsCounter.inc({ collection: collectionName, operation: 'delete' });
    return { deleted: true };
  }
}
