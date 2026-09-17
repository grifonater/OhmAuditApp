/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { inspectionRevisionDefects } from '../src/app';
import { InspectionService } from '../src/inspections/inspection.service';

describe('administrator inspection corrections', () => {
  it('creates an audited revision without replacing the engineer submission', async () => {
    const revisionCreate = vi.fn().mockResolvedValue({ id: 'revision-2', revisionNumber: 2 });
    const inspectionUpdate = vi.fn();
    const auditCreate = vi.fn();
    const transaction = {
      inspectionRevision: { create: revisionCreate },
      defect: { create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
      inspection: { update: inspectionUpdate, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
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
      {
        reason: 'Engineer selected the wrong overall result.',
        expectedRevisionNumber: 1,
        data: { outcome: 'PASS' },
        defects: { upsert: [], remove: [] },
        generalPhotoMediaIds: [],
        media: [],
      },
    );

    expect(revisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organisationId: 'organisation-a',
        inspectionId: 'inspection-a',
        revisionNumber: 2,
        data: { outcome: 'PASS' },
        createdByUserId: 'administrator-a',
        defectSnapshot: [],
        validation: expect.objectContaining({
          administratorOverride: expect.objectContaining({
            reason: 'Engineer selected the wrong overall result.',
            previousRevisionNumber: 1,
          }),
        }),
      }),
    });
    const createdRevision = revisionCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createdRevision.data).not.toHaveProperty('signatures');
    expect(transaction.inspection.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'inspection-a',
        organisationId: 'organisation-a',
        currentRevisionNumber: 1,
        status: 'SUBMITTED',
      },
      data: { currentRevisionNumber: 2 },
    });
    expect(inspectionUpdate).toHaveBeenCalledWith({
      where: { id: 'inspection-a' },
      data: { status: 'UNDER_REVIEW' },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'InspectionSubmissionOverridden',
        entityId: 'inspection-a',
      }),
    });
  });

  it('keeps an approved inspection approved without running approval completion again', async () => {
    const inspectionUpdate = vi.fn();
    const mediaFindMany = vi.fn().mockResolvedValue([
      {
        id: 'photo-a',
        category: 'inspection-fault',
        caption: 'Fault photo',
      },
    ]);
    const transaction = {
      inspectionRevision: {
        create: vi.fn().mockResolvedValue({ id: 'revision-3', revisionNumber: 3 }),
      },
      defect: {
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn(),
      },
      inspection: { update: inspectionUpdate, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditEvent: { create: vi.fn() },
    };
    const prisma = {
      inspection: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'inspection-a',
          organisationId: 'organisation-a',
          assetId: null,
          visitId: 'visit-a',
          visitTaskId: 'task-a',
          moduleKey: 'ev-charging',
          status: 'APPROVED',
          currentRevisionNumber: 2,
          revisions: [
            {
              id: 'revision-2',
              revisionNumber: 2,
              data: { outcome: 'FAIL', notes: 'Old note' },
              validation: {},
              snapshots: {},
              signatures: [{ signerName: 'Engineer', signatureData: 'signed' }],
              documents: [],
              evData: null,
            },
          ],
          defects: [
            {
              id: 'defect-a',
              assetId: null,
              title: 'Wrong title',
              description: null,
              category: 'FAULT',
              severity: 'MAJOR',
              status: 'OPEN',
              photoMediaIds: ['photo-a'],
              resolvedAt: null,
            },
          ],
          proposedAssetChanges: [],
          customer: {},
          site: {},
          asset: null,
          visit: {},
          visitTask: {},
        }),
      },
      media: { findMany: mediaFindMany },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await new InspectionService(prisma).overrideSubmission(
      'organisation-a',
      'inspection-a',
      'administrator-a',
      'correlation-a',
      {
        reason: 'Correct classification and notes.',
        expectedRevisionNumber: 2,
        data: { outcome: 'PASS', notes: 'Corrected note' },
        defects: {
          upsert: [
            {
              id: 'defect-a',
              title: 'Correct title',
              category: 'ADVICE',
              severity: 'ADVISORY',
              status: 'ACKNOWLEDGED',
              photoMediaIds: ['photo-a'],
            },
          ],
          remove: [],
        },
        generalPhotoMediaIds: [],
        media: [{ mediaId: 'photo-a', caption: 'Fault photo' }],
      },
    );

    expect(inspectionUpdate).toHaveBeenCalledWith({
      where: { id: 'inspection-a' },
      data: { status: 'APPROVED' },
    });
    expect(transaction.inspectionRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        defectSnapshot: [
          expect.objectContaining({
            id: 'defect-a',
            title: 'Correct title',
            category: 'ADVICE',
            severity: 'ADVISORY',
            status: 'ACKNOWLEDGED',
            photoMediaIds: ['photo-a'],
          }),
        ],
      }),
    });
    expect(transaction).not.toHaveProperty('visitTask');

    mediaFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(
      new InspectionService(prisma).overrideSubmission(
        'organisation-a',
        'inspection-a',
        'administrator-a',
        'correlation-b',
        {
          reason: 'Attempt to attach cross-tenant media.',
          expectedRevisionNumber: 2,
          data: {},
          defects: {
            upsert: [
              {
                id: 'defect-a',
                title: 'Correct title',
                category: 'FAULT',
                severity: 'MAJOR',
                status: 'OPEN',
                photoMediaIds: ['other-tenant-photo'],
              },
            ],
            remove: [],
          },
          generalPhotoMediaIds: [],
          media: [{ mediaId: 'other-tenant-photo' }],
        },
      ),
    ).rejects.toMatchObject({ code: 'INSPECTION_MEDIA_INVALID', status: 422 });
  });

  it('rejects a stale expected revision before opening a transaction', async () => {
    const transaction = vi.fn();
    const prisma = {
      inspection: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'inspection-a',
          organisationId: 'organisation-a',
          assetId: null,
          status: 'APPROVED',
          currentRevisionNumber: 4,
          revisions: [],
          defects: [],
          proposedAssetChanges: [],
          customer: {},
          site: {},
          asset: null,
          visit: null,
          visitTask: null,
        }),
      },
      $transaction: transaction,
    } as unknown as PrismaClient;

    await expect(
      new InspectionService(prisma).overrideSubmission(
        'organisation-a',
        'inspection-a',
        'administrator-a',
        'correlation-a',
        {
          reason: 'Stale edit.',
          expectedRevisionNumber: 3,
          data: {},
          defects: { upsert: [], remove: [] },
          generalPhotoMediaIds: [],
          media: [],
        },
      ),
    ).rejects.toMatchObject({ code: 'INSPECTION_REVISION_CONFLICT', status: 409 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rolls back when another correction claims the expected revision first', async () => {
    const revisionCreate = vi.fn();
    const transaction = {
      inspection: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      inspectionRevision: { create: revisionCreate },
    };
    const prisma = {
      inspection: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'inspection-a',
          organisationId: 'organisation-a',
          assetId: null,
          moduleKey: 'core',
          status: 'UNDER_REVIEW',
          currentRevisionNumber: 2,
          revisions: [
            {
              id: 'revision-2',
              revisionNumber: 2,
              data: {},
              validation: {},
              snapshots: {},
              signatures: [],
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

    await expect(
      new InspectionService(prisma).overrideSubmission(
        'organisation-a',
        'inspection-a',
        'administrator-a',
        'correlation-a',
        {
          reason: 'Concurrent edit.',
          expectedRevisionNumber: 2,
          data: {},
          defects: { upsert: [], remove: [] },
          generalPhotoMediaIds: [],
          media: [],
        },
      ),
    ).rejects.toMatchObject({ code: 'INSPECTION_REVISION_CONFLICT', status: 409 });
    expect(revisionCreate).not.toHaveBeenCalled();
  });
});

describe('revision-scoped report defects', () => {
  it('uses an available revision snapshot instead of mutable current defects', () => {
    const current = [
      {
        id: 'defect-a',
        assetId: null,
        title: 'Current title',
        description: null,
        category: 'FAULT',
        severity: 'MAJOR',
        status: 'OPEN',
        photoMediaIds: [],
      },
    ];

    expect(
      inspectionRevisionDefects(
        [
          {
            id: 'defect-a',
            assetId: null,
            title: 'Revision title',
            description: 'As issued',
            category: 'ADVICE',
            severity: 'ADVISORY',
            status: 'ACKNOWLEDGED',
            photoMediaIds: ['photo-a'],
          },
        ],
        current,
      ),
    ).toEqual([
      expect.objectContaining({
        title: 'Revision title',
        description: 'As issued',
        category: 'ADVICE',
        photoMediaIds: ['photo-a'],
      }),
    ]);
    expect(inspectionRevisionDefects(null, current)).toBe(current);
  });
});
