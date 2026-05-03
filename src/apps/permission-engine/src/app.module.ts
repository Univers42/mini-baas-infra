import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TerminusModule } from '@nestjs/terminus';
import { PostgresModule } from '@mini-baas/database';
import { PermissionsModule } from './permissions/permissions.module';
import { PoliciesModule } from './policies/policies.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        base: { service: 'permission-engine' },
      },
    }),
    TerminusModule,
    PostgresModule,
    PermissionsModule,
    PoliciesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
