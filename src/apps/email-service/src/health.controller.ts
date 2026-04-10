import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MailService } from './mail/mail.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mail: MailService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — verifies SMTP connection' })
  ready() {
    return this.health.check([
      async () => {
        const ok = await this.mail.isHealthy();
        return { smtp: { status: ok ? 'up' : 'down' } };
      },
    ]);
  }
}
