import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongoService } from './mongo.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [MongoService],
  exports: [MongoService],
})
export class MongoModule {}
