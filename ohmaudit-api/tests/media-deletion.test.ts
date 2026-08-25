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
});
