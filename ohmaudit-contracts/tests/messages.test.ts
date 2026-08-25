import { describe, expect, it } from 'vitest';
import { queueMessageSchema } from '../src/index.js';

describe('queueMessageSchema', () => {
  it('accepts a fully traceable versioned message', () => {
    const parsed = queueMessageSchema.parse({
      messageId: 'c82fa2d4-4ee4-47cc-81d7-d43b09fe4402',
      schemaVersion: 1,
      eventType: 'InspectionSubmitted',
      occurredAt: '2026-08-13T10:00:00+00:00',
      correlationId: 'request-123',
      payload: { inspectionId: 'inspection-1' },
    });

    expect(parsed.schemaVersion).toBe(1);
  });

  it('rejects an undocumented schema version', () => {
    const result = queueMessageSchema.safeParse({
      messageId: crypto.randomUUID(),
      schemaVersion: 2,
      eventType: 'InspectionSubmitted',
      occurredAt: new Date().toISOString(),
      correlationId: 'request-123',
      payload: {},
    });

    expect(result.success).toBe(false);
  });
});
