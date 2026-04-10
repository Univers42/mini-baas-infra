import { IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDatabaseDto {
  @ApiProperty({ example: 'postgresql', enum: ['postgresql', 'mongodb', 'mysql', 'redis', 'sqlite'] })
  @IsEnum(['postgresql', 'mongodb', 'mysql', 'redis', 'sqlite'])
  engine!: string;

  @ApiProperty({ example: 'my-production-db', minLength: 1, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @ApiProperty({ example: 'postgresql://user:pass@host:5432/db' })
  @IsString()
  @IsNotEmpty()
  connection_string!: string;
}
