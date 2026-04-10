import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateIndexDto {
  @ApiProperty({ description: 'Index keys, e.g. { "name": 1 }' })
  @IsObject()
  keys!: Record<string, number>;

  @ApiPropertyOptional({ description: 'Index options (unique, sparse, etc.)' })
  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}

export class UpdateSchemaDto {
  @ApiProperty({ description: 'MongoDB JSON Schema validator' })
  @IsObject()
  validator!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'strict', enum: ['off', 'strict', 'moderate'] })
  @IsOptional()
  @IsString()
  validationLevel?: string;

  @ApiPropertyOptional({ example: 'error', enum: ['error', 'warn'] })
  @IsOptional()
  @IsString()
  validationAction?: string;
}
