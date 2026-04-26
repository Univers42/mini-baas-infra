import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

@Injectable()
export class QueryCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(QueryCacheService.name);
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly redis?: Redis;
  private redisReady = false;
  private readonly redisKeyPrefix: string;
  readonly adapterTtlMs: number;
  readonly permissionTtlMs: number;
  readonly readTtlMs: number;
  readonly maxEntries: number;

  constructor(config: ConfigService) {
    this.adapterTtlMs = this.numberConfig(config, 'QUERY_ROUTER_ADAPTER_CACHE_TTL_MS', 30_000);
    this.permissionTtlMs = this.numberConfig(config, 'QUERY_ROUTER_PERMISSION_CACHE_TTL_MS', 5_000);
    this.readTtlMs = this.numberConfig(config, 'QUERY_ROUTER_READ_CACHE_TTL_MS', 3_000);
    this.maxEntries = this.numberConfig(config, 'QUERY_ROUTER_CACHE_MAX_ENTRIES', 2_000);
    this.redisKeyPrefix = config.get<string>('QUERY_ROUTER_REDIS_KEY_PREFIX', 'query-router:');

    if (this.booleanConfig(config, 'QUERY_ROUTER_REDIS_CACHE_ENABLED', false)) {
      this.redis = new Redis(config.get<string>('QUERY_ROUTER_REDIS_URL', 'redis://redis:6379'), {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: this.numberConfig(config, 'QUERY_ROUTER_REDIS_CONNECT_TIMEOUT_MS', 1_000),
        commandTimeout: this.numberConfig(config, 'QUERY_ROUTER_REDIS_COMMAND_TIMEOUT_MS', 500),
      });

      this.redis.on('error', (error) => {
        this.redisReady = false;
        this.logger.warn(`Redis L2 cache unavailable: ${error.message}`);
      });

      void this.redis
        .connect()
        .then(() => {
          this.redisReady = true;
          this.logger.log('Redis L2 cache connected');
        })
        .catch((error: Error) => {
          this.redisReady = false;
          this.logger.warn(`Redis L2 cache disabled: ${error.message}`);
        });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  key(...parts: Array<string | number | boolean | undefined | null>): string {
    return parts.map((part) => encodeURIComponent(String(part ?? ''))).join(':');
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (entry) {
      if (Date.now() <= entry.expiresAt) {
        return entry.value as T;
      }

      this.entries.delete(key);
    }

    const l2Value = await this.getFromRedis<T>(key);
    if (l2Value === undefined) return undefined;

    this.setLocal(key, l2Value, this.remainingTtlMs(key));
    return l2Value;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (ttlMs <= 0) return;
    this.setLocal(key, value, ttlMs);
    await this.setRedis(key, value, ttlMs);
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }

    await this.deleteRedisPrefix(prefix);
  }

  getInFlight<T>(key: string): Promise<T> | undefined {
    return this.inFlight.get(key) as Promise<T> | undefined;
  }

  coalesce<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.getInFlight<T>(key);
    if (existing) return existing;

    const promise = operation().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise as Promise<unknown>);
    return promise;
  }

  private setLocal<T>(key: string, value: T, ttlMs: number): void {
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey) this.entries.delete(oldestKey);
    }

    this.entries.set(key, {
      expiresAt: Date.now() + ttlMs,
      value,
    });
  }

  private async getFromRedis<T>(key: string): Promise<T | undefined> {
    if (!this.redis || !this.redisReady) return undefined;

    try {
      const raw = await this.redis.get(this.redisKey(key));
      if (raw === null) return undefined;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.redisReady = false;
      this.logger.warn(`Redis L2 cache read failed: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private async setRedis<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (!this.redis || !this.redisReady) return;

    try {
      await this.redis.psetex(this.redisKey(key), ttlMs, JSON.stringify(value));
    } catch (error) {
      this.redisReady = false;
      this.logger.warn(`Redis L2 cache write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async deleteRedisPrefix(prefix: string): Promise<void> {
    if (!this.redis || !this.redisReady) return;

    const match = `${this.redisKey(prefix)}*`;
    let cursor = '0';

    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', match, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.unlink(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.redisReady = false;
      this.logger.warn(`Redis L2 cache invalidation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private redisKey(key: string): string {
    return `${this.redisKeyPrefix}${key}`;
  }

  private remainingTtlMs(key: string): number {
    if (key.startsWith('adapter:')) return this.adapterTtlMs;
    if (key.startsWith('permission:')) return this.permissionTtlMs;
    return this.readTtlMs;
  }

  private numberConfig(config: ConfigService, key: string, fallback: number): number {
    const value = config.get<string | number>(key, fallback);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private booleanConfig(config: ConfigService, key: string, fallback: boolean): boolean {
    const value = config.get<string | boolean>(key, fallback);
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
}
