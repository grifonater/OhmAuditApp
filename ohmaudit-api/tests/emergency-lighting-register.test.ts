import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { EmergencyLightingService } from '../src/modules/emergency-lighting/emergency-lighting.service';

function systemPrisma(overrides: Record<string, unknown> = {}) {
  return {
    emergencyLightingSystem: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'system-a',
        locations: [],
        groups: [],
        keyswitches: [],
        fittingTypes: [],
        devices: [],
      }),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

describe('Emergency lighting fitting types', () => {
  it('creates a fitting type with trimmed name', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'ft-1', name: 'Bulkhead' });
    const service = new EmergencyLightingService(
      systemPrisma({ emergencyLightingFittingType: { create } }),
    );

    await service.createFittingType('org-a', 'asset-a', '  Bulkhead  ');

    expect(create).toHaveBeenCalledWith({
      data: { organisationId: 'org-a', systemId: 'system-a', name: 'Bulkhead' },
    });
  });

  it('rejects a duplicate fitting type name with 409', async () => {
    const err = new Error('unique') as unknown as { code: string };
    err.code = 'P2002';
    const service = new EmergencyLightingService(
      systemPrisma({
        emergencyLightingFittingType: { create: vi.fn().mockRejectedValue(err) },
      }),
    );

    await expect(service.createFittingType('org-a', 'asset-a', 'Bulkhead')).rejects.toMatchObject({
      code: 'EMERGENCY_LIGHTING_FITTING_TYPE_EXISTS',
      status: 409,
    });
  });

  it('deletes a fitting type only when it belongs to the system', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const service = new EmergencyLightingService(
      systemPrisma({ emergencyLightingFittingType: { deleteMany } }),
    );

    await expect(service.deleteFittingType('org-a', 'asset-a', 'ft-x')).rejects.toMatchObject({
      code: 'EMERGENCY_LIGHTING_FITTING_TYPE_NOT_FOUND',
      status: 404,
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'ft-x', organisationId: 'org-a', systemId: 'system-a' },
    });
  });
});

describe('Emergency lighting device register', () => {
  it('requires a non-blank make and model', async () => {
    const service = new EmergencyLightingService(systemPrisma({}));

    await expect(
      service.createDevice('org-a', 'asset-a', { make: '  ', model: 'X1' }),
    ).rejects.toMatchObject({ code: 'EMERGENCY_LIGHTING_DEVICE_INVALID', status: 422 });
  });

  it('maps a duplicate model to a 409 device-exists error', async () => {
    const err = new Error('unique') as unknown as { code: string };
    err.code = 'P2002';
    const service = new EmergencyLightingService(
      systemPrisma({
        emergencyLightingDevice: { create: vi.fn().mockRejectedValue(err) },
      }),
    );

    await expect(
      service.createDevice('org-a', 'asset-a', { make: 'Eaton', model: 'X1' }),
    ).rejects.toMatchObject({ code: 'EMERGENCY_LIGHTING_DEVICE_EXISTS', status: 409 });
  });

  it('blocks deleting a device that is in use by a fitting', async () => {
    const service = new EmergencyLightingService(
      systemPrisma({
        emergencyLightingDevice: {
          findFirst: vi.fn().mockResolvedValue({ id: 'device-a', make: 'Eaton', model: 'X1' }),
        },
        emergencyLightingFitting: { count: vi.fn().mockResolvedValue(3) },
      }),
    );

    await expect(service.deleteDevice('org-a', 'asset-a', 'device-a')).rejects.toMatchObject({
      code: 'EMERGENCY_LIGHTING_DEVICE_IN_USE',
      status: 409,
    });
  });
});

describe('Fitting to device linkage', () => {
  it('locks manufacturer/model and derives fitting type from the linked device', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'fitting-a' });
    const service = new EmergencyLightingService(
      systemPrisma({
        emergencyLightingDevice: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'device-a',
            make: 'Eaton',
            model: 'EPT-500',
            fittingType: { id: 'ft-1', name: 'Bulkhead' },
          }),
        },
        emergencyLightingFitting: { create },
      }),
    );

    await service.createFitting('org-a', 'asset-a', {
      reference: 'EL-01',
      deviceId: 'device-a',
      description: 'Lobby bulkhead',
    });

    const arg = create.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
    expect(arg?.data).toMatchObject({
      reference: 'EL-01',
      manufacturer: 'Eaton',
      model: 'EPT-500',
      fittingType: 'Bulkhead',
      device: { connect: { id: 'device-a' } },
    });
  });

  it('keeps manufacturer/model as free text when no device is linked', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'fitting-a' });
    const service = new EmergencyLightingService(
      systemPrisma({ emergencyLightingFitting: { create } }),
    );

    await service.createFitting('org-a', 'asset-a', {
      reference: 'EL-02',
      manufacturer: 'Unknown',
      model: 'Spare',
    });

    const arg = create.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
    expect(arg?.data).toMatchObject({
      reference: 'EL-02',
      manufacturer: 'Unknown',
      model: 'Spare',
    });
  });
});

describe('Fitting detail', () => {
  it('returns tenant-scoped asset context and normalized revision history', async () => {
    const service = new EmergencyLightingService(
      systemPrisma({
        asset: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'asset-a',
            assetReference: 'EL-SYS-1',
            displayName: 'Emergency lighting',
            customer: { id: 'customer-a', name: 'Customer A' },
            site: { id: 'site-a', name: 'Site A' },
          }),
        },
        media: { findMany: vi.fn().mockResolvedValue([]) },
        emergencyLightingFitting: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'fitting-a',
            reference: 'EL-001',
            location: null,
            groupMappings: [],
          }),
        },
        emergencyLightingKeyswitch: { findMany: vi.fn().mockResolvedValue([]) },
        emergencyLightingFittingResult: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'result-a',
              outcome: 'PASS',
              testType: 'DURATION',
              durationMinutes: 180,
              notes: null,
              isOverride: false,
              updatedAt: new Date('2026-09-01T10:00:00Z'),
              inspection: null,
              inspectionRevision: {
                revisionNumber: 2,
                createdAt: new Date('2026-09-02T10:00:00Z'),
                inspection: {
                  id: 'inspection-a',
                  inspectionType: 'ANNUAL',
                  status: 'APPROVED',
                  effectiveDate: new Date('2026-09-01T00:00:00Z'),
                  submittedAt: new Date('2026-09-01T10:00:00Z'),
                  approvedAt: new Date('2026-09-02T10:00:00Z'),
                },
              },
            },
          ]),
        },
      }),
    );

    const detail = await service.getFitting('org-a', 'asset-a', 'fitting-a');

    expect(detail.asset).toMatchObject({
      assetReference: 'EL-SYS-1',
      customer: { name: 'Customer A' },
      site: { name: 'Site A' },
    });
    expect(detail.testHistory[0]).toMatchObject({
      id: 'result-a',
      outcome: 'PASS',
      testType: 'DURATION',
      durationMinutes: 180,
      revisionNumber: 2,
      inspection: { id: 'inspection-a', status: 'APPROVED' },
    });
  });
});

describe('Emergency lighting Label Studio', () => {
  it('collects fittings from every emergency-lighting asset at the same site', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'asset-a',
        assetReference: 'EL-A',
        displayName: 'Block A emergency lighting',
        emergencyLightingSystem: {
          fittings: [{ id: 'fitting-a', reference: 'EL-001' }],
        },
      },
      {
        id: 'asset-b',
        assetReference: 'EL-B',
        displayName: 'Block B emergency lighting',
        emergencyLightingSystem: {
          fittings: [{ id: 'fitting-b', reference: 'EL-101' }],
        },
      },
    ]);
    const service = new EmergencyLightingService(
      systemPrisma({
        asset: {
          findFirst: vi.fn().mockResolvedValue({
            site: {
              id: 'site-a',
              name: 'Site A',
              customer: { id: 'customer-a', name: 'Customer A' },
              organisation: { id: 'org-a', name: 'Organisation A', brandProfile: null },
              emergencyLightingLabelSettings: null,
            },
          }),
          findMany,
        },
      }),
    );

    const result = await service.labelStudio('org-a', 'asset-a');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organisationId: 'org-a', siteId: 'site-a' } }),
    );
    expect(result.fittings.map((fitting) => [fitting.id, fitting.asset.id])).toEqual([
      ['fitting-a', 'asset-a'],
      ['fitting-b', 'asset-b'],
    ]);
  });

  it('saves label defaults against the site resolved from the tenant-scoped asset', async () => {
    const update = vi
      .fn()
      .mockResolvedValue({ emergencyLightingLabelSettings: { preset: 'L7160' } });
    const service = new EmergencyLightingService(
      systemPrisma({
        asset: { findFirst: vi.fn().mockResolvedValue({ siteId: 'site-a' }) },
        site: { update },
      }),
    );

    await service.saveLabelSettings('org-a', 'asset-a', { preset: 'L7160' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'site-a' },
      data: { emergencyLightingLabelSettings: { preset: 'L7160' } },
      select: { emergencyLightingLabelSettings: true },
    });
  });
});
