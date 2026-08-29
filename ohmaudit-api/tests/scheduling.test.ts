import { describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import {
  materialiseDates,
  recurringDateAfter,
  ScheduleService,
} from '../src/scheduling/schedule.service';

describe('schedule materialisation', () => {
  it('creates a five-year rolling horizon immediately', () => {
    const dates = materialiseDates(new Date('2026-08-31T00:00:00.000Z'), 12);
    expect(dates.map((date) => date.toISOString().slice(0, 10))).toEqual([
      '2026-08-31',
      '2027-08-31',
      '2028-08-31',
      '2029-08-31',
      '2030-08-31',
      '2031-08-31',
    ]);
  });

  it('keeps month-end schedules on a valid calendar day', () => {
    const dates = materialiseDates(new Date('2026-01-31T00:00:00.000Z'), 1, 1);
    expect(dates[1]?.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('rebases the next recurrence from the performed inspection date', () => {
    expect(recurringDateAfter(new Date('2026-04-14T00:00:00.000Z'), 12).toISOString()).toBe(
      '2027-04-14T00:00:00.000Z',
    );
  });

  it('clamps rebased month-end dates', () => {
    expect(recurringDateAfter(new Date('2028-02-29T00:00:00.000Z'), 12).toISOString()).toBe(
      '2029-02-28T00:00:00.000Z',
    );
  });

  it('completes the nearest occurrence and rebuilds future dates after approval', async () => {
    const occurrenceUpdate = vi.fn();
    let firstCreatedDueDate: Date | undefined;
    const occurrenceCreateMany = vi.fn(
      (input: { data: Array<{ dueDate: Date }> }) => (firstCreatedDueDate = input.data[0]?.dueDate),
    );
    const ruleUpdate = vi.fn();
    const completedAt = new Date('2026-08-22T10:00:00.000Z');
    const transaction = {
      scheduleRule: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'rule-a',
            frequencyMonths: 12,
            notificationLeadDays: 30,
            occurrences: [
              { id: 'due-a', dueDate: new Date('2026-08-31T00:00:00.000Z') },
              { id: 'future-a', dueDate: new Date('2027-08-31T00:00:00.000Z') },
            ],
          },
        ]),
        update: ruleUpdate,
      },
      scheduleOccurrence: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: occurrenceUpdate,
        deleteMany: vi.fn(),
        createMany: occurrenceCreateMany,
      },
      notificationEvent: { updateMany: vi.fn() },
    } as unknown as Prisma.TransactionClient;
    const service = new ScheduleService({} as PrismaClient);

    await service.completeAndRebaseForInspection(
      transaction,
      {
        id: 'inspection-a',
        organisationId: 'organisation-a',
        siteId: 'site-a',
        assetId: null,
        moduleKey: 'core',
        visitId: 'visit-a',
        effectiveDate: new Date('2026-08-20T00:00:00.000Z'),
      },
      completedAt,
    );

    expect(occurrenceUpdate).toHaveBeenCalledWith({
      where: { id: 'due-a' },
      data: {
        status: 'COMPLETED',
        completedAt,
        inspectionId: 'inspection-a',
        visitId: 'visit-a',
      },
    });
    expect(ruleUpdate).toHaveBeenCalledWith({
      where: { id: 'rule-a' },
      data: { startDate: new Date('2027-08-20T00:00:00.000Z') },
    });
    expect(firstCreatedDueDate?.toISOString()).toBe('2027-08-20T00:00:00.000Z');
  });
});
