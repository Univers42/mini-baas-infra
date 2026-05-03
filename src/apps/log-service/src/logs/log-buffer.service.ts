import { Injectable } from '@nestjs/common';

export interface BufferedLogEntry {
  level: string;
  source: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

const MAX_BUFFER_SIZE = 1_000;

@Injectable()
export class LogBufferService {
  private readonly entries: BufferedLogEntry[] = [];

  add(entry: Omit<BufferedLogEntry, 'createdAt'>): BufferedLogEntry {
    const buffered = {
      ...entry,
      createdAt: new Date().toISOString(),
    };
    this.entries.push(buffered);
    if (this.entries.length > MAX_BUFFER_SIZE) {
      this.entries.shift();
    }
    return buffered;
  }

  list(limit = 100): BufferedLogEntry[] {
    return this.entries.slice(-Math.min(limit, MAX_BUFFER_SIZE));
  }

  getCount(): number {
    return this.entries.length;
  }
}