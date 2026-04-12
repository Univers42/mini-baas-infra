import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EventsService } from './events/events.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly events: EventsService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — verifies MongoDB connection' })
  ready() {
    return this.health.check([
      async () => {
        const ok = await this.events.isHealthy();
        return { mongo: { status: ok ? 'up' : 'down' } };
      },
    ]);
  }
}
