import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { InspectionService } from '../src/inspections/inspection.service';
import { PortfolioService } from '../src/portfolio/portfolio.service';

describe('Job activity', () => {
  it('builds a Visit timeline that includes related inspection and asset events with the actor', async () => {
    let query!: { where: unknown; include: unknown; orderBy: unknown };
    const prisma = {
      visit: {
        findFirst: () =>
          Promise.resolve({
            inspections: [{ id: 'inspection-a' }],
            tasks: [{ assetId: 'asset-a' }, { assetId: null }],
          }),
      },
      auditEvent: {
        findMany: (input: typeof query) => {
          query = input;
          return Promise.resolve([]);
        },
      },
    } as unknown as PrismaClient;

    await new PortfolioService(prisma).timeline('organisation-a', 'Visit', 'visit-a');

    expect(query.where).toEqual({
      organisationId: 'organisation-a',
      OR: [
        { entityType: 'Visit', entityId: 'visit-a' },
        { entityType: 'Inspection', entityId: 'inspection-a' },
        { entityType: 'Asset', entityId: 'asset-a' },
      ],
    });
    expect(query.include).toEqual({
      actor: { select: { displayName: true, email: true } },
    });
    expect(query.orderBy).toEqual({ occurredAt: 'desc' });
  });

  it('keeps the exact filter for a non-Visit entity', async () => {
    let query!: { where: unknown };
    const prisma = {
      auditEvent: {
        findMany: (input: { where: unknown }) => {
          query = input;
          return Promise.resolve([]);
        },
      },
    } as unknown as PrismaClient;

    await new PortfolioService(prisma).timeline('organisation-a', 'Asset', 'asset-a');

    expect(query.where).toEqual({
      organisationId: 'organisation-a',
      entityType: 'Asset',
      entityId: 'asset-a',
    });
  });

  it('returns an empty timeline for an unknown Visit', async () => {
    const prisma = {
      visit: { findFirst: () => Promise.resolve(null) },
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).timeline('organisation-a', 'Visit', 'missing-visit'),
    ).resolves.toEqual([]);
  });

  it('lists the current certificate per approved inspection with inspection context', async () => {
    let query!: { where: unknown; include: unknown };
    const findMany = vi.fn((input: { where: unknown; include: unknown }) => {
      query = input;
      return Promise.resolve([
        {
          id: 'inspection-a',
          moduleKey: 'generic',
          inspectionType: 'ELECTRICAL',
          status: 'APPROVED',
          asset: { id: 'asset-a', displayName: 'Pump 1', assetReference: 'A-001' },
          site: { name: 'Site A' },
          revisions: [
            {
              id: 'revision-a',
              revisionNumber: 2,
              documents: [
                {
                  id: 'document-a',
                  entityType: 'Asset',
                  entityId: 'asset-a',
                  title: 'Inspection Report — Pump 1',
                  category: 'Inspection Report',
                  createdAt: new Date('2026-08-20T10:00:00.000Z'),
                },
              ],
            },
          ],
        },
        {
          id: 'inspection-b',
          moduleKey: 'thermal-imaging',
          inspectionType: 'THERMAL',
          status: 'APPROVED',
          asset: null,
          site: { name: 'Site A' },
          revisions: [{ id: 'revision-b', revisionNumber: 1, documents: [] }],
        },
      ]);
    });
    const prisma = {
      visit: { findFirst: () => Promise.resolve({ id: 'visit-a' }) },
      inspection: { findMany },
    } as unknown as PrismaClient;

    const documents = await new InspectionService(prisma).listDocuments(
      'organisation-a',
      'visit-a',
    );

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      id: 'document-a',
      title: 'Inspection Report — Pump 1',
      inspection: {
        id: 'inspection-a',
        moduleKey: 'generic',
        status: 'APPROVED',
        revisionNumber: 2,
        asset: { id: 'asset-a', displayName: 'Pump 1', assetReference: 'A-001' },
        siteName: 'Site A',
      },
    });
    expect(query).toEqual({
      where: { organisationId: 'organisation-a', visitId: 'visit-a', status: 'APPROVED' },
      include: {
        asset: { select: { id: true, displayName: true, assetReference: true } },
        site: { select: { name: true } },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            revisionNumber: true,
            documents: {
              where: { status: { not: 'ARCHIVED' } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
  });

  it('rejects listing documents for an unknown job', async () => {
    const prisma = {
      visit: { findFirst: () => Promise.resolve(null) },
    } as unknown as PrismaClient;

    await expect(
      new InspectionService(prisma).listDocuments('organisation-a', 'missing-visit'),
    ).rejects.toMatchObject({ code: 'VISIT_NOT_FOUND', status: 404 });
  });
});
