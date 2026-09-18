import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { InspectionService } from '../src/inspections/inspection.service';

describe('inspection approval completion', () => {
  it('reports that the job can be completed when the final task is approved', async () => {
    const transaction = {
      inspection: { update: vi.fn().mockResolvedValue({ id: 'inspection-a', status: 'APPROVED' }) },
      visitTask: { update: vi.fn(), count: vi.fn() },
      proposedAssetChange: { count: vi.fn().mockResolvedValue(0) },
      auditEvent: { create: vi.fn() },
    };
    transaction.visitTask.count.mockResolvedValue(0);
    const prisma = {
      inspection: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'inspection-a',
          organisationId: 'organisation-a',
          assetId: null,
          visitId: 'visit-a',
          visitTaskId: 'task-a',
          effectiveDate: null,
          status: 'SUBMITTED',
          currentRevisionNumber: 1,
          revisions: [{ revisionNumber: 1, documents: [], signatures: [], evData: null }],
          defects: [],
          proposedAssetChanges: [],
          customer: {},
          site: {},
          asset: null,
          visit: {},
          visitTask: {},
        }),
      },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    const result = await new InspectionService(prisma).review(
      'organisation-a',
      'inspection-a',
      'reviewer-a',
      'correlation',
      true,
    );

    expect(result).toMatchObject({ status: 'APPROVED', completionEligible: true });
  });
});
