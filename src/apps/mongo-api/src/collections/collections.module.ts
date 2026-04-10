import { Module } from '@nestjs/common';
import { makeCounterProvider } from '@willsoto/nestjs-prometheus';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';

@Module({
  controllers: [CollectionsController],
  providers: [
    CollectionsService,
    makeCounterProvider({
      name: 'mongo_operations_total',
      help: 'Total MongoDB operations',
      labelNames: ['collection', 'operation'],
    }),
  ],
})
export class CollectionsModule {}
