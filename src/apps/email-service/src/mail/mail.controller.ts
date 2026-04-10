import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@mini-baas/common';
import { MailService } from './mail.service';
import { SendEmailDto } from './dto/send-email.dto';

@ApiTags('mail')
@Controller('send')
@UseGuards(AuthGuard)
export class MailController {
  constructor(private readonly service: MailService) {}

  @Post()
  @ApiOperation({ summary: 'Send an email via SMTP' })
  async send(@Body() dto: SendEmailDto) {
    return this.service.send(dto);
  }
}
