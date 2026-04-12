import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LlmProviderService } from './llm-provider.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, LlmProviderService],
  exports: [ChatService],
})
export class ChatModule {}
