import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresService } from './postgres.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PostgresService],
  exports: [PostgresService],
})
export class PostgresModule {}
