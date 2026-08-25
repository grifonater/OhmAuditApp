import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { EvService } from '../src/modules/ev/ev.service';

function prismaWithCharger(): PrismaClient {
  return {
    asset: {
      findFirst: () =>
        Promise.resolve({
          id: 'asset-a',
          evChargePoint: {
            id: 'charger-a',
            supplies: [{ id: 'supply-a' }],
            connectors: [{ id: 'connector-a' }],
          },
        }),
    },
    media: { findMany: () => Promise.resolve([]) },
  } as unknown as PrismaClient;
}

describe('EV component management isolation', () => {
  it('will not delete a supply that does not belong to the selected charger', async () => {
    await expect(
      new EvService(prismaWithCharger()).deleteSupply(
        'organisation-a',
        'asset-a',
        'supply-from-another-charger',
      ),
    ).rejects.toMatchObject({ code: 'EV_SUPPLY_NOT_FOUND', status: 404 });
  });

  it('will not edit a connector that does not belong to the selected charger', async () => {
    await expect(
      new EvService(prismaWithCharger()).updateConnector(
        'organisation-a',
        'asset-a',
        'connector-from-another-charger',
        { label: 'Connector 1', connectorType: 'Type 2', supplyIds: [] },
      ),
    ).rejects.toMatchObject({ code: 'EV_CONNECTOR_NOT_FOUND', status: 404 });
  });
});
