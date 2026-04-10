import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserContext } from '../interfaces/user-context.interface';
import { Request } from 'express';

/**
 * Parameter decorator to inject the authenticated user context.
 * @example async findAll(@CurrentUser() user: UserContext) { … }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new Error('CurrentUser decorator used without AuthGuard');
    }
    return request.user;
  },
);
