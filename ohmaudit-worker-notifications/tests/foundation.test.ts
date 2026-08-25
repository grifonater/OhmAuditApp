import { describe, expect, it } from 'vitest';
import { isNotificationJob } from '../src/index';

describe('notification worker', () => {
  it('rejects unversioned queue payloads', () => {
    expect(isNotificationJob({ messageId: 'one', eventType: 'DueSoon' })).toBe(false);
  });
  it('accepts version 1 envelopes', () => {
    expect(isNotificationJob({ messageId: 'one', schemaVersion: 1, eventType: 'DueSoon' })).toBe(
      true,
    );
  });
});
