import { describe, expect, it } from 'vitest';
import { eventStatus, parseEmailEvent } from '../src/email/email-event';

describe('Cloudflare Email Service events', () => {
  it.each([
    ['delivered', 'DELIVERED'],
    ['deferred', 'DEFERRED'],
    ['bounced', 'BOUNCED'],
    ['failed', 'FAILED'],
    ['rejected', 'REJECTED'],
    ['complained', 'COMPLAINED'],
  ] as const)('maps %s events to %s', (event, status) => {
    expect(eventStatus(`cf.email.sending.message.${event}`)).toBe(status);
  });

  it('normalises SMTP and bounce metadata without retaining content bodies', () => {
    const parsed = parseEmailEvent({
      type: 'cf.email.sending.message.bounced',
      source: { type: 'email.sending', zoneId: 'zone', domain: 'ohmaudit.com' },
      payload: {
        eventId: 'event-1',
        messageId: 'message-1',
        sender: 'noreply@ohmaudit.com',
        recipient: 'user@example.com',
        subject: 'Test',
        terminal: true,
        delivery: {
          status: 'bounced',
          provider: 'external_smtp',
          smtpStatusCode: '550',
          smtpEnhancedStatusCode: '5.1.1',
          smtpResponse: '550 user unknown',
        },
        bounce: { type: 'hard', classification: 'permanent_failure', reason: 'User unknown' },
      },
      metadata: {
        accountId: 'account',
        eventSubscriptionId: 'subscription',
        eventSchemaVersion: 1,
        eventTimestamp: '2026-09-28T21:00:00.000Z',
      },
    });

    expect(parsed).toMatchObject({
      status: 'BOUNCED',
      reason: 'User unknown',
      smtpStatusCode: '550',
      smtpEnhancedStatus: '5.1.1',
    });
    expect(JSON.stringify(parsed)).not.toContain('html');
    expect(JSON.stringify(parsed)).not.toContain('text');
  });
});
