import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { UserContext } from '../interfaces/user-context.interface';

/**
 * Reads Kong-injected trusted headers and populates req.user.
 * Rejects if X-User-Id is missing (unauthenticated request).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    const userId = req.headers['x-user-id'] as string | undefined;
    const email = req.headers['x-user-email'] as string | undefined;
    const role = req.headers['x-user-role'] as string | undefined;

    if (!userId) {
      throw new UnauthorizedException('Missing authentication — X-User-Id header required');
    }

    const user: UserContext = {
      id: userId,
      email: email ?? '',
      role: role ?? 'authenticated',
    };

    req.user = user;
    return true;
  }
}
