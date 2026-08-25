export interface NotificationBindings {
  APP_ENV: 'local' | 'development' | 'staging' | 'production';
  APP_VERSION: string;
  NOTIFICATION_BATCH_SIZE: string;
}

export interface NotificationJob {
  messageId: string;
  schemaVersion: 1;
  eventType: string;
  correlationId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface NotificationProvider {
  send(job: NotificationJob): Promise<void>;
}

export class ConsoleNotificationProvider implements NotificationProvider {
  send(job: NotificationJob): Promise<void> {
    console.info(
      JSON.stringify({
        event: 'notification.delivered',
        messageId: job.messageId,
        eventType: job.eventType,
        correlationId: job.correlationId,
      }),
    );
    return Promise.resolve();
  }
}

export function isNotificationJob(value: unknown): value is NotificationJob {
  if (typeof value !== 'object' || value === null) return false;
  const job = value as Record<string, unknown>;
  return (
    typeof job['messageId'] === 'string' &&
    job['schemaVersion'] === 1 &&
    typeof job['eventType'] === 'string'
  );
}

export default {
  fetch(_request: Request, env: NotificationBindings): Response {
    return Response.json({
      service: 'ohmaudit-worker-notifications',
      status: 'ok',
      version: env.APP_VERSION,
    });
  },
  async queue(batch: MessageBatch<unknown>): Promise<void> {
    const provider = new ConsoleNotificationProvider();
    for (const message of batch.messages) {
      if (!isNotificationJob(message.body)) {
        message.retry();
        continue;
      }
      try {
        await provider.send(message.body);
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<NotificationBindings>;
