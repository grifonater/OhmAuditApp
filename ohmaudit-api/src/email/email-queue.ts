import { createPrismaClient } from '../database/prisma';
import type { ApiBindings } from '../shared/environment';
import { parseEnvironment } from '../shared/environment';
import { EmailAuditService } from './email-audit.service';
import { parseEmailEvent } from './email-event';

export async function handleEmailEventQueue(
  batch: MessageBatch<unknown>,
  bindings: ApiBindings,
): Promise<void> {
  const environment = parseEnvironment(bindings);
  const connectionString = environment.HYPERDRIVE?.connectionString ?? environment.DATABASE_URL;
  if (connectionString === undefined) throw new Error('HYPERDRIVE or DATABASE_URL is required.');
  const service = new EmailAuditService(createPrismaClient(connectionString));
  await Promise.all(
    batch.messages.map(async (message) => {
      try {
        await service.recordEvent(parseEmailEvent(message.body));
        message.ack();
      } catch (error: unknown) {
        console.error(
          JSON.stringify({
            event: 'api.email_event.failed',
            queueMessageId: message.id,
            errorType: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        message.retry();
      }
    }),
  );
}
