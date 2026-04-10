import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TerminusModule } from '@nestjs/terminus';
import { PrometheusModule, makeHistogramProvider } from '@willsoto/nestjs-prometheus';
import { MongoModule } from '@mini-baas/database';
import { CollectionsModule } from './collections/collections.module';
import { AdminModule } from './admin/admin.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        genReqId: (req: { headers?: Record<string, unknown> }) =>
          (req.headers?.['x-request-id'] as string) ??
          `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        base: { service: 'mongo-api' },
      },
    }),
    TerminusModule,
    PrometheusModule.register({ defaultMetrics: { enabled: true } }),
    MongoModule,
    CollectionsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    }),
  ],
})
export class AppModule {}
