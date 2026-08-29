import { describe, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { JobCategoryService } from '../src/jobs/job-category.service';
import { VisitService } from '../src/visits/visit.service';

describe('Job management', () => {
  it('lists only active system and current-organisation categories', async () => {
    let where: unknown;
    const prisma = {
      jobCategory: {
        findMany: (input: { where: unknown }) => {
          where = input.where;
          return Promise.resolve([]);
        },
      },
    } as unknown as PrismaClient;

    await new JobCategoryService(prisma).list('organisation-a');

    expect(where).toEqual({
      status: 'ACTIVE',
      OR: [{ organisationId: null }, { organisationId: 'organisation-a' }],
    });
  });

  it('cannot archive a system or another organisation category', async () => {
    const prisma = {
      jobCategory: { findFirst: () => Promise.resolve(null) },
    } as unknown as PrismaClient;

    await expect(
      new JobCategoryService(prisma).archive(
        'organisation-a',
        '10000000-0000-4000-8000-000000000001',
        'user-a',
        'correlation-a',
      ),
    ).rejects.toMatchObject({ code: 'JOB_CATEGORY_NOT_FOUND', status: 404 });
  });

  it('updates nullable Job fields and records the change atomically', async () => {
    let update: unknown;
    let audit: unknown;
    const transaction = {
      visit: {
        update: (input: unknown) => {
          update = input;
          return Promise.resolve({ id: 'visit-a', title: 'Repair distribution board' });
        },
      },
      auditEvent: {
        create: (input: unknown) => {
          audit = input;
          return Promise.resolve({ id: 'audit-a' });
        },
      },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      visit: {
        findFirst: () =>
          Promise.resolve({
            id: 'visit-a',
            scheduledStart: new Date('2026-09-01T08:00:00.000Z'),
            scheduledEnd: null,
          }),
      },
      jobCategory: {
        findFirst: (input: { where: unknown }) => {
          expect(input.where).toEqual({
            id: 'category-a',
            status: 'ACTIVE',
            OR: [{ organisationId: null }, { organisationId: 'organisation-a' }],
          });
          return Promise.resolve({ id: 'category-a' });
        },
      },
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    await new VisitService(prisma).update('organisation-a', 'visit-a', 'user-a', 'correlation-a', {
      title: 'Repair distribution board',
      description: 'Replace the damaged main board.',
      exclusions: null,
      jobCategoryId: 'category-a',
    });

    expect(update).toEqual({
      where: { id: 'visit-a' },
      data: {
        title: 'Repair distribution board',
        description: 'Replace the damaged main board.',
        exclusions: null,
        jobCategoryId: 'category-a',
      },
    });
    expect(audit).toMatchObject({
      data: {
        organisationId: 'organisation-a',
        actorUserId: 'user-a',
        eventType: 'VisitUpdated',
        entityId: 'visit-a',
      },
    });
  });
});
