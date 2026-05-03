import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TerminusModule } from '@nestjs/terminus';
import { PostgresModule } from '@mini-baas/database';
import { ConsentModule } from './consent/consent.module';
import { DeletionModule } from './deletion/deletion.module';
import { ExportModule } from './export/export.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        base: { service: 'gdpr-service' },
      },
    }),
    TerminusModule,
    PostgresModule,
    ConsentModule,
    DeletionModule,
    ExportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
