import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogBufferService } from './log-buffer.service';

@Module({
  controllers: [LogsController],
  providers: [LogBufferService],
  exports: [LogBufferService],
})
export class LogsModule {}