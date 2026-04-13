import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignDto } from './dto/presign.dto';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3!: S3Client;
  private defaultExpires!: number;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.s3 = new S3Client({
      endpoint: this.config.getOrThrow<string>('S3_ENDPOINT'),
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY', 'minioadmin'),
      },
      forcePathStyle: true, // required for MinIO
    });

    this.defaultExpires = this.config.get<number>('PRESIGN_EXPIRES_SECONDS', 3600);
    this.logger.log('S3 client initialised');
  }

  /** Lightweight S3 connectivity check (ListBuckets). */
  async isHealthy(): Promise<boolean> {
    try {
      await this.s3.send(new ListBucketsCommand({}));
      return true;
    } catch {
      return false;
    }
  }

  async presign(
    bucket: string,
    objectPath: string,
    userId: string,
    dto: PresignDto,
  ) {
    // Auto-prefix key with user ID for tenant isolation
    const key = `${userId}/${objectPath}`;
    const expiresIn = Math.min(Math.max(dto.expiresIn ?? this.defaultExpires, 60), 86400);

    let command: GetObjectCommand | PutObjectCommand;

    if (dto.method === 'GET') {
      command = new GetObjectCommand({ Bucket: bucket, Key: key });
    } else {
      command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: dto.contentType ?? 'application/octet-stream',
      });
    }

    const signedUrl = await getSignedUrl(this.s3, command, { expiresIn });

    return {
      signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      method: dto.method,
      bucket,
      key,
    };
  }
}
