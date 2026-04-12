import { Module } from '@nestjs/common';
import { DeletionController } from './deletion.controller';
import { DeletionService } from './deletion.service';

@Module({
  controllers: [DeletionController],
  providers: [DeletionService],
  exports: [DeletionService],
})
export class DeletionModule {}
