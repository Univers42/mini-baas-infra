import { IsEmail, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendEmailDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  to!: string;

  @ApiProperty({ example: 'Welcome to Mini BaaS' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiPropertyOptional({ description: 'HTML body (required if text is absent)' })
  @ValidateIf((o: SendEmailDto) => !o.text)
  @IsString()
  @IsNotEmpty({ message: 'Either html or text must be provided' })
  html?: string;

  @ApiPropertyOptional({ description: 'Plain text body (required if html is absent)' })
  @ValidateIf((o: SendEmailDto) => !o.html)
  @IsString()
  @IsNotEmpty({ message: 'Either html or text must be provided' })
  text?: string;
}
