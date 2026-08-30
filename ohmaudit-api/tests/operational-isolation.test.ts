import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { ScheduleService } from '../src/scheduling/schedule.service';
import { VisitService } from '../src/visits/visit.service';

const isolatedPrisma = {
  site: { findFirst: () => Promise.resolve(null) },
} as unknown as PrismaClient;

describe('operational tenant isolation', () => {
  it('cannot schedule an occurrence against another organisation site', async () => {
    await expect(
      new ScheduleService(isolatedPrisma).create('organisation-b', 'user-b', 'correlation', {
        siteId: 'site-from-a',
        title: 'Annual EV inspection',
        moduleKey: 'ev-charging',
        frequencyMonths: 12,
        startDate: new Date('2030-01-01'),
        notificationLeadDays: 30,
      }),
    ).rejects.toMatchObject({ code: 'SITE_NOT_FOUND', status: 404 });
  });

  it('cannot create a visit at another organisation site', async () => {
    await expect(
      new VisitService(isolatedPrisma).create('organisation-b', 'user-b', 'correlation', {
        siteId: 'site-from-a',
        title: 'Inspection visit',
        scheduledStart: new Date('2030-01-01'),
        tasks: [{ moduleKey: 'ev-charging', title: 'EV inspection' }],
      }),
    ).rejects.toMatchObject({ code: 'SITE_NOT_FOUND', status: 404 });
  });

  it('records an engineer-discovered charger as provisional until office approval', async () => {
    let createdAssetInput: unknown;
    const createAsset = vi.fn((input: unknown) => {
      createdAssetInput = input;
      return Promise.resolve({ id: 'asset-a' });
    });
    const transaction = {
      asset: { create: createAsset },
      visitTask: { create: vi.fn().mockResolvedValue({ id: 'task-a' }) },
      auditEvent: { create: vi.fn() },
    };
    const prisma = {
      visit: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'visit-a',
          customerId: 'customer-a',
          siteId: 'site-a',
          evDiscoveryEnabled: true,
          tasks: [],
        }),
      },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await new VisitService(prisma).addEvAsset(
      'organisation-a',
      'visit-a',
      'engineer-a',
      'correlation',
      {
        assetReference: 'EVCP 1',
        displayName: 'Front car park charger',
        dcRcdType: 'NONE',
      },
    );

    expect(createdAssetInput).toMatchObject({
      data: {
        siteId: 'site-a',
        assetReference: 'EVCP 1',
        status: 'PROPOSED',
      },
    });
  });

  it('rejects charger discovery when it is not enabled for the job', async () => {
    const prisma = {
      visit: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'visit-a',
          customerId: 'customer-a',
          siteId: 'site-a',
          evDiscoveryEnabled: false,
          tasks: [],
        }),
      },
    } as unknown as PrismaClient;

    await expect(
      new VisitService(prisma).addEvAsset(
        'organisation-a',
        'visit-a',
        'engineer-a',
        'correlation',
        {
          assetReference: 'EVCP 1',
          displayName: 'Front car park charger',
          dcRcdType: 'NONE',
        },
      ),
    ).rejects.toMatchObject({ code: 'EV_DISCOVERY_NOT_ENABLED', status: 403 });
  });
});
