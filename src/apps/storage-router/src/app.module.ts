import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TerminusModule } from '@nestjs/terminus';
import { randomUUID } from 'node:crypto';
import { StorageModule } from './storage/storage.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        genReqId: (req: { headers?: Record<string, unknown> }) =>
          (req.headers?.['x-request-id'] as string) ??
          randomUUID(),
        transport:
          process.env['NODE_ENV'] === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { colorize: true } },
        base: { service: 'storage-router' },
      },
    }),
    TerminusModule,
    StorageModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
