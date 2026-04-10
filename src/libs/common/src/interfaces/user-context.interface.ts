/**
 * User context extracted from Kong trusted headers.
 * Populated by AuthGuard and injected via @CurrentUser() decorator.
 */
export interface UserContext {
  /** UUID from X-User-Id header */
  id: string;
  /** Email from X-User-Email header */
  email: string;
  /** Role from X-User-Role header: 'authenticated' | 'service_role' | 'anon' */
  role: string;
}

/**
 * Augment Express Request with user context.
 */
declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
      requestId?: string;
    }
  }
}
