import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoService } from './crypto.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
