import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PostgresService } from '@mini-baas/database';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly pg: PostgresService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — verifies PostgreSQL connectivity' })
  ready() {
    return this.health.check([
      async () => {
        const ok = await this.pg.isHealthy();
        return { postgres: { status: ok ? 'up' : 'down' } };
      },
    ]);
  }
}
