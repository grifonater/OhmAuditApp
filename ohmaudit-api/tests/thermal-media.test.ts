import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { bulkMediaUpdateInput } from '../src/app';
import { PortfolioService } from '../src/portfolio/portfolio.service';

describe('Thermal inspection media isolation', () => {
  it('registers evidence only after the inspection is found in the active organisation', async () => {
    let inspectionWhere: unknown;
    let createdData: unknown;
    const prisma = {
      inspection: {
        findFirst: (input: { where: unknown }) => {
          inspectionWhere = input.where;
          return Promise.resolve({ id: 'inspection-a' });
        },
      },
      media: {
        create: (input: { data: unknown }) => {
          createdData = input.data;
          return Promise.resolve({ id: 'media-a' });
        },
      },
    } as unknown as PrismaClient;

    await new PortfolioService(prisma).registerMedia('organisation-a', 'engineer-a', {
      entityType: 'Inspection',
      entityId: 'inspection-a',
      category: 'thermal-image',
      mimeType: 'image/jpeg',
      size: 1024,
    });

    expect(inspectionWhere).toEqual({ id: 'inspection-a', organisationId: 'organisation-a' });
    expect(createdData).toMatchObject({
      organisationId: 'organisation-a',
      entityType: 'Inspection',
      entityId: 'inspection-a',
      category: 'thermal-image',
      capturedByUserId: 'engineer-a',
    });
  });

  it('does not create media for an inspection outside the active organisation', async () => {
    let createCalled = false;
    const prisma = {
      inspection: { findFirst: () => Promise.resolve(null) },
      media: {
        create: () => {
          createCalled = true;
          return Promise.resolve({});
        },
      },
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).registerMedia('organisation-b', 'engineer-b', {
        entityType: 'Inspection',
        entityId: 'inspection-a',
        category: 'thermal-image',
        mimeType: 'image/jpeg',
        size: 1024,
      }),
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND', status: 404 });
    expect(createCalled).toBe(false);
  });

  it('updates gallery classification and metadata only for inspection media in the organisation', async () => {
    let updatedData: unknown;
    const prisma = {
      media: {
        findFirst: () =>
          Promise.resolve({
            id: 'media-a',
            organisationId: 'organisation-a',
            entityType: 'Inspection',
          }),
        update: (input: { data: Record<string, unknown> }) => {
          updatedData = input.data;
          return Promise.resolve({ id: 'media-a', ...input.data });
        },
      },
    } as unknown as PrismaClient;

    await new PortfolioService(prisma).updateInspectionMedia('organisation-a', 'media-a', {
      category: 'standard-image',
      caption: 'DB-01 visible image',
      tags: ['DB-01', 'plant room'],
      sortOrder: 4,
    });

    expect(updatedData).toEqual({
      category: 'standard-image',
      caption: 'DB-01 visible image',
      tags: ['DB-01', 'plant room'],
      sortOrder: 4,
    });
  });

  it('prevalidates the full scoped batch and returns updated media in request order', async () => {
    const media = [
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', caption: 'Second' },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', caption: 'First' },
    ];
    const findMany = vi.fn().mockResolvedValueOnce(media).mockResolvedValueOnce(media);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = { media: { findMany, updateMany } };
    const prisma = {
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    const result = await new PortfolioService(prisma).bulkUpdateInspectionMedia(
      'organisation-a',
      'inspection-a',
      [
        { mediaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', caption: 'First' },
        { mediaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', caption: 'Second' },
      ],
      true,
    );

    expect(findMany.mock.calls[0]?.[0]).toEqual({
      where: {
        organisationId: 'organisation-a',
        entityType: 'Inspection',
        entityId: 'inspection-a',
        id: {
          in: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
        },
        status: 'AVAILABLE',
      },
    });
    expect(result.map(({ id }) => id)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });

  it('does not update any row when bulk prevalidation finds an out-of-scope media ID', async () => {
    const updateMany = vi.fn();
    const transaction = {
      media: { findMany: vi.fn().mockResolvedValue([{ id: 'media-a' }]), updateMany },
    };
    const prisma = {
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).bulkUpdateInspectionMedia('organisation-a', 'inspection-a', [
        { mediaId: 'media-a', caption: 'Allowed' },
        { mediaId: 'media-b', caption: 'Other inspection' },
      ]),
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND', status: 404 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('requires unique media IDs and metadata for every bulk update', () => {
    const mediaId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(
      bulkMediaUpdateInput.safeParse({ updates: [{ mediaId, caption: 'One' }, { mediaId }] })
        .success,
    ).toBe(false);
    expect(
      bulkMediaUpdateInput.safeParse({
        updates: [
          { mediaId, caption: 'One' },
          { mediaId, sortOrder: 2 },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts 500 bulk updates and rejects 501', () => {
    const updates = Array.from({ length: 501 }, (_, index) => ({
      mediaId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
      sortOrder: index,
    }));

    expect(bulkMediaUpdateInput.safeParse({ updates: updates.slice(0, 500) }).success).toBe(true);
    expect(bulkMediaUpdateInput.safeParse({ updates }).success).toBe(false);
  });
});
