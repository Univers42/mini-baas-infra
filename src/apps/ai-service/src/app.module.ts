import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TerminusModule } from '@nestjs/terminus';
import { MongoModule } from '@mini-baas/database';
import { ChatModule } from './chat/chat.module';
import { PromptsModule } from './prompts/prompts.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        base: { service: 'ai-service' },
      },
    }),
    TerminusModule,
    MongoModule,
    ChatModule,
    PromptsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
