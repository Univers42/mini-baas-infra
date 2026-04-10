import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AuthGuard, CurrentUser, UserContext } from '@mini-baas/common';
import { StorageService } from './storage.service';
import { PresignDto } from './dto/presign.dto';
import { Request } from 'express';

@ApiTags('storage')
@Controller('sign')
@UseGuards(AuthGuard)
export class StorageController {
  constructor(private readonly service: StorageService) {}

  @Post(':bucket/*')
  @ApiParam({ name: 'bucket', description: 'S3 bucket name' })
  @ApiOperation({ summary: 'Generate a presigned URL for upload/download (key auto-prefixed with user ID)' })
  async presign(
    @CurrentUser() user: UserContext,
    @Param('bucket') bucket: string,
    @Req() req: Request,
    @Body() dto: PresignDto,
  ) {
    // Extract wildcard portion of the URL as the object path
    const fullPath = req.params[0] as string | undefined;
    const objectPath = fullPath ?? 'unnamed';

    return this.service.presign(bucket, objectPath, user.id, dto);
  }
}
