import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { DomainError } from '../../shared/domain-error';

function stripUndefined<T extends object>(input: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

export interface EmergencyLightingFittingInput {
  reference: string;
  locationId?: string | null | undefined;
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
              include: { location: true, groupMappings: { include: { group: true } } },
              orderBy: { reference: 'asc' },
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
    return asset;
  }

  async saveSystem(
    organisationId: string,
    assetId: string,
    input: { description?: string | undefined; notes?: string | undefined },
  ) {
    await this.detail(organisationId, assetId);
    const data = stripUndefined(input);
    return this.prisma.emergencyLightingSystem.upsert({
      where: { assetId },
      create: { organisationId, assetId, ...data },
      update: data,
    });
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
        include: { location: true, groupMappings: { include: { group: true } } },
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
    );
    const { groupIds = [], locationId, ...optionalData } = input;
    const data = stripUndefined(optionalData);
    return this.prisma.emergencyLightingFitting.update({
      where: { id: fittingId },
      data: {
        ...data,
        ...(locationId === undefined
          ? {}
          : locationId === null
            ? { location: { disconnect: true } }
            : { location: { connect: { id: locationId } } }),
        groupMappings: { deleteMany: {}, create: groupIds.map((groupId) => ({ groupId })) },
      },
      include: { location: true, groupMappings: { include: { group: true } } },
    });
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
    );
    const { groupIds = [], locationId, ...optionalData } = input;
    const data = stripUndefined(optionalData);
    return this.prisma.emergencyLightingFitting.create({
      data: {
        organisation: { connect: { id: organisationId } },
        system: { connect: { id: systemId } },
        ...data,
        ...(locationId === undefined || locationId === null
          ? {}
          : { location: { connect: { id: locationId } } }),
        groupMappings: { create: groupIds.map((groupId) => ({ groupId })) },
      },
      include: { location: true, groupMappings: { include: { group: true } } },
    });
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
  ) {
    if (locationId !== undefined) await this.requireLocation(organisationId, systemId, locationId);
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
