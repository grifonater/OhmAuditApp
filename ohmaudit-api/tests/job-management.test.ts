import { describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { JobCategoryService } from '../src/jobs/job-category.service';
import { VisitService } from '../src/visits/visit.service';

describe('Job management', () => {
  it('excludes archived jobs from the default list', async () => {
    let findManyInput: unknown;
    let countInput: unknown;
    const prisma = {
      visit: {
        findMany: (input: unknown) => {
          findManyInput = input;
          return Promise.resolve([]);
        },
        count: (input: unknown) => {
          countInput = input;
          return Promise.resolve(0);
        },
      },
    } as unknown as PrismaClient;

    await new VisitService(prisma).list('organisation-a');

    expect(findManyInput).toMatchObject({
      where: { organisationId: 'organisation-a', archivedAt: null },
    });
    expect(countInput).toMatchObject({
      where: { organisationId: 'organisation-a', archivedAt: null },
    });
  });

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
      evDiscoveryEnabled: true,
    });

    expect(update).toEqual({
      where: { id: 'visit-a' },
      data: {
        title: 'Repair distribution board',
        description: 'Replace the damaged main board.',
        exclusions: null,
        jobCategoryId: 'category-a',
        evDiscoveryEnabled: true,
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

  it('rejects updates to archived jobs', async () => {
    const prisma = {
      visit: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'visit-a',
          archivedAt: new Date('2026-09-01T10:00:00.000Z'),
        }),
      },
    } as unknown as PrismaClient;

    await expect(
      new VisitService(prisma).update('organisation-a', 'visit-a', 'user-a', 'correlation-a', {
        title: 'Cannot change this',
      }),
    ).rejects.toMatchObject({ code: 'VISIT_ARCHIVED', status: 409 });
  });

  it('appends pending tasks in order and audits them atomically', async () => {
    const taskInputs: unknown[] = [];
    let auditInput: unknown;
    const transaction = {
      visit: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'visit-a',
          siteId: 'site-a',
          archivedAt: null,
          tasks: [{ assetId: null, moduleKey: 'core', displayOrder: 3 }],
        }),
      },
      asset: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'asset-ev', assetType: 'EV Charger' },
          { id: 'asset-board', assetType: 'Distribution Board' },
        ]),
      },
      visitTask: {
        create: (input: { data: { displayOrder: number } }) => {
          taskInputs.push(input);
          return Promise.resolve({ id: `task-${input.data.displayOrder}`, ...input.data });
        },
      },
      auditEvent: {
        create: (input: unknown) => {
          auditInput = input;
          return Promise.resolve({ id: 'audit-a' });
        },
      },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    const tasks = await new VisitService(prisma).addTasks(
      'organisation-a',
      'visit-a',
      'user-a',
      'correlation-a',
      [
        { assetId: 'asset-ev', moduleKey: 'ev-charging', title: 'Inspect charger' },
        { assetId: 'asset-board', moduleKey: 'core', title: 'Inspect board' },
      ],
    );

    expect(tasks).toHaveLength(2);
    expect(taskInputs).toMatchObject([
      { data: { displayOrder: 4, status: 'PENDING', assetId: 'asset-ev' } },
      { data: { displayOrder: 5, status: 'PENDING', assetId: 'asset-board' } },
    ]);
    expect(auditInput).toMatchObject({
      data: {
        eventType: 'VisitTasksAdded',
        entityId: 'visit-a',
        data: { taskIds: ['task-4', 'task-5'], taskCount: 2 },
      },
    });
  });

  it('rejects duplicate tasks in the input or already on the job', async () => {
    const transaction = {
      visit: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'visit-a',
          siteId: 'site-a',
          archivedAt: null,
          tasks: [{ assetId: null, moduleKey: 'core', displayOrder: 0 }],
        }),
      },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;
    const service = new VisitService(prisma);

    await expect(
      service.addTasks('organisation-a', 'visit-a', 'user-a', 'correlation-a', [
        { moduleKey: 'thermal-imaging', title: 'First scan' },
        { moduleKey: 'thermal-imaging', title: 'Second scan' },
      ]),
    ).rejects.toMatchObject({ code: 'VISIT_TASK_DUPLICATE', status: 409 });
    await expect(
      service.addTasks('organisation-a', 'visit-a', 'user-a', 'correlation-a', [
        { moduleKey: 'core', title: 'Existing site task' },
      ]),
    ).rejects.toMatchObject({ code: 'VISIT_TASK_DUPLICATE', status: 409 });
  });

  it('archives a job, revokes active guest links, and audits once', async () => {
    const archivedVisit = {
      id: 'visit-a',
      archivedAt: new Date('2026-09-01T11:00:00.000Z'),
    };
    let revocationInput:
      | {
          where: { visitId: string; revokedAt: null; expiresAt: { gt: Date } };
          data: { revokedAt: Date };
        }
      | undefined;
    let auditInput: unknown;
    const transaction = {
      visit: { update: vi.fn().mockResolvedValue(archivedVisit) },
      guestAccessToken: {
        updateMany: (input: NonNullable<typeof revocationInput>) => {
          revocationInput = input;
          return Promise.resolve({ count: 2 });
        },
      },
      auditEvent: {
        create: (input: unknown) => {
          auditInput = input;
          return Promise.resolve({ id: 'audit-a' });
        },
      },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      visit: { findFirst: vi.fn().mockResolvedValue({ id: 'visit-a', archivedAt: null }) },
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    const visit = await new VisitService(prisma).archive(
      'organisation-a',
      'visit-a',
      'user-a',
      'correlation-a',
    );

    expect(visit).toBe(archivedVisit);
    expect(revocationInput).toMatchObject({
      where: { visitId: 'visit-a', revokedAt: null },
    });
    expect(revocationInput?.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(revocationInput?.data.revokedAt).toBeInstanceOf(Date);
    expect(auditInput).toMatchObject({
      data: { eventType: 'VisitArchived', entityId: 'visit-a' },
    });
  });
});
