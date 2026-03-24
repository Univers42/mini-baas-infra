import express from 'express';
import { Collection, MongoClient, ObjectId } from 'mongodb';
import swaggerUi from 'swagger-ui-express';

const app = express();
const port = Number(process.env.PORT || 3001);
const mongoUri = process.env.MONGODB_URI || 'mongodb://mongo:27017';
const mongoDatabase = process.env.MONGODB_DATABASE || 'mini_baas';
const mongoCollection = process.env.MONGODB_COLLECTION || 'schema_catalog';

type SupportedEngine = 'postgresql' | 'mysql' | 'mongodb' | 'sqlite';

interface SchemaCatalogDocument {
  key: string;
  name: string;
  engine: SupportedEngine;
  version: number;
  definition: Record<string, unknown>;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface SchemaPayload {
  key?: string;
  name?: string;
  engine?: string;
  version?: number;
  definition?: Record<string, unknown>;
  tags?: string[];
}

const seedSchemas: Array<Omit<SchemaCatalogDocument, 'createdAt' | 'updatedAt'>> = [
  {
    key: 'public-commerce-postgres-v1',
    name: 'Public Commerce Schema',
    engine: 'postgresql',
    version: 1,
    tags: ['commerce', 'starter', 'sql'],
    definition: {
      entities: [
        {
          name: 'users',
          primaryKey: 'id',
          columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'email', type: 'varchar(255)', required: true, unique: true },
            { name: 'created_at', type: 'timestamptz', required: true }
          ]
        },
        {
          name: 'orders',
          primaryKey: 'id',
          columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'user_id', type: 'uuid', required: true },
            { name: 'status', type: 'varchar(50)', required: true },
            { name: 'total', type: 'numeric(10,2)', required: true }
          ]
        }
      ],
      relations: [{ from: 'orders.user_id', to: 'users.id', type: 'many-to-one' }]
    }
  },
  {
    key: 'analytics-mongodb-v1',
    name: 'Analytics Document Schema',
    engine: 'mongodb',
    version: 1,
    tags: ['analytics', 'events', 'nosql'],
    definition: {
      collections: [
        {
          name: 'events',
          documentShape: {
            _id: 'ObjectId',
            event: 'string',
            userId: 'string',
            timestamp: 'date',
            properties: 'object'
          }
        },
        {
          name: 'sessions',
          documentShape: {
            _id: 'ObjectId',
            sessionId: 'string',
            userId: 'string',
            startedAt: 'date',
            endedAt: 'date'
          }
        }
      ]
    }
  },
  {
    key: 'inventory-mysql-v1',
    name: 'Inventory Relational Schema',
    engine: 'mysql',
    version: 1,
    tags: ['inventory', 'starter', 'sql'],
    definition: {
      entities: [
        {
          name: 'products',
          primaryKey: 'id',
          columns: [
            { name: 'id', type: 'char(36)', required: true },
            { name: 'sku', type: 'varchar(100)', required: true, unique: true },
            { name: 'name', type: 'varchar(255)', required: true },
            { name: 'stock_quantity', type: 'int', required: true }
          ]
        },
        {
          name: 'stock_movements',
          primaryKey: 'id',
          columns: [
            { name: 'id', type: 'char(36)', required: true },
            { name: 'product_id', type: 'char(36)', required: true },
            { name: 'change', type: 'int', required: true },
            { name: 'created_at', type: 'datetime', required: true }
          ]
        }
      ],
      relations: [{ from: 'stock_movements.product_id', to: 'products.id', type: 'many-to-one' }]
    }
  }
];

const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'schema-service API',
    version: '0.2.0',
    description: 'Schema catalog service with MongoDB persistence'
  },
  servers: [{ url: '/' }],
  paths: {
    '/': {
      get: {
        summary: 'Root endpoint',
        responses: {
          200: { description: 'Service status message' }
        }
      }
    },
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          200: { description: 'Healthy service' },
          503: { description: 'MongoDB unavailable' }
        }
      }
    },
    '/schemas': {
      get: {
        summary: 'List schemas',
        responses: {
          200: { description: 'Schema list' }
        }
      },
      post: {
        summary: 'Create or update schema by key',
        responses: {
          200: { description: 'Updated schema' },
          201: { description: 'Created schema' },
          400: { description: 'Invalid payload' }
        }
      }
    },
    '/schemas/{idOrKey}': {
      get: {
        summary: 'Fetch schema by Mongo id or key',
        responses: {
          200: { description: 'Schema document' },
          404: { description: 'Schema not found' }
        }
      }
    }
  }
};

const client = new MongoClient(mongoUri);
let schemaCollection: Collection<SchemaCatalogDocument>;

app.use(express.json());

function isSupportedEngine(value: string): value is SupportedEngine {
  return ['postgresql', 'mysql', 'mongodb', 'sqlite'].includes(value);
}

function normalizeSchema(doc: SchemaCatalogDocument & { _id: ObjectId }): Record<string, unknown> {
  return {
    id: doc._id.toHexString(),
    key: doc.key,
    name: doc.name,
    engine: doc.engine,
    version: doc.version,
    definition: doc.definition,
    tags: doc.tags,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

async function seedSchemaCatalog(): Promise<void> {
  const operations = seedSchemas.map((schema) => ({
    updateOne: {
      filter: { key: schema.key },
      update: {
        $setOnInsert: {
          ...schema,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      },
      upsert: true
    }
  }));

  if (operations.length > 0) {
    await schemaCollection.bulkWrite(operations, { ordered: false });
  }
}

function parseSchemaPayload(payload: SchemaPayload):
  | { ok: true; value: Omit<SchemaCatalogDocument, 'createdAt' | 'updatedAt'> }
  | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Payload must be an object.' };
  }

  const key = String(payload.key || '').trim();
  const name = String(payload.name || '').trim();
  const engine = String(payload.engine || '').trim();
  const version = Number(payload.version);
  const definition = payload.definition;
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
    : [];

  if (!key) {
    return { ok: false, error: 'Field "key" is required.' };
  }
  if (!name) {
    return { ok: false, error: 'Field "name" is required.' };
  }
  if (!isSupportedEngine(engine)) {
    return { ok: false, error: 'Field "engine" must be one of: postgresql, mysql, mongodb, sqlite.' };
  }
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'Field "version" must be an integer >= 1.' };
  }
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    return { ok: false, error: 'Field "definition" must be an object.' };
  }

  return {
    ok: true,
    value: {
      key,
      name,
      engine,
      version,
      definition,
      tags
    }
  };
}

app.get('/openapi.json', (_req, res) => {
  res.status(200).json(openapiSpec);
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.get('/health', async (_req, res) => {
  try {
    await schemaCollection.db.command({ ping: 1 });
    res.status(200).json({ status: 'ok', service: 'schema-service', mongo: 'up' });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      service: 'schema-service',
      mongo: 'down',
      error: error instanceof Error ? error.message : 'unknown error'
    });
  }
});

app.get('/', (_req, res) => {
  res.status(200).send('schema-service running (Mongo-backed schema catalog)');
});

app.get('/schemas', async (req, res) => {
  const engineFilter = String(req.query.engine || '').trim().toLowerCase();
  const query: Partial<Pick<SchemaCatalogDocument, 'engine'>> = {};

  if (engineFilter) {
    if (!isSupportedEngine(engineFilter)) {
      res.status(400).json({ error: 'Query "engine" must be one of: postgresql, mysql, mongodb, sqlite.' });
      return;
    }
    query.engine = engineFilter;
  }

  const docs = await schemaCollection.find(query).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ count: docs.length, items: docs.map((doc) => normalizeSchema(doc)) });
});

app.get('/schemas/:idOrKey', async (req, res) => {
  const raw = req.params.idOrKey.trim();
  const byId = ObjectId.isValid(raw)
    ? await schemaCollection.findOne({ _id: new ObjectId(raw) })
    : null;
  const doc = byId || (await schemaCollection.findOne({ key: raw }));

  if (!doc) {
    res.status(404).json({ error: `Schema not found for "${raw}".` });
    return;
  }

  res.status(200).json(normalizeSchema(doc));
});

app.post('/schemas', async (req, res) => {
  const parsed = parseSchemaPayload(req.body as SchemaPayload);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const now = new Date();
  const updateResult = await schemaCollection.updateOne(
    { key: parsed.value.key },
    {
      $set: {
        name: parsed.value.name,
        engine: parsed.value.engine,
        version: parsed.value.version,
        definition: parsed.value.definition,
        tags: parsed.value.tags,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  const doc = await schemaCollection.findOne({ key: parsed.value.key });
  if (!doc) {
    res.status(500).json({ error: 'Schema write succeeded but re-read failed.' });
    return;
  }

  const status = updateResult.upsertedCount > 0 ? 201 : 200;
  res.status(status).json(normalizeSchema(doc));
});

async function start(): Promise<void> {
  await client.connect();
  schemaCollection = client.db(mongoDatabase).collection<SchemaCatalogDocument>(mongoCollection);
  await schemaCollection.createIndex({ key: 1 }, { unique: true });
  await seedSchemaCatalog();

  app.listen(port, () => {
    console.log(`schema-service listening on ${port}`);
    console.log(`schema catalog: ${mongoDatabase}.${mongoCollection}`);
  });
}

start().catch((error) => {
  console.error('schema-service failed to start', error);
  process.exit(1);
});
