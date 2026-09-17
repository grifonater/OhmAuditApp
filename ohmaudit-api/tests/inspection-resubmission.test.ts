/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { InspectionService } from '../src/inspections/inspection.service';

const mediaId = '20000000-0000-4000-8000-000000000001';
const findingId = '30000000-0000-4000-8000-000000000001';

const inspectionRecord = (defects: unknown[] = []) => ({
  id: 'inspection-a',
  organisationId: 'organisation-a',
  assetId: null,
  visitId: null,
  visitTaskId: null,
  moduleKey: 'thermal-imaging',
  status: 'IN_PROGRESS',
  currentRevisionNumber: 0,
  revisions: [],
  defects,
  proposedAssetChanges: [],
  customer: { id: 'customer-a' },
  site: { id: 'site-a' },
  asset: null,
  visit: null,
  visitTask: null,
});

describe('inspection resubmission consistency', () => {
  it('replaces the current defect set before storing the latest submission', async () => {
    const deleteMany = vi.fn();
    const createMany = vi.fn();
    const draftDeleteMany = vi.fn();
    const transaction = {
      inspectionRevision: { create: vi.fn().mockResolvedValue({ id: 'revision-a' }) },
      defect: { deleteMany, createMany },
      inspectionDraft: { deleteMany: draftDeleteMany },
      inspection: { update: vi.fn() },
      auditEvent: { create: vi.fn() },
    };
    const mediaFindMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: mediaId,
          entityType: 'Inspection',
          entityId: 'inspection-a',
          tags: [`finding:${findingId}`],
        },
      ]);
    const prisma = {
      inspection: { findFirst: vi.fn().mockResolvedValue(inspectionRecord()) },
      media: { findMany: mediaFindMany },
      organisationBrandProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await new InspectionService(prisma).submit(
      'organisation-a',
      'inspection-a',
      'engineer-a',
      'correlation-a',
      {
        data: { reportType: 'THERMAL_IMAGING', outcome: 'FAULTS_REPORTED' },
        validation: { valid: true },
        signature: { signerName: 'Engineer', signerRole: 'Engineer', signatureData: 'typed' },
        defects: [
          {
            title: 'Hot connection',
            description: 'DB-01 outgoing way',
            clientFindingId: findingId,
            severity: 'MAJOR',
            photoMediaIds: [mediaId],
          },
          {
            title: 'Monitor enclosure',
            category: 'CONDITION',
            severity: 'ADVISORY',
          },
        ],
      },
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: { organisationId: 'organisation-a', inspectionId: 'inspection-a' },
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          category: 'FAULT',
          photoMediaIds: [mediaId],
        }),
        expect.objectContaining({
          category: 'CONDITION',
        }),
      ]),
    });
    expect(transaction.inspectionRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        defectSnapshot: expect.arrayContaining([
          expect.objectContaining({
            title: 'Hot connection',
            category: 'FAULT',
            severity: 'MAJOR',
            status: 'OPEN',
            photoMediaIds: [mediaId],
          }),
          expect.objectContaining({ title: 'Monitor enclosure', category: 'CONDITION' }),
        ]),
      }),
    });
    expect(draftDeleteMany).toHaveBeenCalledWith({
      where: { organisationId: 'organisation-a', inspectionId: 'inspection-a' },
    });
    expect(deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      createMany.mock.invocationCallOrder[0]!,
    );
  });

  it('preserves identical findings as distinct records', async () => {
    const duplicate = {
      id: 'defect-a',
      assetId: null,
      title: 'Hot connection',
      description: 'DB-01 outgoing way',
      severity: 'MAJOR',
      status: 'OPEN',
      photoMediaIds: ['media-a'],
    };
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      inspection: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            inspectionRecord([
              duplicate,
              { ...duplicate, id: 'defect-b' },
              { ...duplicate, id: 'defect-c' },
            ]),
          ),
      },
      media: { findMany },
    } as unknown as PrismaClient;

    const detail = await new InspectionService(prisma).detail('organisation-a', 'inspection-a');

    expect(detail.defects.map(({ id }) => id)).toEqual(['defect-a', 'defect-b', 'defect-c']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
  });

  it('does not return unrelated asset fault evidence but includes explicitly referenced legacy media', async () => {
    const legacyMediaId = '40000000-0000-4000-8000-000000000001';
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      inspection: {
        findFirst: vi.fn().mockResolvedValue({
          ...inspectionRecord([
            {
              id: 'defect-a',
              assetId: 'asset-a',
              title: 'Legacy fault',
              description: null,
              category: 'FAULT',
              severity: 'MAJOR',
              status: 'OPEN',
              photoMediaIds: [legacyMediaId],
            },
          ]),
          assetId: 'asset-a',
        }),
      },
      media: { findMany },
    } as unknown as PrismaClient;

    await new InspectionService(prisma).detail('organisation-a', 'inspection-a');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ tags: { has: 'inspection:inspection-a' } }),
            { id: { in: [legacyMediaId] } },
          ]),
        }),
      }),
    );
    expect(findMany.mock.calls[0]?.[0]).not.toEqual(
      expect.objectContaining({ category: 'inspection-fault' }),
    );
  });

  it('rejects using the same photo for two findings before writing a revision', async () => {
    const revisionCreate = vi.fn();
    const prisma = {
      inspection: { findFirst: vi.fn().mockResolvedValue(inspectionRecord()) },
      media: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(),
      inspectionRevision: { create: revisionCreate },
    } as unknown as PrismaClient;

    await expect(
      new InspectionService(prisma).submit(
        'organisation-a',
        'inspection-a',
        'engineer-a',
        'correlation-a',
        {
          data: {},
          validation: {},
          signature: { signerName: 'Engineer', signerRole: 'Engineer', signatureData: 'typed' },
          defects: [
            { title: 'First fault', severity: 'MINOR', photoMediaIds: [mediaId] },
            { title: 'Second fault', severity: 'MAJOR', photoMediaIds: [mediaId] },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: 'DEFECT_MEDIA_CROSS_LINKED', status: 422 });
    expect(revisionCreate).not.toHaveBeenCalled();
  });

  it('rejects an available image owned by another inspection', async () => {
    const prisma = {
      inspection: { findFirst: vi.fn().mockResolvedValue(inspectionRecord()) },
      media: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: mediaId,
              entityType: 'Inspection',
              entityId: 'inspection-b',
              tags: [`finding:${findingId}`],
            },
          ]),
      },
    } as unknown as PrismaClient;

    await expect(
      new InspectionService(prisma).submit(
        'organisation-a',
        'inspection-a',
        'engineer-a',
        'correlation-a',
        {
          data: {},
          validation: {},
          signature: { signerName: 'Engineer', signerRole: 'Engineer', signatureData: 'typed' },
          defects: [
            {
              clientFindingId: findingId,
              title: 'Foreign evidence',
              severity: 'MAJOR',
              photoMediaIds: [mediaId],
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: 'DEFECT_MEDIA_INVALID', status: 422 });
  });
});
