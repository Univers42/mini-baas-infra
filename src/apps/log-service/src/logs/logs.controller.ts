import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { concat, map, Observable, of } from 'rxjs';
import { IngestLogDto, QueryLogsDto } from './dto/log.dto';
import { LogBufferService } from './log-buffer.service';

@ApiTags('logs')
@Controller('logs')
export class LogsController {
  constructor(
    private readonly buffer: LogBufferService,
    private readonly config: ConfigService,
  ) {}

  @Post('ingest')
  @ApiOperation({ summary: 'Ingest a structured log entry' })
  ingest(@Body() dto: IngestLogDto) {
    return this.buffer.add(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Query buffered logs' })
  list(@Query() query: QueryLogsDto) {
    return this.buffer.query(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get ring buffer statistics' })
  stats() {
    return { count: this.buffer.getCount() };
  }

  @Delete()
  @ApiOperation({ summary: 'Clear buffered logs' })
  clear() {
    return this.buffer.clear();
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Stream logs via Server-Sent Events' })
  stream(@Query('token') token?: string): Observable<{ data: unknown }> {
    const expected = this.config.get<string>('LOG_STREAM_TOKEN');
    if (expected && token !== expected) {
      throw new UnauthorizedException('Invalid log stream token');
    }

    const initial = of({ data: { type: 'initial', logs: this.buffer.query({}) } });
    const updates = this.buffer.stream$.pipe(
      map((log) => ({ data: { type: 'log', log } })),
    );

    return concat(initial, updates);
  }
}
