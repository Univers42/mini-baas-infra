import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export class IngestLogDto {
  @ApiProperty({ enum: LOG_LEVELS, example: 'info' })
  @IsIn(LOG_LEVELS)
  level!: LogLevel;

  @ApiProperty({ example: 'query-router' })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiProperty({ example: 'Query executed successfully' })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({ description: 'Structured metadata attached to the log entry' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class QueryLogsDto {
  @ApiPropertyOptional({ enum: LOG_LEVELS })
  @IsOptional()
  @IsIn(LOG_LEVELS)
  level?: LogLevel;

  @ApiPropertyOptional({ example: 'query-router' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: '2026-04-26T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  since?: string;
}
