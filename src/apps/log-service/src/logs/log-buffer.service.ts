import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import { IngestLogDto, LogLevel, QueryLogsDto } from './dto/log.dto';

export interface BufferedLogEntry {
  id: string;
  level: LogLevel;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class LogBufferService {
  private readonly maxSize: number;
  private readonly logs: BufferedLogEntry[] = [];
  private readonly events = new Subject<BufferedLogEntry>();

  readonly stream$ = this.events.asObservable();

  constructor(private readonly config: ConfigService) {
    this.maxSize = this.config.get<number>('LOG_BUFFER_SIZE', 1000);
  }

  add(dto: IngestLogDto): BufferedLogEntry {
    const entry: BufferedLogEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      level: dto.level,
      source: dto.source,
      message: dto.message,
      metadata: dto.metadata,
      timestamp: new Date().toISOString(),
    };

    this.logs.push(entry);
    while (this.logs.length > this.maxSize) {
      this.logs.shift();
    }
    this.events.next(entry);

    return entry;
  }

  query(query: QueryLogsDto): BufferedLogEntry[] {
    const since = query.since ? Date.parse(query.since) : undefined;

    return this.logs.filter((entry) => {
      if (query.level && entry.level !== query.level) return false;
      if (query.source && entry.source !== query.source) return false;
      if (since && Date.parse(entry.timestamp) < since) return false;
      return true;
    });
  }

  clear(): { cleared: number } {
    const cleared = this.logs.length;
    this.logs.length = 0;
    return { cleared };
  }

  getCount(): number {
    return this.logs.length;
  }
}
