import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { PostgresqlEngine } from '../engines/postgresql.engine';
import { MongodbEngine } from '../engines/mongodb.engine';

@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [QueryController],
  providers: [QueryService, PostgresqlEngine, MongodbEngine],
})
export class QueryModule {}
