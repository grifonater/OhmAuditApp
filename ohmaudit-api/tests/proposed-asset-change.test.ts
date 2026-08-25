import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { InspectionService } from '../src/inspections/inspection.service';

describe('proposed EV asset changes', () => {
  it('creates rows for temporary engineer IDs without querying them as PostgreSQL UUIDs', async () => {
    const connectorFind = vi.fn();
    const connectorCreate = vi.fn().mockResolvedValue({ id: 'connector-created' });
    const transaction = {
      asset: { update: vi.fn() },
      evChargePoint: {
        upsert: vi.fn().mockResolvedValue({ id: '10000000-0000-4000-8000-000000000001' }),
      },
      evSupply: {
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: '20000000-0000-4000-8000-000000000002' }),
      },
      evConnector: { findFirst: connectorFind, create: connectorCreate, update: vi.fn() },
      proposedAssetChange: {
        update: vi.fn().mockResolvedValue({ id: 'change-a', status: 'APPLIED' }),
      },
      auditEvent: { create: vi.fn() },
    };
    const prisma = {
      proposedAssetChange: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'change-a',
          assetId: '30000000-0000-4000-8000-000000000003',
          status: 'PENDING',
          proposedData: {
            supplies: [
              {
                id: 'new-supply',
                label: 'Supply 1',
                phaseCount: 1,
              },
            ],
            connectors: [
              {
                id: 'new-connector',
                label: 'Connector 1',
                connectorType: 'Type 2',
                supplyIds: ['new-supply', 'new-supply-that-must-not-be-used'],
              },
            ],
          },
          asset: {
            evChargePoint: { supplies: [], connectors: [] },
          },
        }),
      },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await expect(
      new InspectionService(prisma).reviewProposedAssetChange(
        '40000000-0000-4000-8000-000000000004',
        '50000000-0000-4000-8000-000000000005',
        '60000000-0000-4000-8000-000000000006',
        'correlation',
        true,
      ),
    ).resolves.toMatchObject({ status: 'APPLIED' });

    expect(connectorFind).not.toHaveBeenCalled();
    expect(connectorCreate).toHaveBeenCalledWith({
      data: {
        organisationId: '40000000-0000-4000-8000-000000000004',
        chargePointId: '10000000-0000-4000-8000-000000000001',
        label: 'Connector 1',
        connectorType: 'Type 2',
        supplyMappings: {
          create: [{ supplyId: '20000000-0000-4000-8000-000000000002' }],
        },
      },
    });
  });

  it('matches temporary inspection rows to existing supplies and connectors instead of duplicating them', async () => {
    const supplyUpdate = vi.fn().mockResolvedValue({ id: 'supply-existing' });
    const supplyCreate = vi.fn();
    const connectorFind = vi.fn().mockResolvedValue({ id: 'connector-existing' });
    const connectorUpdate = vi.fn();
    const connectorCreate = vi.fn();
    const transaction = {
      asset: { update: vi.fn() },
      evChargePoint: { upsert: vi.fn().mockResolvedValue({ id: 'charger-a' }) },
      evSupply: { update: supplyUpdate, create: supplyCreate },
      evConnector: {
        findFirst: connectorFind,
        create: connectorCreate,
        update: connectorUpdate,
      },
      proposedAssetChange: {
        update: vi.fn().mockResolvedValue({ id: 'change-a', status: 'APPLIED' }),
      },
      auditEvent: { create: vi.fn() },
    };
    const prisma = {
      proposedAssetChange: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'change-a',
          assetId: 'asset-a',
          status: 'PENDING',
          proposedData: {
            supplies: [{ id: 'new-supply-copy', label: 'Supply 1', phaseCount: 1 }],
            connectors: [
              {
                id: 'new-connector-copy',
                label: 'Connector 1',
                connectorType: 'Type 2',
                supplyIds: ['new-supply-copy'],
              },
            ],
          },
          asset: {
            evChargePoint: {
              supplies: [{ id: 'supply-existing', label: 'Supply 1' }],
              connectors: [{ id: 'connector-existing', label: 'Connector 1' }],
            },
          },
        }),
      },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await new InspectionService(prisma).reviewProposedAssetChange(
      'organisation-a',
      'change-a',
      'reviewer-a',
      'correlation',
      true,
    );

    expect(supplyCreate).not.toHaveBeenCalled();
    expect(supplyUpdate).toHaveBeenCalledWith({
      where: { id: 'supply-existing' },
      data: { label: 'Supply 1', phaseCount: 1 },
    });
    expect(connectorCreate).not.toHaveBeenCalled();
    expect(connectorFind).toHaveBeenCalledWith({
      where: {
        id: 'connector-existing',
        chargePointId: 'charger-a',
        organisationId: 'organisation-a',
      },
    });
    expect(connectorUpdate).toHaveBeenCalledWith({
      where: { id: 'connector-existing' },
      data: {
        label: 'Connector 1',
        connectorType: 'Type 2',
        supplyMappings: {
          deleteMany: {},
          create: [{ supplyId: 'supply-existing' }],
        },
      },
    });
  });

  it('promotes an approved engineer-discovered charger into the site asset register', async () => {
    const assetUpdate = vi.fn().mockResolvedValue({ id: 'asset-a', status: 'ACTIVE' });
    const transaction = {
      asset: { update: assetUpdate },
      evChargePoint: { upsert: vi.fn().mockResolvedValue({ id: 'charger-a' }) },
      evSupply: { update: vi.fn(), create: vi.fn() },
      evConnector: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      proposedAssetChange: {
        update: vi.fn().mockResolvedValue({ id: 'change-a', status: 'APPLIED' }),
      },
      auditEvent: { create: vi.fn() },
    };
    const prisma = {
      proposedAssetChange: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'change-a',
          assetId: 'asset-a',
          status: 'PENDING',
          proposedData: {
            _operation: 'CREATE',
            asset: {
              assetReference: 'EVCP 1',
              displayName: 'Front car park charger',
              manufacturer: 'Acme',
              model: 'Rapid 22',
              serialNumber: 'SN-1',
            },
            chargePoint: { maximumPowerKw: 22, dcRcdType: 'TYPE_B' },
            supplies: [],
            connectors: [],
          },
          asset: { evChargePoint: { supplies: [], connectors: [] } },
        }),
      },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await new InspectionService(prisma).reviewProposedAssetChange(
      'organisation-a',
      'change-a',
      'reviewer-a',
      'correlation',
      true,
    );

    expect(assetUpdate).toHaveBeenCalledWith({
      where: { id: 'asset-a' },
      data: {
        assetReference: 'EVCP 1',
        displayName: 'Front car park charger',
        manufacturer: 'Acme',
        model: 'Rapid 22',
        serialNumber: 'SN-1',
        status: 'ACTIVE',
      },
    });
  });

  it('applies the administrator resolved values while preserving the engineer proposal', async () => {
    const assetUpdate = vi.fn();
    const auditCreate = vi.fn();
    const transaction = {
      asset: { update: assetUpdate },
      evChargePoint: { upsert: vi.fn().mockResolvedValue({ id: 'charger-a' }) },
      evSupply: { update: vi.fn(), create: vi.fn() },
      evConnector: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      proposedAssetChange: {
        update: vi.fn().mockResolvedValue({ id: 'change-a', status: 'APPLIED' }),
      },
      auditEvent: { create: auditCreate },
    };
    const prisma = {
      proposedAssetChange: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'change-a',
          assetId: 'asset-a',
          status: 'PENDING',
          proposedData: {
            asset: { manufacturer: 'Engineer value', model: 'Engineer model' },
            supplies: [],
            connectors: [],
          },
          asset: { evChargePoint: { supplies: [], connectors: [] } },
        }),
      },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;
    const resolvedData = {
      asset: { manufacturer: 'Administrator correction' },
      supplies: [],
      connectors: [],
    };

    await new InspectionService(prisma).reviewProposedAssetChange(
      'organisation-a',
      'change-a',
      'reviewer-a',
      'correlation',
      true,
      resolvedData,
    );

    expect(assetUpdate).toHaveBeenCalledWith({
      where: { id: 'asset-a' },
      data: { manufacturer: 'Administrator correction' },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      // Vitest asymmetric matchers intentionally expose an any-typed value.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        data: {
          proposedAssetChangeId: 'change-a',
          selectivelyResolved: true,
          resolvedData,
        },
      }),
    });
  });

  it('does not replace populated asset details or connector mappings with blank engineer values', async () => {
    const assetUpdate = vi.fn();
    const supplyUpdate = vi.fn().mockResolvedValue({ id: 'supply-a' });
    const connectorUpdate = vi.fn();
    const transaction = {
      asset: { update: assetUpdate },
      evChargePoint: { upsert: vi.fn().mockResolvedValue({ id: 'charger-a' }) },
      evSupply: { update: supplyUpdate, create: vi.fn() },
      evConnector: {
        findFirst: vi.fn().mockResolvedValue({ id: 'connector-a' }),
        create: vi.fn(),
        update: connectorUpdate,
      },
      proposedAssetChange: {
        update: vi.fn().mockResolvedValue({ id: 'change-a', status: 'APPLIED' }),
      },
      auditEvent: { create: vi.fn() },
    };
    const prisma = {
      proposedAssetChange: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'change-a',
          assetId: 'asset-a',
          status: 'PENDING',
          proposedData: {
            asset: { manufacturer: '   ', model: '' },
            chargePoint: { dcRcdType: '' },
            supplies: [{ id: 'supply-a', label: '', protectiveDeviceType: '' }],
            connectors: [{ id: 'connector-a', label: '', connectorType: '', supplyIds: [] }],
          },
          asset: {
            evChargePoint: {
              supplies: [{ id: 'supply-a' }],
              connectors: [{ id: 'connector-a' }],
            },
          },
        }),
      },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await new InspectionService(prisma).reviewProposedAssetChange(
      'organisation-a',
      'change-a',
      'reviewer-a',
      'correlation',
      true,
    );

    expect(assetUpdate).not.toHaveBeenCalled();
    expect(supplyUpdate).toHaveBeenCalledWith({ where: { id: 'supply-a' }, data: {} });
    expect(connectorUpdate).toHaveBeenCalledWith({
      where: { id: 'connector-a' },
      data: {},
    });
  });
});
