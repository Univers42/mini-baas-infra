import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — checks adapter-registry reachability' })
  ready() {
    const registryUrl = this.config.getOrThrow<string>('ADAPTER_REGISTRY_URL');
    return this.health.check([
      () => this.http.pingCheck('adapter-registry', `${registryUrl}/health/live`),
    ]);
  }
}
