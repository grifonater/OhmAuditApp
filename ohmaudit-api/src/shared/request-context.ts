import type { MiddlewareHandler } from 'hono';
import type { AuthenticatedActor } from '../auth/auth.types';

export type RequestVariables = { correlationId: string; actor: AuthenticatedActor };

export const requestContext: MiddlewareHandler<{ Variables: RequestVariables }> = async (
  context,
  next,
) => {
  const suppliedId = context.req.header('x-correlation-id');
  const correlationId = suppliedId?.slice(0, 128) || crypto.randomUUID();
  context.set('correlationId', correlationId);
  context.header('x-correlation-id', correlationId);
  await next();
};
