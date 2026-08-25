import { z } from 'zod';

const messageMetadataShape = {
  messageId: z.uuid(),
  schemaVersion: z.literal(1),
  occurredAt: z.iso.datetime({ offset: true }),
  correlationId: z.string().min(1).max(128),
};

export const domainEventTypes = [
  'InspectionSubmitted',
  'InspectionApproved',
  'CertificateIssued',
  'DefectCreated',
  'AssetChangeProposed',
  'AssetDecommissioned',
  'ScheduleOccurrenceCompleted',
  'SubscriptionChanged',
  'ModuleEntitlementChanged',
] as const;

export const domainEventSchema = z.object({
  ...messageMetadataShape,
  eventType: z.enum(domainEventTypes),
  organisationId: z.uuid(),
  payload: z.record(z.string(), z.unknown()),
});
export type DomainEvent = z.infer<typeof domainEventSchema>;

export const queueMessageSchema = z.object({
  ...messageMetadataShape,
  eventType: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()),
});
export type QueueMessage = z.infer<typeof queueMessageSchema>;

export const internalWebhookSchema = z.object({
  ...messageMetadataShape,
  eventType: z.string().min(1).max(128),
  provider: z.string().min(1).max(64),
  externalEventId: z.string().min(1).max(256),
  receivedAt: z.iso.datetime({ offset: true }),
  payload: z.record(z.string(), z.unknown()),
});
export type InternalWebhook = z.infer<typeof internalWebhookSchema>;
