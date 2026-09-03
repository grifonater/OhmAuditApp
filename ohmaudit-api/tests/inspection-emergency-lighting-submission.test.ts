/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { InspectionService } from '../src/inspections/inspection.service';

const submission = {
  data: { outcome: 'FAIL', fittingCount: 999, passedCount: 0 },
  validation: { allFittingsRecorded: false, resultSource: 'client' },
  signature: { signerName: 'Engineer', signerRole: 'Engineer', signatureData: 'typed' },
  defects: [],
};

const fittingResult = (
  fittingId: string,
  testType: 'FUNCTIONAL' | 'DURATION',
  outcome: 'PASS' | 'FAIL' | 'NOT_TESTED' = 'PASS',
  durationMinutes: number | null = null,
) => ({
  fittingId,
  testType,
  outcome,
  durationMinutes,
  notes: null,
  isOverride: false,
  snapshot: { reference: fittingId },
  fitting: { reference: fittingId },
});

function serviceFixture(
  inspectionType: string,
  activeFittingIds: string[],
  results: ReturnType<typeof fittingResult>[],
) {
  const inspectionRevisionCreate = vi.fn().mockResolvedValue({ id: 'revision-a' });
  const draftDeleteMany = vi.fn().mockResolvedValue({ count: results.length });
  const resultCreateMany = vi.fn().mockResolvedValue({ count: results.length });
  const transaction = {
    inspectionRevision: { create: inspectionRevisionCreate },
    emergencyLightingFittingResult: {
      findMany: vi.fn().mockResolvedValue(results),
      createMany: resultCreateMany,
      deleteMany: draftDeleteMany,
    },
    defect: { deleteMany: vi.fn(), createMany: vi.fn() },
    inspection: { update: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  const prisma = {
    inspection: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'inspection-a',
        organisationId: 'organisation-a',
        assetId: 'asset-a',
        visitId: null,
        visitTaskId: null,
        moduleKey: 'emergency-lighting',
        inspectionType,
        status: 'IN_PROGRESS',
        currentRevisionNumber: 0,
        revisions: [],
        defects: [],
        proposedAssetChanges: [],
        customer: { id: 'customer-a' },
        site: { id: 'site-a' },
        asset: { id: 'asset-a', status: 'ACTIVE' },
        visit: null,
        visitTask: null,
      }),
    },
    emergencyLightingFittingResult: { findMany: vi.fn().mockResolvedValue(results) },
    emergencyLightingFitting: {
      findMany: vi.fn().mockResolvedValue(activeFittingIds.map((id) => ({ id }))),
    },
    organisationBrandProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
      Promise.resolve(operation(transaction)),
    ),
  } as unknown as PrismaClient;

  return {
    service: new InspectionService(prisma),
    inspectionRevisionCreate,
    resultCreateMany,
    draftDeleteMany,
  };
}

async function submit(service: InspectionService) {
  return service.submit(
    'organisation-a',
    'inspection-a',
    'engineer-a',
    'correlation-a',
    submission,
  );
}

describe('emergency lighting inspection submission validation', () => {
  it('rejects a submission with no result for an active fitting', async () => {
    const { service, inspectionRevisionCreate } = serviceFixture(
      'Monthly functional test',
      ['fitting-a', 'fitting-b'],
      [fittingResult('fitting-a', 'FUNCTIONAL')],
    );

    await expect(submit(service)).rejects.toMatchObject({
      code: 'EMERGENCY_LIGHTING_RESULTS_INCOMPLETE',
      status: 422,
    });
    expect(inspectionRevisionCreate).not.toHaveBeenCalled();
  });

  it('rejects fitting results whose test type does not match the inspection', async () => {
    const { service, inspectionRevisionCreate } = serviceFixture(
      'Monthly functional test',
      ['fitting-a'],
      [fittingResult('fitting-a', 'DURATION', 'PASS', 180)],
    );

    await expect(submit(service)).rejects.toMatchObject({
      code: 'EMERGENCY_LIGHTING_TEST_TYPE_INVALID',
      status: 422,
    });
    expect(inspectionRevisionCreate).not.toHaveBeenCalled();
  });

  it('rejects a duration-tested result without an achieved duration', async () => {
    const { service, inspectionRevisionCreate } = serviceFixture(
      'Annual duration test',
      ['fitting-a'],
      [fittingResult('fitting-a', 'DURATION')],
    );

    await expect(submit(service)).rejects.toMatchObject({
      code: 'EMERGENCY_LIGHTING_DURATION_REQUIRED',
      status: 422,
    });
    expect(inspectionRevisionCreate).not.toHaveBeenCalled();
  });

  it('stores server-derived aggregates for a complete valid submission', async () => {
    const results = [
      fittingResult('fitting-a', 'FUNCTIONAL'),
      fittingResult('fitting-b', 'FUNCTIONAL', 'NOT_TESTED'),
    ];
    const { service, inspectionRevisionCreate } = serviceFixture(
      'Monthly functional test',
      ['fitting-a', 'fitting-b'],
      results,
    );

    await submit(service);

    expect(inspectionRevisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: expect.objectContaining({
          outcome: 'PASS',
          fittingCount: 2,
          passedCount: 1,
          failedCount: 0,
          notTestedCount: 1,
          fittingResults: [
            {
              fittingId: 'fitting-a',
              outcome: 'PASS',
              testType: 'FUNCTIONAL',
              durationMinutes: null,
              notes: null,
              snapshot: { reference: 'fitting-a' },
            },
            {
              fittingId: 'fitting-b',
              outcome: 'NOT_TESTED',
              testType: 'FUNCTIONAL',
              durationMinutes: null,
              notes: null,
              snapshot: { reference: 'fitting-b' },
            },
          ],
        }),
        validation: expect.objectContaining({
          allFittingsRecorded: true,
          resultSource: 'server',
        }),
      }),
    });
  });

  it('copies draft results into the revision and clears the draft store to prevent re-submit duplication', async () => {
    const results = [
      fittingResult('fitting-a', 'FUNCTIONAL'),
      fittingResult('fitting-b', 'FUNCTIONAL'),
    ];
    const { service, resultCreateMany, draftDeleteMany } = serviceFixture(
      'Monthly functional test',
      ['fitting-a', 'fitting-b'],
      results,
    );

    await submit(service);

    expect(resultCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ fittingId: 'fitting-a', inspectionRevisionId: 'revision-a' }),
        expect.objectContaining({ fittingId: 'fitting-b', inspectionRevisionId: 'revision-a' }),
      ]),
    });
    expect(draftDeleteMany).toHaveBeenCalledWith({
      where: { organisationId: 'organisation-a', inspectionId: 'inspection-a' },
    });
  });

  it('does not copy or clear draft results when there are none to submit', async () => {
    const { service, resultCreateMany, draftDeleteMany } = serviceFixture(
      'Monthly functional test',
      [],
      [],
    );

    await submit(service);

    expect(resultCreateMany).not.toHaveBeenCalled();
    expect(draftDeleteMany).not.toHaveBeenCalled();
  });
});
