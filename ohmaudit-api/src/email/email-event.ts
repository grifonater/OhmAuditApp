import { z } from 'zod';
import type { EmailAuditStatus } from '../generated/prisma/client';

const eventNames = [
  'delivered',
  'deferred',
  'bounced',
  'failed',
  'rejected',
  'complained',
] as const;

const optionalText = z.string().max(10_000).optional();
const emailEventSchema = z.object({
  type: z.enum(
    eventNames.map((name) => `cf.email.sending.message.${name}`) as [
      `cf.email.sending.message.${(typeof eventNames)[number]}`,
      ...`cf.email.sending.message.${(typeof eventNames)[number]}`[],
    ],
  ),
  source: z.object({ type: z.literal('email.sending'), zoneId: z.string(), domain: z.string() }),
  payload: z.object({
    eventId: z.string().min(1).max(200),
    messageId: z.string().min(1).max(500),
    sender: z.email(),
    recipient: z.email(),
    subject: z.string().max(1000).optional(),
    terminal: z.boolean(),
    delivery: z.object({
      status: z.string().max(100),
      provider: z.string().max(200).optional(),
      deliveryTimeMs: z.number().nonnegative().optional(),
      smtpStatusCode: z.string().max(20).optional(),
      smtpEnhancedStatusCode: z.string().max(20).optional(),
      smtpResponse: optionalText,
    }),
    bounce: z
      .object({
        type: z.string().max(100),
        classification: z.string().max(200),
        reason: optionalText,
      })
      .optional(),
    failure: z.object({ reason: optionalText }).optional(),
    rejection: z
      .object({ reason: optionalText, party: z.string().max(100).optional(), detail: optionalText })
      .optional(),
    complaint: z.object({ type: z.string().max(100) }).optional(),
  }),
  metadata: z.object({
    accountId: z.string(),
    eventSubscriptionId: z.string(),
    eventSchemaVersion: z.number().int(),
    eventTimestamp: z.iso.datetime(),
  }),
});

export type ParsedEmailEvent = ReturnType<typeof parseEmailEvent>;

export function eventStatus(type: string): EmailAuditStatus | undefined {
  const name = type.split('.').at(-1);
  if (name === undefined || !eventNames.includes(name as (typeof eventNames)[number]))
    return undefined;
  return name.toUpperCase() as EmailAuditStatus;
}

export function parseEmailEvent(input: unknown) {
  const event = emailEventSchema.parse(input);
  const status = eventStatus(event.type)!;
  const reason =
    event.payload.bounce?.reason ??
    event.payload.failure?.reason ??
    event.payload.rejection?.detail ??
    event.payload.rejection?.reason ??
    event.payload.complaint?.type;
  return {
    eventId: event.payload.eventId,
    messageId: event.payload.messageId,
    eventType: event.type,
    status,
    ...(reason === undefined ? {} : { reason }),
    ...(event.payload.delivery.smtpStatusCode === undefined
      ? {}
      : { smtpStatusCode: event.payload.delivery.smtpStatusCode }),
    ...(event.payload.delivery.smtpEnhancedStatusCode === undefined
      ? {}
      : { smtpEnhancedStatus: event.payload.delivery.smtpEnhancedStatusCode }),
    ...(event.payload.delivery.smtpResponse === undefined
      ? {}
      : { smtpResponse: event.payload.delivery.smtpResponse }),
    occurredAt: new Date(event.metadata.eventTimestamp),
    metadata: {
      source: event.source,
      subscription: event.metadata,
      recipient: event.payload.recipient,
      terminal: event.payload.terminal,
      delivery: event.payload.delivery,
      ...(event.payload.bounce === undefined ? {} : { bounce: event.payload.bounce }),
      ...(event.payload.failure === undefined ? {} : { failure: event.payload.failure }),
      ...(event.payload.rejection === undefined ? {} : { rejection: event.payload.rejection }),
      ...(event.payload.complaint === undefined ? {} : { complaint: event.payload.complaint }),
    },
  };
}
