import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LogsController } from './logs.controller';
import { LogBufferService } from './log-buffer.service';

@Module({
  imports: [ConfigModule],
  controllers: [LogsController],
  providers: [LogBufferService],
  exports: [LogBufferService],
})
export class LogsModule {}
