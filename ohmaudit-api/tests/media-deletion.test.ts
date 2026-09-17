import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { PortfolioService } from '../src/portfolio/portfolio.service';

describe('portfolio media deletion', () => {
  it('is idempotent when concurrent logo cleanup already removed the media row', async () => {
    const customerUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const mediaDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const transaction = {
      customer: { updateMany: customerUpdateMany },
      media: { deleteMany: mediaDeleteMany },
    };
    const prisma = {
      media: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'media-a',
          organisationId: 'organisation-a',
          storageKey: 'logos/media-a.jpg',
        }),
      },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).deleteMedia('organisation-a', 'media-a'),
    ).resolves.toMatchObject({ id: 'media-a' });
    expect(customerUpdateMany).toHaveBeenCalledWith({
      where: { organisationId: 'organisation-a', logoMediaId: 'media-a' },
      data: { logoMediaId: null },
    });
    expect(mediaDeleteMany).toHaveBeenCalledWith({
      where: { id: 'media-a', organisationId: 'organisation-a' },
    });
  });

  it('deletes only exact inspection media or asset media carrying inspection provenance', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const defectUpdate = vi.fn().mockResolvedValue({});
    const defectFindMany = vi
      .fn()
      .mockResolvedValue([{ id: 'defect-a', photoMediaIds: ['media-a', 'media-b'] }]);
    const media = {
      id: 'media-a',
      organisationId: 'organisation-a',
      entityType: 'Asset',
      entityId: 'asset-a',
      tags: ['inspection:inspection-a'],
      storageKey: 'inspection/media-a.jpg',
    };
    const findFirst = vi.fn().mockResolvedValue(media);
    const transaction = {
      defect: { findMany: defectFindMany, update: defectUpdate },
      media: { deleteMany },
    };
    const prisma = {
      media: { findFirst },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).deleteInspectionMedia(
        'organisation-a',
        'inspection-a',
        'asset-a',
        'media-a',
      ),
    ).resolves.toBe(media);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'media-a',
        organisationId: 'organisation-a',
        OR: [
          { entityType: 'Inspection', entityId: 'inspection-a' },
          {
            entityType: 'Asset',
            entityId: 'asset-a',
            tags: { has: 'inspection:inspection-a' },
          },
        ],
      },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'media-a', organisationId: 'organisation-a' },
    });
    expect(defectUpdate).toHaveBeenCalledWith({
      where: { id: 'defect-a' },
      data: { photoMediaIds: ['media-b'] },
    });
  });

  it('does not delete unrelated historic asset media', async () => {
    const deleteMany = vi.fn();
    const prisma = {
      media: { findFirst: vi.fn().mockResolvedValue(null), deleteMany },
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).deleteInspectionMedia(
        'organisation-a',
        'inspection-a',
        'asset-a',
        'historic-media',
      ),
    ).rejects.toMatchObject({ code: 'INSPECTION_MEDIA_NOT_FOUND', status: 404 });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('protects media referenced by an immutable inspection revision', async () => {
    const mediaDeleteMany = vi.fn();
    const prisma = {
      media: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'media-a',
          organisationId: 'organisation-a',
          entityType: 'Inspection',
          entityId: 'inspection-a',
        }),
      },
      inspectionRevisionMedia: {
        findFirst: vi.fn().mockResolvedValue({ mediaId: 'media-a' }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).deleteInspectionMedia(
        'organisation-a',
        'inspection-a',
        null,
        'media-a',
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_HISTORY_PROTECTED', status: 409 });
    expect(mediaDeleteMany).not.toHaveBeenCalled();
  });
});
