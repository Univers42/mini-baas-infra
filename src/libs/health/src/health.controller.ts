import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Generic liveness + readiness health controller.
 * Apps register custom health indicators via HealthModule.forRoot().
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicator[],
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — checks all registered health indicators' })
  ready() {
    return this.health.check(
      this.indicators.map(
        (indicator) => () =>
          (indicator as HealthIndicator & { isHealthy: (key: string) => Promise<HealthIndicatorResult> })
            .isHealthy(indicator.constructor.name),
      ),
    );
  }
}
