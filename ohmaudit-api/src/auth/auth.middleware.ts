import type { MiddlewareHandler } from 'hono';
import type { ApiBindings } from '../shared/environment';
import type { RequestVariables } from '../shared/request-context';
import type { TokenVerifier } from './auth.types';

export function authenticate(
  verifier: TokenVerifier,
): MiddlewareHandler<{ Bindings: ApiBindings; Variables: RequestVariables }> {
  return async (context, next) => {
    const authorization = context.req.header('authorization');
    if (authorization?.startsWith('Bearer ') !== true) {
      return context.json(
        {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Sign in to continue.',
          correlationId: context.get('correlationId'),
        },
        401,
      );
    }
    let actor;
    try {
      actor = await verifier.verify(authorization.slice(7), context.env);
    } catch {
      return context.json(
        {
          code: 'INVALID_ACCESS_TOKEN',
          message: 'Your session is invalid or has expired.',
          correlationId: context.get('correlationId'),
        },
        401,
      );
    }
    context.set('actor', actor);
    await next();
  };
}
