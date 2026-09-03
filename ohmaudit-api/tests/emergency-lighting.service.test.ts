import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { EmergencyLightingService } from '../src/modules/emergency-lighting/emergency-lighting.service';

describe('Emergency lighting service', () => {
  it('tenant-scopes system detail and fitting media', async () => {
    const assetFindFirst = vi.fn().mockResolvedValue({
      id: 'asset-a',
      emergencyLightingSystem: { id: 'system-a' },
    });
    const prisma = {
      asset: { findFirst: assetFindFirst },
    } as unknown as PrismaClient;

    await new EmergencyLightingService(prisma).detail('organisation-a', 'asset-a');

    expect(assetFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'asset-a', organisationId: 'organisation-a' } }),
    );
  });

  it('rejects groups from another system before creating a fitting', async () => {
    const fittingCreate = vi.fn();
    const prisma = {
      emergencyLightingSystem: {
        findFirst: vi.fn().mockResolvedValue({ id: 'system-a' }),
      },
      emergencyLightingGroup: {
        findMany: vi.fn().mockResolvedValue([{ id: 'group-a' }]),
      },
      emergencyLightingFitting: { create: fittingCreate },
    } as unknown as PrismaClient;

    await expect(
      new EmergencyLightingService(prisma).createFitting('organisation-a', 'asset-a', {
        reference: 'EL-01',
        groupIds: ['group-a', 'group-from-another-system'],
      }),
    ).rejects.toMatchObject({ code: 'EMERGENCY_LIGHTING_GROUP_INVALID', status: 422 });
    expect(fittingCreate).not.toHaveBeenCalled();
  });

  it('bulk applies to selected fittings while preserving per-fitting overrides', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const transaction = {
      emergencyLightingFittingResult: {
        findMany: vi.fn().mockResolvedValue([{ fittingId: 'fitting-b', isOverride: true }]),
        upsert,
      },
    };
    const prisma = {
      inspection: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'inspection-a',
          assetId: 'asset-a',
          status: 'IN_PROGRESS',
          inspectionType: 'ANNUAL',
        }),
      },
      emergencyLightingSystem: {
        findFirst: vi.fn().mockResolvedValue({ id: 'system-a' }),
      },
      emergencyLightingFitting: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'fitting-a', reference: 'EL-01' },
          { id: 'fitting-b', reference: 'EL-02' },
        ]),
      },
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    const result = await new EmergencyLightingService(prisma).bulkApplyResults(
      'organisation-a',
      'inspection-a',
      {
        fittingIds: ['fitting-a', 'fitting-b'],
        outcome: 'PASS',
        testType: 'FUNCTIONAL',
      },
    );

    expect(result).toEqual({ applied: 1, preservedOverrides: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          inspectionId_fittingId: { inspectionId: 'inspection-a', fittingId: 'fitting-a' },
        },
      }),
    );
  });

  it('rejects an out-of-system fitting before bulk writes begin', async () => {
    const transaction = vi.fn();
    const prisma = {
      inspection: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'inspection-a',
          assetId: 'asset-a',
          status: 'IN_PROGRESS',
          inspectionType: 'ANNUAL',
        }),
      },
      emergencyLightingSystem: {
        findFirst: vi.fn().mockResolvedValue({ id: 'system-a' }),
      },
      emergencyLightingFitting: {
        findMany: vi.fn().mockResolvedValue([{ id: 'fitting-a' }]),
      },
      $transaction: transaction,
    } as unknown as PrismaClient;

    await expect(
      new EmergencyLightingService(prisma).bulkApplyResults('organisation-a', 'inspection-a', {
        fittingIds: ['fitting-a', 'fitting-other'],
        outcome: 'FAIL',
        testType: 'DURATION',
      }),
    ).rejects.toMatchObject({ code: 'EMERGENCY_LIGHTING_FITTING_INVALID', status: 422 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('surfaces guest-uploaded inspection evidence against the matching fitting', async () => {
    const mediaFindMany = vi.fn().mockResolvedValue([
      {
        id: 'media-a',
        entityType: 'EmergencyLightingFitting',
        entityId: 'fitting-a',
        tags: ['fault-evidence'],
      },
      {
        id: 'media-b',
        entityType: 'Inspection',
        entityId: 'inspection-a',
        tags: ['fault-evidence', 'fitting:fitting-a'],
      },
      {
        id: 'media-c',
        entityType: 'Inspection',
        entityId: 'inspection-b',
        tags: ['fault-evidence', 'fitting:fitting-c-elsewhere'],
      },
    ]);
    const prisma = {
      emergencyLightingSystem: {
        findFirst: vi.fn().mockResolvedValue({ id: 'system-a' }),
      },
      emergencyLightingFitting: {
        findMany: vi.fn().mockResolvedValue([{ id: 'fitting-a', reference: 'EL-01' }]),
        count: vi.fn().mockResolvedValue(1),
      },
      media: { findMany: mediaFindMany },
    } as unknown as PrismaClient;

    const result = await new EmergencyLightingService(prisma).listFittings(
      'organisation-a',
      'asset-a',
      { page: 1, pageSize: 50 },
    );

    expect(mediaFindMany).toHaveBeenLastCalledWith({
      where: {
        organisationId: 'organisation-a',
        status: 'AVAILABLE',
        OR: [
          {
            entityType: 'EmergencyLightingFitting',
            entityId: { in: ['fitting-a'] },
          },
          {
            entityType: 'Inspection',
            category: 'emergency-lighting-evidence',
            tags: { hasSome: ['fitting:fitting-a'] },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    const first = result.items[0];
    expect(first?.media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'media-a' }),
        expect.objectContaining({ id: 'media-b' }),
      ]),
    );
    expect(first?.media.map((entry) => entry.id)).toEqual(['media-a', 'media-b']);
  });
});
