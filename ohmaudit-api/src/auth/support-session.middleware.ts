import type { MiddlewareHandler } from 'hono';
import { createPrismaClient } from '../database/prisma';
import type { ApiBindings } from '../shared/environment';
import { parseEnvironment } from '../shared/environment';
import type { RequestVariables } from '../shared/request-context';
import { DomainError } from '../shared/domain-error';

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

export function supportSession(): MiddlewareHandler<{
  Bindings: ApiBindings;
  Variables: RequestVariables;
}> {
  return async (context, next) => {
    const token = context.req.header('x-ohmaudit-support-session');
    if (token === undefined) {
      await next();
      return;
    }
    if (!/^[a-f0-9]{64}$/iu.test(token))
      throw new DomainError('SUPPORT_SESSION_INVALID', 'The support session is invalid.', 401);

    const environment = parseEnvironment(context.env);
    const connectionString = environment.HYPERDRIVE?.connectionString ?? environment.DATABASE_URL;
    if (connectionString === undefined) throw new Error('HYPERDRIVE or DATABASE_URL is required.');
    const prisma = createPrismaClient(connectionString);
    const originalActor = context.get('actor');
    const administrator = await prisma.user.findUnique({
      where: { authSubject: originalActor.authSubject },
    });
    if (administrator?.platformRole !== 'PLATFORM_ADMIN' || administrator.status !== 'ACTIVE')
      throw new DomainError(
        'PLATFORM_ADMIN_REQUIRED',
        'Platform administrator access is required for support mode.',
        403,
      );
    const session = await prisma.platformSupportSession.findUnique({
      where: { tokenHash: await hash(token) },
      include: { targetUser: true },
    });
    if (
      session === null ||
      session.platformAdminUserId !== administrator.id ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      session.targetUser.status !== 'ACTIVE'
    )
      throw new DomainError(
        'SUPPORT_SESSION_EXPIRED',
        'This support session has expired. Return to the superuser area to begin another.',
        401,
      );
    context.set('actor', {
      authSubject: session.targetUser.authSubject,
      email: session.targetUser.email,
      ...(session.targetUser.displayName === null
        ? {}
        : { displayName: session.targetUser.displayName }),
      assuranceLevel: originalActor.assuranceLevel,
      support: {
        sessionId: session.id,
        platformAdminUserId: administrator.id,
        targetUserId: session.targetUserId,
        organisationId: session.organisationId,
        expiresAt: session.expiresAt.toISOString(),
      },
    });
    context.executionCtx.waitUntil(
      prisma.platformSupportSession
        .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
        .then(() => undefined),
    );
    await next();
  };
}
