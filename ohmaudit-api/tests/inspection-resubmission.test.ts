import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { InspectionService } from '../src/inspections/inspection.service';

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
    const transaction = {
      inspectionRevision: { create: vi.fn().mockResolvedValue({ id: 'revision-a' }) },
      defect: { deleteMany, createMany },
      inspection: { update: vi.fn() },
      auditEvent: { create: vi.fn() },
    };
    const prisma = {
      inspection: { findFirst: vi.fn().mockResolvedValue(inspectionRecord()) },
      media: { findMany: vi.fn().mockResolvedValue([]) },
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
            severity: 'MAJOR',
            photoMediaIds: ['media-a'],
          },
        ],
      },
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: { organisationId: 'organisation-a', inspectionId: 'inspection-a' },
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      createMany.mock.invocationCallOrder[0]!,
    );
  });

  it('returns one copy of an identical legacy defect without deleting historical rows', async () => {
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

    expect(detail.defects).toHaveLength(1);
    expect(detail.defects[0]?.id).toBe('defect-a');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
  });
});
