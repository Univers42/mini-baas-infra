import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db, MongoClient, MongoClientOptions } from 'mongodb';

/**
 * Managed MongoDB connection with configurable pool and health check.
 */
@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private client!: MongoClient;
  private db!: Db;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const uri = this.config.get<string>('MONGO_URI', 'mongodb://mongo:27017');
    const dbName = this.config.get<string>('MONGO_DB_NAME', 'mini_baas');
    const maxPoolSize = this.config.get<number>('MONGO_MAX_POOL_SIZE', 10);
    const minPoolSize = this.config.get<number>('MONGO_MIN_POOL_SIZE', 2);

    const opts: MongoClientOptions = {
      maxPoolSize,
      minPoolSize,
      maxIdleTimeMS: 30_000,
      serverSelectionTimeoutMS: 5_000,
    };

    this.client = new MongoClient(uri, opts);
    await this.client.connect();
    this.db = this.client.db(dbName);

    // Monitor errors
    this.client.on('commandFailed', (evt) => {
      this.logger.warn(`MongoDB command failed: ${evt.commandName} — ${evt.failure?.message}`);
    });

    this.logger.log(`MongoDB connected to ${dbName}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
    this.logger.log('MongoDB connection closed');
  }

  /** Get the database handle. */
  getDb(): Db {
    return this.db;
  }

  /** Get the raw MongoClient. */
  getClient(): MongoClient {
    return this.client;
  }

  /** Health check — ping the database. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.db.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
