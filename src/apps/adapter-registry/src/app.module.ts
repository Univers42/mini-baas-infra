import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TerminusModule } from '@nestjs/terminus';
import { PostgresModule } from '@mini-baas/database';
import { DatabasesModule } from './databases/databases.module';
import { CryptoModule } from './crypto/crypto.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        base: { service: 'adapter-registry' },
      },
    }),
    TerminusModule,
    PostgresModule,
    CryptoModule,
    DatabasesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
