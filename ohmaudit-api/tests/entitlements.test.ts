import { describe, expect, it } from 'vitest';
import { EntitlementService } from '../src/entitlements/entitlement.service';
import type { PrismaClient } from '../src/generated/prisma/client';

describe('EntitlementService', () => {
  it('allows active trials and expires them at the authoritative clock boundary', async () => {
    const trialEndsAt = new Date('2026-09-12T00:00:00.000Z');
    const prisma = {
      moduleDefinition: {
        findMany: () =>
          Promise.resolve([
            {
              key: 'ev-charging',
              name: 'EV Charging',
              description: 'EV',
              capabilities: ['ev.inspections.perform'],
              entitlements: [
                {
                  status: 'TRIAL',
                  trialEndsAt,
                  currentPeriodEndsAt: null,
                },
              ],
            },
          ]),
      },
    } as unknown as PrismaClient;
    const service = new EntitlementService(prisma);
    expect((await service.list('org-a', new Date('2026-08-20T00:00:00.000Z')))[0]?.entitled).toBe(
      true,
    );
    expect((await service.list('org-a', trialEndsAt))[0]).toMatchObject({
      status: 'EXPIRED',
      entitled: false,
    });
  });

  it('lists unsubscribed modules and honours active subscription end dates', async () => {
    const currentPeriodEndsAt = new Date('2026-08-31T23:59:59.000Z');
    const prisma = {
      moduleDefinition: {
        findMany: () =>
          Promise.resolve([
            {
              key: 'thermal-imaging',
              name: 'Thermal Imaging',
              description: 'Thermal',
              capabilities: ['thermal.inspections.perform'],
              entitlements: [],
            },
            {
              key: 'ev-charging',
              name: 'EV Charging',
              description: 'EV',
              capabilities: ['ev.inspections.perform'],
              entitlements: [
                { status: 'ACTIVE', trialEndsAt: null, currentPeriodEndsAt },
              ],
            },
          ]),
      },
    } as unknown as PrismaClient;
    const service = new EntitlementService(prisma);
    expect(await service.list('org-a', new Date('2026-08-23T00:00:00.000Z'))).toMatchObject([
      { module: { key: 'thermal-imaging' }, status: 'CANCELLED', entitled: false },
      { module: { key: 'ev-charging' }, status: 'ACTIVE', entitled: true },
    ]);
    expect((await service.list('org-a', currentPeriodEndsAt))[1]).toMatchObject({
      status: 'EXPIRED',
      entitled: false,
    });
  });
});
