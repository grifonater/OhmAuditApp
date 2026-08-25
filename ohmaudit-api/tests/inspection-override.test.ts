/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { InspectionService } from '../src/inspections/inspection.service';

describe('administrator inspection corrections', () => {
  it('creates an audited revision without replacing the engineer submission', async () => {
    const revisionCreate = vi.fn().mockResolvedValue({ id: 'revision-2', revisionNumber: 2 });
    const inspectionUpdate = vi.fn();
    const auditCreate = vi.fn();
    const transaction = {
      inspectionRevision: { create: revisionCreate },
      defect: { update: vi.fn() },
      inspection: { update: inspectionUpdate },
      auditEvent: { create: auditCreate },
    };
    const prisma = {
      inspection: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'inspection-a',
          organisationId: 'organisation-a',
          assetId: null,
          status: 'SUBMITTED',
          currentRevisionNumber: 1,
          revisions: [
            {
              id: 'revision-1',
              revisionNumber: 1,
              data: { outcome: 'FAIL' },
              validation: { valid: true },
              snapshots: { asset: { serialNumber: 'SERIAL-1' } },
              signatures: [
                {
                  signerName: 'Engineer One',
                  signerRole: 'Engineer',
                  signatureData: 'signed',
                  signedAt: new Date('2026-08-20T10:00:00Z'),
                },
              ],
              documents: [],
              evData: null,
            },
          ],
          defects: [],
          proposedAssetChanges: [],
          customer: {},
          site: {},
          asset: null,
          visit: null,
          visitTask: null,
        }),
      },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await new InspectionService(prisma).overrideSubmission(
      'organisation-a',
      'inspection-a',
      'administrator-a',
      'correlation-a',
      { reason: 'Engineer selected the wrong overall result.', data: { outcome: 'PASS' } },
    );

    expect(revisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organisationId: 'organisation-a',
        inspectionId: 'inspection-a',
        revisionNumber: 2,
        data: { outcome: 'PASS' },
        createdByUserId: 'administrator-a',
        signatures: {
          create: [
            expect.objectContaining({
              signerName: 'Engineer One',
              signatureData: 'signed',
            }),
          ],
        },
        validation: expect.objectContaining({
          administratorOverride: expect.objectContaining({
            reason: 'Engineer selected the wrong overall result.',
            previousRevisionNumber: 1,
          }),
        }),
      }),
    });
    expect(inspectionUpdate).toHaveBeenCalledWith({
      where: { id: 'inspection-a' },
      data: { status: 'UNDER_REVIEW', currentRevisionNumber: 2 },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'InspectionSubmissionOverridden',
        entityId: 'inspection-a',
      }),
    });
  });
});
