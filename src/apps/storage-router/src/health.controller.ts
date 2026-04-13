import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { StorageService } from './storage/storage.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly storage: StorageService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — checks S3/MinIO connectivity' })
  ready() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        const ok = await this.storage.isHealthy();
        return { s3: { status: ok ? 'up' : 'down' } };
      },
    ]);
  }
}
