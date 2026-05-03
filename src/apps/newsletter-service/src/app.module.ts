import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TerminusModule } from '@nestjs/terminus';
import { PostgresModule } from '@mini-baas/database';
import { SubscriptionModule } from './subscription/subscription.module';
import { CampaignModule } from './campaign/campaign.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        base: { service: 'newsletter-service' },
      },
    }),
    TerminusModule,
    PostgresModule,
    SubscriptionModule,
    CampaignModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
