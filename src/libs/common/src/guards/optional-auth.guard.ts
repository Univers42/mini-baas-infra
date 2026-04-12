import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { UserContext } from '../interfaces/user-context.interface';

/**
 * Like AuthGuard but does NOT throw when X-User-Id is absent.
 * Populates req.user if headers are present; leaves it undefined otherwise.
 * Use for endpoints that work both authenticated and anonymously.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      req.user = undefined;
      return true;
    }

    const user: UserContext = {
      id: userId,
      email: (req.headers['x-user-email'] as string) ?? '',
      role: (req.headers['x-user-role'] as string) ?? 'authenticated',
    };

    req.user = user;
    return true;
  }
}
