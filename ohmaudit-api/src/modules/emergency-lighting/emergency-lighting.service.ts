import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { DomainError } from '../../shared/domain-error';

function stripUndefined<T extends object>(input: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

export interface EmergencyLightingFittingInput {
  reference: string;
  locationId?: string | null | undefined;
  deviceId?: string | null | undefined;
  groupIds?: string[] | undefined;
  description?: string | undefined;
  fittingType?: string | undefined;
  operationMode?: string | undefined;
  manufacturer?: string | undefined;
  model?: string | undefined;
  serialNumber?: string | undefined;
  ratedDurationMinutes?: number | undefined;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | undefined;
  notes?: string | undefined;
}

export const DEFAULT_ELEMERGENCY_FITTING_TYPES = [
  'Bulkhead',
  'Pin Spot',
  'Panel',
  'Exit Box',
  'Running Man',
  'High Bay',
  'Floodlight',
  'Twin Spot',
  'Other',
] as const;

export interface EmergencyLightingResultInput {
  outcome: 'PASS' | 'FAIL' | 'NOT_TESTED';
  testType: 'FUNCTIONAL' | 'DURATION';
  durationMinutes?: number | undefined;
  notes?: string | undefined;
}

export class EmergencyLightingService {
  constructor(private readonly prisma: PrismaClient) {}

  async detail(organisationId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organisationId },
      include: {
        customer: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
        emergencyLightingSystem: {
          include: {
            locations: { orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] },
            groups: { orderBy: { name: 'asc' } },
            keyswitches: {
              include: {
                location: true,
                groupMappings: { include: { group: true } },
              },
              orderBy: { reference: 'asc' },
            },
            fittingTypes: { orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] },
            devices: {
              include: { fittingType: true },
              orderBy: [{ make: 'asc' }, { model: 'asc' }],
            },
          },
        },
      },
    });
    if (asset === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_SYSTEM_NOT_FOUND',
        'The emergency lighting system was not found.',
        404,
      );
    const system = asset.emergencyLightingSystem;
    if (system === null) return asset;
    const locations = system.locations ?? [];
    const devices = system.devices ?? [];
    const [locationMedia, deviceMedia] = await Promise.all([
      locations.length === 0
        ? []
        : this.prisma.media.findMany({
            where: {
              organisationId,
              status: 'AVAILABLE',
              entityType: 'EmergencyLightingLocation',
              entityId: { in: locations.map((location) => location.id) },
            },
          }),
      devices.length === 0
        ? []
        : this.prisma.media.findMany({
            where: {
              organisationId,
              status: 'AVAILABLE',
              entityType: 'EmergencyLightingDevice',
              entityId: { in: devices.map((device) => device.id) },
            },
          }),
    ]);
    return {
      ...asset,
      emergencyLightingSystem: {
        ...system,
        locations: locations.map((location) => ({
          ...location,
          media: locationMedia.filter((media) => media.entityId === location.id),
        })),
        devices: devices.map((device) => ({
          ...device,
          media: deviceMedia.filter((media) => media.entityId === device.id),
        })),
      },
    };
  }

  async saveSystem(
    organisationId: string,
    assetId: string,
    input: { description?: string | undefined; notes?: string | undefined },
  ) {
    await this.detail(organisationId, assetId);
    const data = stripUndefined(input);
    const system = await this.prisma.emergencyLightingSystem.upsert({
      where: { assetId },
      create: { organisationId, assetId, ...data },
      update: data,
    });
    await this.seedDefaultFittingTypes(organisationId, system.id);
    return system;
  }

  private async seedDefaultFittingTypes(organisationId: string, systemId: string) {
    const existing = await this.prisma.emergencyLightingFittingType.findMany({
      where: { organisationId, systemId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((item) => item.name.toLowerCase()));
    const missing = DEFAULT_ELEMERGENCY_FITTING_TYPES.filter(
      (name) => !existingNames.has(name.toLowerCase()),
    );
    if (missing.length === 0) return;
    await this.prisma.emergencyLightingFittingType.createMany({
      data: missing.map((name, index) => ({
        organisationId,
        systemId,
        name,
        displayOrder: index,
        isDefault: true,
      })),
      skipDuplicates: true,
    });
  }

  async listFittingTypes(organisationId: string, assetId: string) {
    const system = await this.requireSystem(organisationId, assetId);
    return this.prisma.emergencyLightingFittingType.findMany({
      where: { organisationId, systemId: system.id },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createFittingType(organisationId: string, assetId: string, name: string) {
    const system = await this.requireSystem(organisationId, assetId);
    const trimmed = name.trim();
    if (trimmed.length === 0)
      throw new DomainError(
        'EMERGENCY_LIGHTING_FITTING_TYPE_INVALID',
        'Fitting type name is required.',
        422,
      );
    try {
      return await this.prisma.emergencyLightingFittingType.create({
        data: { organisationId, systemId: system.id, name: trimmed },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) throw this.fittingTypeExists();
      throw error;
    }
  }

  async updateFittingType(
    organisationId: string,
    assetId: string,
    fittingTypeId: string,
    name: string,
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    const trimmed = name.trim();
    if (trimmed.length === 0)
      throw new DomainError(
        'EMERGENCY_LIGHTING_FITTING_TYPE_INVALID',
        'Fitting type name is required.',
        422,
      );
    const type = await this.prisma.emergencyLightingFittingType.findFirst({
      where: { id: fittingTypeId, organisationId, systemId: system.id },
    });
    if (type === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_FITTING_TYPE_NOT_FOUND',
        'The fitting type was not found.',
        404,
      );
    try {
      return await this.prisma.emergencyLightingFittingType.update({
        where: { id: fittingTypeId },
        data: { name: trimmed },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) throw this.fittingTypeExists();
      throw error;
    }
  }

  private fittingTypeExists(): DomainError {
    return new DomainError(
      'EMERGENCY_LIGHTING_FITTING_TYPE_EXISTS',
      'A fitting type with this name already exists on this register.',
      409,
    );
  }

  async deleteFittingType(organisationId: string, assetId: string, fittingTypeId: string) {
    const system = await this.requireSystem(organisationId, assetId);
    const result = await this.prisma.emergencyLightingFittingType.deleteMany({
      where: { id: fittingTypeId, organisationId, systemId: system.id },
    });
    if (result.count !== 1)
      throw new DomainError(
        'EMERGENCY_LIGHTING_FITTING_TYPE_NOT_FOUND',
        'The fitting type was not found.',
        404,
      );
  }

  async listDevices(organisationId: string, assetId: string) {
    const system = await this.requireSystem(organisationId, assetId);
    return this.prisma.emergencyLightingDevice.findMany({
      where: { organisationId, systemId: system.id },
      include: { fittingType: true },
      orderBy: [{ make: 'asc' }, { model: 'asc' }],
    });
  }

  async createDevice(
    organisationId: string,
    assetId: string,
    input: {
      make: string;
      model: string;
      fittingTypeId?: string | null | undefined;
      description?: string | undefined;
      notes?: string | undefined;
    },
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    const make = input.make.trim();
    const model = input.model.trim();
    if (make.length === 0 || model.length === 0)
      throw new DomainError(
        'EMERGENCY_LIGHTING_DEVICE_INVALID',
        'Device make and model are required.',
        422,
      );
    if (input.fittingTypeId !== undefined && input.fittingTypeId !== null)
      await this.requireFittingType(organisationId, system.id, input.fittingTypeId);
    try {
      return await this.prisma.emergencyLightingDevice.create({
        data: {
          organisationId,
          systemId: system.id,
          make,
          model,
          ...(input.fittingTypeId === undefined || input.fittingTypeId === null
            ? {}
            : { fittingTypeId: input.fittingTypeId }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
        },
        include: { fittingType: true },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) throw this.deviceExists();
      throw error;
    }
  }

  private deviceExists(): DomainError {
    return new DomainError(
      'EMERGENCY_LIGHTING_DEVICE_EXISTS',
      'A device with this model already exists on this register.',
      409,
    );
  }

  async updateDevice(
    organisationId: string,
    assetId: string,
    deviceId: string,
    input: {
      make?: string | undefined;
      model?: string | undefined;
      fittingTypeId?: string | null | undefined;
      description?: string | undefined;
      notes?: string | undefined;
    },
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    const device = await this.prisma.emergencyLightingDevice.findFirst({
      where: { id: deviceId, organisationId, systemId: system.id },
    });
    if (device === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_DEVICE_NOT_FOUND',
        'The device was not found.',
        404,
      );
    if (input.fittingTypeId !== undefined && input.fittingTypeId !== null)
      await this.requireFittingType(organisationId, system.id, input.fittingTypeId);
    try {
      return await this.prisma.emergencyLightingDevice.update({
        where: { id: deviceId },
        data: {
          ...(input.make === undefined ? {} : { make: input.make.trim() }),
          ...(input.model === undefined ? {} : { model: input.model.trim() }),
          ...(input.fittingTypeId === undefined ? {} : { fittingTypeId: input.fittingTypeId }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
        },
        include: { fittingType: true },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) throw this.deviceExists();
      throw error;
    }
  }

  async deleteDevice(organisationId: string, assetId: string, deviceId: string) {
    const system = await this.requireSystem(organisationId, assetId);
    const device = await this.prisma.emergencyLightingDevice.findFirst({
      where: { id: deviceId, organisationId, systemId: system.id },
    });
    if (device === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_DEVICE_NOT_FOUND',
        'The device was not found.',
        404,
      );
    const count = await this.prisma.emergencyLightingFitting.count({
      where: { organisationId, deviceId },
    });
    if (count > 0)
      throw new DomainError(
        'EMERGENCY_LIGHTING_DEVICE_IN_USE',
        'This device cannot be deleted while fittings use it. Remove it from those fittings first.',
        409,
      );
    return this.prisma.emergencyLightingDevice.delete({ where: { id: deviceId } });
  }

  async createLocation(
    organisationId: string,
    assetId: string,
    input: { name: string; description?: string | undefined; displayOrder?: number | undefined },
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    return this.prisma.emergencyLightingLocation.create({
      data: { organisationId, systemId: system.id, ...stripUndefined(input) },
    });
  }

  async updateLocation(
    organisationId: string,
    assetId: string,
    locationId: string,
    input: {
      name?: string | undefined;
      description?: string | undefined;
      displayOrder?: number | undefined;
    },
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    await this.requireLocation(organisationId, system.id, locationId);
    return this.prisma.emergencyLightingLocation.update({
      where: { id: locationId },
      data: stripUndefined(input),
    });
  }

  async deleteLocation(organisationId: string, assetId: string, locationId: string) {
    const system = await this.requireSystem(organisationId, assetId);
    await this.requireLocation(organisationId, system.id, locationId);
    return this.prisma.emergencyLightingLocation.delete({ where: { id: locationId } });
  }

  async createGroup(
    organisationId: string,
    assetId: string,
    input: { name: string; description?: string | undefined },
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    return this.prisma.emergencyLightingGroup.create({
      data: { organisationId, systemId: system.id, ...stripUndefined(input) },
    });
  }

  async updateGroup(
    organisationId: string,
    assetId: string,
    groupId: string,
    input: { name?: string | undefined; description?: string | undefined },
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    await this.requireGroup(organisationId, system.id, groupId);
    return this.prisma.emergencyLightingGroup.update({
      where: { id: groupId },
      data: stripUndefined(input),
    });
  }

  async deleteGroup(organisationId: string, assetId: string, groupId: string) {
    const system = await this.requireSystem(organisationId, assetId);
    await this.requireGroup(organisationId, system.id, groupId);
    return this.prisma.emergencyLightingGroup.delete({ where: { id: groupId } });
  }

  async createKeyswitch(
    organisationId: string,
    assetId: string,
    input: {
      reference: string;
      locationId?: string | undefined;
      groupIds: string[];
      description?: string | undefined;
      notes?: string | undefined;
    },
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    await this.validateRelationships(organisationId, system.id, input.locationId, input.groupIds);
    const { groupIds, locationId, ...optionalData } = input;
    const data = stripUndefined(optionalData);
    return this.prisma.emergencyLightingKeyswitch.create({
      data: {
        organisation: { connect: { id: organisationId } },
        system: { connect: { id: system.id } },
        ...data,
        ...(locationId === undefined ? {} : { location: { connect: { id: locationId } } }),
        groupMappings: { create: groupIds.map((groupId) => ({ groupId })) },
      },
      include: { groupMappings: true },
    });
  }

  async updateKeyswitch(
    organisationId: string,
    assetId: string,
    keyswitchId: string,
    input: {
      reference: string;
      locationId?: string | undefined;
      groupIds: string[];
      description?: string | undefined;
      notes?: string | undefined;
    },
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    const keyswitch = await this.prisma.emergencyLightingKeyswitch.findFirst({
      where: { id: keyswitchId, organisationId, systemId: system.id },
    });
    if (keyswitch === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_KEYSWITCH_NOT_FOUND',
        'The keyswitch was not found.',
        404,
      );
    await this.validateRelationships(organisationId, system.id, input.locationId, input.groupIds);
    const { groupIds, locationId, ...optionalData } = input;
    const data = stripUndefined(optionalData);
    return this.prisma.emergencyLightingKeyswitch.update({
      where: { id: keyswitchId },
      data: {
        ...data,
        ...(locationId === undefined ? {} : { location: { connect: { id: locationId } } }),
        groupMappings: { deleteMany: {}, create: groupIds.map((groupId) => ({ groupId })) },
      },
      include: { groupMappings: true },
    });
  }

  async deleteKeyswitch(organisationId: string, assetId: string, keyswitchId: string) {
    const system = await this.requireSystem(organisationId, assetId);
    const result = await this.prisma.emergencyLightingKeyswitch.deleteMany({
      where: { id: keyswitchId, organisationId, systemId: system.id },
    });
    if (result.count !== 1)
      throw new DomainError(
        'EMERGENCY_LIGHTING_KEYSWITCH_NOT_FOUND',
        'The keyswitch was not found.',
        404,
      );
  }

  async listFittings(
    organisationId: string,
    assetId: string,
    input: {
      page: number;
      pageSize: number;
      search?: string | undefined;
      locationId?: string | undefined;
      groupId?: string | undefined;
    },
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    const where: Prisma.EmergencyLightingFittingWhereInput = {
      organisationId,
      systemId: system.id,
      ...(input.locationId === undefined ? {} : { locationId: input.locationId }),
      ...(input.groupId === undefined
        ? {}
        : { groupMappings: { some: { groupId: input.groupId } } }),
      ...(input.search === undefined
        ? {}
        : {
            OR: [
              { reference: { contains: input.search, mode: 'insensitive' } },
              { description: { contains: input.search, mode: 'insensitive' } },
              { manufacturer: { contains: input.search, mode: 'insensitive' } },
              { model: { contains: input.search, mode: 'insensitive' } },
            ],
          }),
    };
    const [items, total] = await Promise.all([
      this.prisma.emergencyLightingFitting.findMany({
        where,
        include: {
          location: true,
          device: { include: { fittingType: true } },
          groupMappings: { include: { group: true } },
        },
        orderBy: { reference: 'asc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.emergencyLightingFitting.count({ where }),
    ]);
    const media =
      items.length === 0
        ? []
        : await this.prisma.media.findMany({
            where: {
              organisationId,
              status: 'AVAILABLE',
              OR: [
                {
                  entityType: 'EmergencyLightingFitting',
                  entityId: { in: items.map(({ id }) => id) },
                },
                {
                  entityType: 'Inspection',
                  category: 'emergency-lighting-evidence',
                  tags: { hasSome: items.map(({ id }) => `fitting:${id}`) },
                },
              ],
            },
            orderBy: { createdAt: 'desc' },
          });
    return {
      items: items.map((item) => ({
        ...item,
        media: media.filter(
          (entry) => entry.entityId === item.id || entry.tags.includes(`fitting:${item.id}`),
        ),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async labelStudio(organisationId: string, assetId: string) {
    await this.requireSystem(organisationId, assetId);
    const target = await this.prisma.asset.findFirst({
      where: { id: assetId, organisationId },
      select: {
        site: {
          select: {
            id: true,
            name: true,
            reference: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            county: true,
            postcode: true,
            countryCode: true,
            emergencyLightingLabelSettings: true,
            customer: { select: { id: true, name: true } },
            organisation: {
              select: {
                id: true,
                name: true,
                brandProfile: {
                  select: {
                    tradingName: true,
                    registeredName: true,
                    addressLine1: true,
                    addressLine2: true,
                    city: true,
                    county: true,
                    postcode: true,
                    telephone: true,
                    email: true,
                    website: true,
                    primaryColour: true,
                    secondaryColour: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (target === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_SYSTEM_NOT_FOUND',
        'The emergency lighting system was not found.',
        404,
      );
    const assets = await this.prisma.asset.findMany({
      where: { organisationId, siteId: target.site.id },
      select: {
        id: true,
        assetReference: true,
        displayName: true,
        emergencyLightingSystem: {
          select: {
            fittings: {
              where: { status: { not: 'ARCHIVED' } },
              include: {
                location: true,
                device: { include: { fittingType: true } },
                groupMappings: { include: { group: true } },
              },
              orderBy: { reference: 'asc' },
            },
          },
        },
      },
      orderBy: { assetReference: 'asc' },
    });
    return {
      site: target.site,
      organisation: target.site.organisation,
      fittings: assets.flatMap((asset) =>
        (asset.emergencyLightingSystem?.fittings ?? []).map((fitting) => ({
          ...fitting,
          asset: {
            id: asset.id,
            assetReference: asset.assetReference,
            displayName: asset.displayName,
          },
        })),
      ),
    };
  }

  async saveLabelSettings(
    organisationId: string,
    assetId: string,
    settings: Prisma.InputJsonObject,
  ) {
    await this.requireSystem(organisationId, assetId);
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organisationId },
      select: { siteId: true },
    });
    if (asset === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_SYSTEM_NOT_FOUND',
        'The emergency lighting system was not found.',
        404,
      );
    const site = await this.prisma.site.update({
      where: { id: asset.siteId },
      data: { emergencyLightingLabelSettings: settings },
      select: { emergencyLightingLabelSettings: true },
    });
    return site.emergencyLightingLabelSettings;
  }

  async getFitting(organisationId: string, assetId: string, fittingId: string) {
    const system = await this.requireSystem(organisationId, assetId);
    const fitting = await this.prisma.emergencyLightingFitting.findFirst({
      where: { id: fittingId, organisationId, systemId: system.id },
      include: {
        location: true,
        device: { include: { fittingType: true } },
        groupMappings: { include: { group: true } },
      },
    });
    if (fitting === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_FITTING_NOT_FOUND',
        'The fitting was not found.',
        404,
      );
    const groupIds = new Set(fitting.groupMappings.map(({ groupId }) => groupId));
    const [asset, media, locationMedia, keyswitches, testHistory] = await Promise.all([
      this.prisma.asset.findFirst({
        where: { id: assetId, organisationId },
        select: {
          id: true,
          assetReference: true,
          displayName: true,
          customer: { select: { id: true, name: true } },
          site: { select: { id: true, name: true } },
        },
      }),
      this.prisma.media.findMany({
        where: {
          organisationId,
          status: 'AVAILABLE',
          OR: [
            { entityType: 'EmergencyLightingFitting', entityId: fittingId },
            {
              entityType: 'Inspection',
              category: 'emergency-lighting-evidence',
              tags: { has: `fitting:${fittingId}` },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
      fitting.location === null
        ? Promise.resolve([])
        : this.prisma.media.findMany({
            where: {
              organisationId,
              status: 'AVAILABLE',
              entityType: 'EmergencyLightingLocation',
              entityId: fitting.location.id,
            },
            orderBy: { createdAt: 'desc' },
          }),
      this.prisma.emergencyLightingKeyswitch.findMany({
        where: { organisationId, systemId: system.id },
        include: { groupMappings: { include: { group: true } } },
        orderBy: { reference: 'asc' },
      }),
      this.prisma.emergencyLightingFittingResult.findMany({
        where: { organisationId, fittingId },
        include: {
          inspection: {
            select: {
              id: true,
              inspectionType: true,
              status: true,
              effectiveDate: true,
              submittedAt: true,
              approvedAt: true,
            },
          },
          inspectionRevision: {
            select: {
              revisionNumber: true,
              createdAt: true,
              inspection: {
                select: {
                  id: true,
                  inspectionType: true,
                  status: true,
                  effectiveDate: true,
                  submittedAt: true,
                  approvedAt: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    ]);
    const keyswitchMappings = keyswitches.filter((keyswitch) =>
      keyswitch.groupMappings.some(({ groupId }) => groupIds.has(groupId)),
    );
    return {
      asset: asset ?? { id: system.assetId, assetReference: '', displayName: '' },
      system: {
        id: system.id,
        locations: system.locations,
        groups: system.groups,
        fittingTypes: system.fittingTypes,
        devices: system.devices,
      },
      fitting: {
        ...fitting,
        media: media.filter(
          (entry) => entry.entityId === fittingId || entry.tags.includes(`fitting:${fittingId}`),
        ),
        locationMedia,
        keyswitches: keyswitchMappings.map((keyswitch) => ({
          ...keyswitch,
          groupMappings: keyswitch.groupMappings.filter(({ groupId }) => groupIds.has(groupId)),
        })),
      },
      testHistory: testHistory.map((result) => {
        const inspection = result.inspection ?? result.inspectionRevision?.inspection ?? null;
        return {
          id: result.id,
          outcome: result.outcome,
          testType: result.testType,
          durationMinutes: result.durationMinutes,
          notes: result.notes,
          isOverride: result.isOverride,
          recordedAt: result.inspectionRevision?.createdAt ?? result.updatedAt,
          inspection,
          revisionNumber: result.inspectionRevision?.revisionNumber ?? null,
        };
      }),
    };
  }

  async createFitting(
    organisationId: string,
    assetId: string,
    input: EmergencyLightingFittingInput,
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    return this.createFittingForSystem(organisationId, system.id, input);
  }

  async createFittingDuringInspection(
    organisationId: string,
    inspectionId: string,
    input: EmergencyLightingFittingInput,
  ) {
    const inspection = await this.requireInspection(organisationId, inspectionId);
    this.requireMutableInspection(inspection.status);
    const system = await this.requireSystem(organisationId, inspection.assetId);
    return this.createFittingForSystem(organisationId, system.id, input);
  }

  async updateFitting(
    organisationId: string,
    assetId: string,
    fittingId: string,
    input: EmergencyLightingFittingInput,
  ) {
    const system = await this.requireSystem(organisationId, assetId);
    await this.requireFittings(organisationId, system.id, [fittingId]);
    await this.validateRelationships(
      organisationId,
      system.id,
      input.locationId ?? undefined,
      input.groupIds ?? [],
      input.deviceId ?? undefined,
    );
    const device =
      input.deviceId === undefined || input.deviceId === null
        ? null
        : await this.requireDevice(organisationId, system.id, input.deviceId);
    const { groupIds = [], locationId, deviceId, ...optionalData } = input;
    const data = stripUndefined(optionalData);
    try {
      return await this.prisma.emergencyLightingFitting.update({
        where: { id: fittingId },
        data: {
          ...data,
          ...(device === null
            ? deviceId === undefined
              ? {}
              : { device: { disconnect: true } }
            : {
                device: { connect: { id: deviceId as string } },
                manufacturer: device.make,
                model: device.model,
                ...(device.fittingType === null ? {} : { fittingType: device.fittingType.name }),
              }),
          ...(locationId === undefined
            ? {}
            : locationId === null
              ? { location: { disconnect: true } }
              : { location: { connect: { id: locationId } } }),
          groupMappings: { deleteMany: {}, create: groupIds.map((groupId) => ({ groupId })) },
        },
        include: {
          location: true,
          device: { include: { fittingType: true } },
          groupMappings: { include: { group: true } },
        },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) throw this.fittingReferenceExists();
      throw error;
    }
  }

  async deleteFitting(organisationId: string, assetId: string, fittingId: string) {
    const system = await this.requireSystem(organisationId, assetId);
    await this.requireFittings(organisationId, system.id, [fittingId]);
    if (
      (await this.prisma.emergencyLightingFittingResult.count({
        where: { organisationId, fittingId },
      })) > 0
    )
      return this.prisma.emergencyLightingFitting.update({
        where: { id: fittingId },
        data: { status: 'ARCHIVED' },
      });
    return this.prisma.emergencyLightingFitting.delete({ where: { id: fittingId } });
  }

  async inspectionContext(organisationId: string, inspectionId: string) {
    const inspection = await this.requireInspection(organisationId, inspectionId);
    const system = await this.requireSystem(organisationId, inspection.assetId);
    const revision = ['DRAFT', 'IN_PROGRESS'].includes(inspection.status)
      ? null
      : await this.prisma.inspectionRevision.findFirst({
          where: { organisationId, inspectionId },
          orderBy: { revisionNumber: 'desc' },
          select: { id: true, revisionNumber: true },
        });
    const [activeFittings, results] = await Promise.all([
      this.prisma.emergencyLightingFitting.findMany({
        where: { organisationId, systemId: system.id, status: 'ACTIVE' },
        include: { location: true, groupMappings: { include: { group: true } } },
        orderBy: { reference: 'asc' },
      }),
      this.prisma.emergencyLightingFittingResult.findMany({
        where:
          revision === null
            ? { organisationId, inspectionId }
            : { organisationId, inspectionRevisionId: revision.id },
      }),
    ]);
    const fittings =
      revision === null
        ? activeFittings
        : results.map((result) => ({
            ...(result.snapshot as Record<string, unknown>),
            id: result.fittingId,
          }));
    return { inspection, revision, system, fittings, results };
  }

  async saveResult(
    organisationId: string,
    inspectionId: string,
    fittingId: string,
    input: EmergencyLightingResultInput,
  ) {
    const { system } = await this.inspectionContext(organisationId, inspectionId);
    const inspection = await this.requireInspection(organisationId, inspectionId);
    this.requireMutableInspection(inspection.status);
    const [fitting] = await this.requireFittings(organisationId, system.id, [fittingId]);
    if (fitting === undefined)
      throw new DomainError(
        'EMERGENCY_LIGHTING_FITTING_NOT_FOUND',
        'The fitting was not found.',
        404,
      );
    const result = stripUndefined(input);
    return this.prisma.emergencyLightingFittingResult.upsert({
      where: { inspectionId_fittingId: { inspectionId, fittingId } },
      create: {
        organisationId,
        inspectionId,
        fittingId,
        ...result,
        isOverride: true,
        snapshot: this.fittingSnapshot(fitting),
      },
      update: { ...result, isOverride: true, snapshot: this.fittingSnapshot(fitting) },
    });
  }

  async bulkApplyResults(
    organisationId: string,
    inspectionId: string,
    input: EmergencyLightingResultInput & {
      fittingIds?: string[] | undefined;
      locationId?: string | undefined;
      groupId?: string | undefined;
      replaceOverrides?: boolean | undefined;
    },
  ) {
    const inspection = await this.requireInspection(organisationId, inspectionId);
    this.requireMutableInspection(inspection.status);
    const system = await this.requireSystem(organisationId, inspection.assetId);
    const fittings = await this.prisma.emergencyLightingFitting.findMany({
      where: {
        organisationId,
        systemId: system.id,
        status: 'ACTIVE',
        ...(input.fittingIds === undefined ? {} : { id: { in: input.fittingIds } }),
        ...(input.locationId === undefined ? {} : { locationId: input.locationId }),
        ...(input.groupId === undefined
          ? {}
          : { groupMappings: { some: { groupId: input.groupId } } }),
      },
      include: { location: true, groupMappings: { include: { group: true } } },
    });
    if (input.fittingIds !== undefined && fittings.length !== new Set(input.fittingIds).size)
      throw new DomainError(
        'EMERGENCY_LIGHTING_FITTING_INVALID',
        'One or more selected fittings do not belong to this system.',
        422,
      );
    const result = stripUndefined({
      outcome: input.outcome,
      testType: input.testType,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
    });
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.emergencyLightingFittingResult.findMany({
        where: { organisationId, inspectionId, fittingId: { in: fittings.map(({ id }) => id) } },
        select: { fittingId: true, isOverride: true },
      });
      const existingByFitting = new Map(existing.map((item) => [item.fittingId, item]));
      let applied = 0;
      let preservedOverrides = 0;
      for (const fitting of fittings) {
        if (
          existingByFitting.get(fitting.id)?.isOverride === true &&
          input.replaceOverrides !== true
        ) {
          preservedOverrides += 1;
          continue;
        }
        await transaction.emergencyLightingFittingResult.upsert({
          where: { inspectionId_fittingId: { inspectionId, fittingId: fitting.id } },
          create: {
            organisationId,
            inspectionId,
            fittingId: fitting.id,
            ...result,
            snapshot: this.fittingSnapshot(fitting),
          },
          update: { ...result, isOverride: false, snapshot: this.fittingSnapshot(fitting) },
        });
        applied += 1;
      }
      return { applied, preservedOverrides };
    });
  }

  private async createFittingForSystem(
    organisationId: string,
    systemId: string,
    input: EmergencyLightingFittingInput,
  ) {
    await this.validateRelationships(
      organisationId,
      systemId,
      input.locationId ?? undefined,
      input.groupIds ?? [],
      input.deviceId ?? undefined,
    );
    const device =
      input.deviceId === undefined || input.deviceId === null
        ? null
        : await this.requireDevice(organisationId, systemId, input.deviceId);
    const { groupIds = [], locationId, deviceId, ...optionalData } = input;
    const data = stripUndefined({ ...optionalData, reference: optionalData.reference });
    const deviceFields =
      device === null
        ? {}
        : {
            manufacturer: device.make,
            model: device.model,
            ...(device.fittingType === null ? {} : { fittingType: device.fittingType.name }),
          };
    try {
      return await this.prisma.emergencyLightingFitting.create({
        data: {
          organisation: { connect: { id: organisationId } },
          system: { connect: { id: systemId } },
          ...data,
          ...deviceFields,
          ...(deviceId === undefined || deviceId === null
            ? {}
            : { device: { connect: { id: deviceId } } }),
          ...(locationId === undefined || locationId === null
            ? {}
            : { location: { connect: { id: locationId } } }),
          groupMappings: { create: groupIds.map((groupId) => ({ groupId })) },
        },
        include: {
          location: true,
          device: { include: { fittingType: true } },
          groupMappings: { include: { group: true } },
        },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) throw this.fittingReferenceExists();
      throw error;
    }
  }

  private fittingReferenceExists(): DomainError {
    return new DomainError(
      'EMERGENCY_LIGHTING_FITTING_REFERENCE_EXISTS',
      'A fitting with this reference already exists on this register.',
      409,
    );
  }

  private async requireSystem(organisationId: string, assetId: string) {
    const system = await this.prisma.emergencyLightingSystem.findFirst({
      where: { organisationId, assetId },
      include: {
        locations: { orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] },
        groups: { orderBy: { name: 'asc' } },
        keyswitches: {
          include: { location: true, groupMappings: { include: { group: true } } },
          orderBy: { reference: 'asc' },
        },
        fittingTypes: { orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] },
        devices: { include: { fittingType: true }, orderBy: [{ make: 'asc' }, { model: 'asc' }] },
      },
    });
    if (system === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_SYSTEM_NOT_FOUND',
        'The emergency lighting system was not found.',
        404,
      );
    return system;
  }

  private async requireInspection(organisationId: string, inspectionId: string) {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id: inspectionId, organisationId, moduleKey: 'emergency-lighting' },
      select: { id: true, assetId: true, status: true, inspectionType: true },
    });
    if (inspection === null || inspection.assetId === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_INSPECTION_NOT_FOUND',
        'The emergency lighting inspection was not found.',
        404,
      );
    return { ...inspection, assetId: inspection.assetId };
  }

  private requireMutableInspection(status: string) {
    if (!['DRAFT', 'IN_PROGRESS'].includes(status))
      throw new DomainError(
        'EMERGENCY_LIGHTING_INSPECTION_LOCKED',
        'Fitting results can only be changed while the inspection is in progress.',
        409,
      );
  }

  private async validateRelationships(
    organisationId: string,
    systemId: string,
    locationId: string | undefined,
    groupIds: string[],
    deviceId?: string | null,
  ) {
    if (locationId !== undefined) await this.requireLocation(organisationId, systemId, locationId);
    if (deviceId !== undefined && deviceId !== null)
      await this.requireDevice(organisationId, systemId, deviceId);
    const uniqueGroupIds = [...new Set(groupIds)];
    if (uniqueGroupIds.length > 0) {
      const groups = await this.prisma.emergencyLightingGroup.findMany({
        where: { id: { in: uniqueGroupIds }, organisationId, systemId },
        select: { id: true },
      });
      if (groups.length !== uniqueGroupIds.length)
        throw new DomainError(
          'EMERGENCY_LIGHTING_GROUP_INVALID',
          'One or more selected groups do not belong to this system.',
          422,
        );
    }
  }

  private async requireLocation(organisationId: string, systemId: string, locationId: string) {
    const location = await this.prisma.emergencyLightingLocation.findFirst({
      where: { id: locationId, organisationId, systemId },
    });
    if (location === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_LOCATION_NOT_FOUND',
        'The location was not found.',
        404,
      );
    return location;
  }

  private async requireGroup(organisationId: string, systemId: string, groupId: string) {
    const group = await this.prisma.emergencyLightingGroup.findFirst({
      where: { id: groupId, organisationId, systemId },
    });
    if (group === null)
      throw new DomainError('EMERGENCY_LIGHTING_GROUP_NOT_FOUND', 'The group was not found.', 404);
    return group;
  }

  private async requireFittingType(
    organisationId: string,
    systemId: string,
    fittingTypeId: string,
  ) {
    const fittingType = await this.prisma.emergencyLightingFittingType.findFirst({
      where: { id: fittingTypeId, organisationId, systemId },
    });
    if (fittingType === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_FITTING_TYPE_NOT_FOUND',
        'The fitting type was not found.',
        404,
      );
    return fittingType;
  }

  private async requireDevice(organisationId: string, systemId: string, deviceId: string) {
    const device = await this.prisma.emergencyLightingDevice.findFirst({
      where: { id: deviceId, organisationId, systemId },
      include: { fittingType: true },
    });
    if (device === null)
      throw new DomainError(
        'EMERGENCY_LIGHTING_DEVICE_NOT_FOUND',
        'The device was not found.',
        404,
      );
    return device;
  }

  private async requireFittings(organisationId: string, systemId: string, fittingIds: string[]) {
    const fittings = await this.prisma.emergencyLightingFitting.findMany({
      where: { id: { in: [...new Set(fittingIds)] }, organisationId, systemId },
      include: { location: true, groupMappings: { include: { group: true } } },
    });
    if (fittings.length !== new Set(fittingIds).size)
      throw new DomainError(
        'EMERGENCY_LIGHTING_FITTING_NOT_FOUND',
        'The fitting was not found.',
        404,
      );
    return fittings;
  }

  private fittingSnapshot(fitting: Record<string, unknown>): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(fitting)) as Prisma.InputJsonObject;
  }
}
