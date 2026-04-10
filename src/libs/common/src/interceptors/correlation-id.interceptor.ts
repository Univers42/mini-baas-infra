import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Reads X-Request-ID from inbound request (set by Kong),
 * falls back to a generated UUID, and propagates it onto the response.
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const correlationId = (req.headers['x-request-id'] as string) ?? randomUUID();
    req.requestId = correlationId;

    return next.handle().pipe(
      tap(() => {
        res.setHeader('X-Request-ID', correlationId);
      }),
    );
  }
}
