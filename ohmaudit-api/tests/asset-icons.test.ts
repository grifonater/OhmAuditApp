import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { assetInput } from '../src/app';
import { PortfolioService } from '../src/portfolio/portfolio.service';

const validAsset = {
  siteId: '9ff07224-d14a-4f13-a887-b7788171850e',
  assetType: 'EV Charger',
  assetReference: 'EV-1',
  displayName: 'Front charger',
};

describe('asset icon API', () => {
  it('accepts a finite icon override or null and rejects unknown keys', () => {
    expect(assetInput.parse({ ...validAsset, iconKey: 'solar-panel' }).iconKey).toBe('solar-panel');
    expect(assetInput.parse({ ...validAsset, iconKey: 'water-pump' }).iconKey).toBe('water-pump');
    expect(assetInput.parse({ ...validAsset, iconKey: null }).iconKey).toBeNull();
    expect(() => assetInput.parse({ ...validAsset, iconKey: 'uploaded-image' })).toThrow();
  });

  it('persists an icon override when creating an asset', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'asset-a', ...validAsset, iconKey: 'meter' });
    const transaction = {
      asset: { create },
      auditEvent: { create: vi.fn() },
    };
    const prisma = {
      site: {
        findFirst: vi.fn().mockResolvedValue({ id: validAsset.siteId, customerId: 'customer-a' }),
      },
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    } as unknown as PrismaClient;

    await new PortfolioService(prisma).createAsset('organisation-a', 'user-a', 'correlation-a', {
      ...validAsset,
      iconKey: 'meter',
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({ data: { iconKey: 'meter' } });
  });

  it('persists null to restore the type default on update', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'asset-a', iconKey: null });
    const transaction = {
      asset: { update },
      auditEvent: { create: vi.fn() },
    };
    const prisma = {
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'asset-a',
          assetType: 'EV Charger',
          manufacturer: null,
          model: null,
          assetModelId: null,
        }),
      },
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    } as unknown as PrismaClient;

    await new PortfolioService(prisma).updateAsset(
      'organisation-a',
      'asset-a',
      'user-a',
      'correlation-a',
      { iconKey: null },
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'asset-a' },
      data: { iconKey: null, assetModelId: null },
    });
  });
});
