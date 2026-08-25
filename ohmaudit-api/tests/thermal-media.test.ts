import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
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
});
