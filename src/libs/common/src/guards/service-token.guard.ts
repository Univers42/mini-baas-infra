import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UserContext } from '../interfaces/user-context.interface';

/**
 * Accepts either a service token (X-Service-Token) or Kong user headers.
 * Used by internal endpoints like /databases/:id/connect where
 * query-router calls adapter-registry with a shared secret.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // 1. Try service token
    const serviceToken = req.headers['x-service-token'] as string | undefined;
    const expectedToken = this.config.get<string>('ADAPTER_REGISTRY_SERVICE_TOKEN');

    if (serviceToken && expectedToken && serviceToken === expectedToken) {
      // Service-to-service call — use X-Tenant-Id as user identity
      const tenantId = req.headers['x-tenant-id'] as string | undefined;
      if (!tenantId) {
        throw new UnauthorizedException('Service token requires X-Tenant-Id header');
      }
      req.user = {
        id: tenantId,
        email: 'service@internal',
        role: 'service_role',
      } satisfies UserContext;
      return true;
    }

    // 2. Fall back to Kong headers
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      throw new UnauthorizedException(
        'Missing authentication — provide X-Service-Token or X-User-Id',
      );
    }

    req.user = {
      id: userId,
      email: (req.headers['x-user-email'] as string) ?? '',
      role: (req.headers['x-user-role'] as string) ?? 'authenticated',
    } satisfies UserContext;

    return true;
  }
}
