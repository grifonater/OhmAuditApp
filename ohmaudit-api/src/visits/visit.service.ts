import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

export interface EngineerEvAssetInput {
  assetReference: string;
  displayName: string;
  manufacturer?: string | undefined;
  model?: string | undefined;
  serialNumber?: string | undefined;
  maximumPowerKw?: number | undefined;
  dcRcdType: 'TYPE_B' | 'RDC_DD' | 'NONE';
}

export interface AddEvChargerPayload {
  localIds: {
    assetId: string;
    chargePointId: string;
    taskId: string;
    inspectionId: string;
  };
  asset: EngineerEvAssetInput;
}

export interface RemoveEvChargerPayload {
  assetId: string;
}

export interface VisitFindingInput {
  clientFindingId: string;
  title: string;
  description?: string | undefined;
  category: 'ADVICE' | 'NOTE' | 'FAULT' | 'CONDITION';
  severity: 'ADVISORY' | 'MINOR' | 'MAJOR' | 'DANGEROUS';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
  photoMediaIds: string[];
}

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class VisitService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    organisationId: string,
    input: {
      query?: string;
      status?: string;
      dateField?: 'scheduled' | 'completed';
      from?: Date;
      to?: Date;
      sort?: 'scheduled' | 'completed' | 'title' | 'status';
      direction?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(10, input.pageSize ?? 20));
    const query = input.query?.trim();
    const dateRange = {
      ...(input.from === undefined ? {} : { gte: input.from }),
      ...(input.to === undefined ? {} : { lte: input.to }),
    };
    const status =
      input.status === undefined || input.status === 'ALL'
        ? undefined
        : (input.status as
            'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'SUBMITTED' | 'COMPLETED' | 'CANCELLED');
    const where: Prisma.VisitWhereInput = {
      organisationId,
      archivedAt: null,
      ...(query === undefined || query === ''
        ? {}
        : {
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { reference: { contains: query, mode: 'insensitive' } },
              { customer: { name: { contains: query, mode: 'insensitive' } } },
              { site: { name: { contains: query, mode: 'insensitive' } } },
              { site: { postcode: { contains: query, mode: 'insensitive' } } },
              { guestEngineerName: { contains: query, mode: 'insensitive' } },
            ],
          }),
      ...(status === undefined ? {} : { status }),
      ...(Object.keys(dateRange).length === 0
        ? {}
        : input.dateField === 'completed'
          ? { completedAt: dateRange }
          : { scheduledStart: dateRange }),
    };
    const direction = input.direction ?? 'desc';
    const orderBy: Prisma.VisitOrderByWithRelationInput =
      input.sort === 'title'
        ? { title: direction }
        : input.sort === 'status'
          ? { status: direction }
          : input.sort === 'completed'
            ? { completedAt: { sort: direction, nulls: 'last' } }
            : { scheduledStart: direction };
    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          site: { select: { id: true, name: true, postcode: true } },
          jobCategory: true,
          assignedUser: { select: { id: true, displayName: true, email: true } },
          findings: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
          tasks: {
            include: {
              asset: { select: { id: true, displayName: true, assetReference: true } },
              inspection: { select: { id: true, status: true } },
            },
          },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.visit.count({ where }),
    ]);
    return {
      visits,
      pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async create(
    organisationId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      siteId: string;
      reference?: string | undefined;
      externalReference?: string | undefined;
      title: string;
      description?: string | undefined;
      exclusions?: string | undefined;
      jobCategoryId?: string | undefined;
      jobType?: string | undefined;
      scheduledStart: Date;
      scheduledEnd?: Date | undefined;
      assignedUserId?: string | undefined;
      guestEngineerName?: string | undefined;
      guestEmail?: string | undefined;
      guestMobile?: string | undefined;
      engineerNotes?: string | undefined;
      evDiscoveryEnabled?: boolean | undefined;
      tasks: Array<{ assetId?: string | undefined; moduleKey: string; title: string }>;
    },
  ) {
    const site = await this.prisma.site.findFirst({ where: { id: input.siteId, organisationId } });
    if (site === null) throw new DomainError('SITE_NOT_FOUND', 'The site was not found.', 404);
    if (input.scheduledEnd !== undefined && input.scheduledEnd < input.scheduledStart)
      throw new DomainError(
        'JOB_SCHEDULE_INVALID',
        'The planned end must be after the planned start.',
        422,
      );
    if (
      input.assignedUserId !== undefined &&
      (input.guestEngineerName !== undefined ||
        input.guestEmail !== undefined ||
        input.guestMobile !== undefined)
    )
      throw new DomainError(
        'JOB_ASSIGNMENT_INVALID',
        'Choose either an organisation engineer or a guest engineer for this job.',
        422,
      );
    await this.validateCategory(organisationId, input.jobCategoryId);
    await this.validateAssignedUser(organisationId, input.assignedUserId);
    const assetIds = input.tasks.flatMap((task) =>
      task.assetId === undefined ? [] : [task.assetId],
    );
    if (
      assetIds.length > 0 &&
      (await this.prisma.asset.count({
        where: { id: { in: assetIds }, siteId: site.id, organisationId },
      })) !== new Set(assetIds).size
    )
      throw new DomainError(
        'VISIT_ASSET_INVALID',
        'One or more job assets do not belong to this site.',
        422,
      );
    return this.prisma.$transaction(async (transaction) => {
      const visit = await transaction.visit.create({
        data: {
          organisationId,
          customerId: site.customerId,
          siteId: site.id,
          createdByUserId: actorUserId,
          ...(input.reference === undefined ? {} : { reference: input.reference }),
          ...(input.externalReference === undefined
            ? {}
            : { externalReference: input.externalReference }),
          title: input.title,
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.exclusions === undefined ? {} : { exclusions: input.exclusions }),
          ...(input.jobCategoryId === undefined ? {} : { jobCategoryId: input.jobCategoryId }),
          ...(input.jobType === undefined ? {} : { jobType: input.jobType }),
          scheduledStart: input.scheduledStart,
          ...(input.scheduledEnd === undefined ? {} : { scheduledEnd: input.scheduledEnd }),
          ...(input.assignedUserId === undefined ? {} : { assignedUserId: input.assignedUserId }),
          ...(input.guestEngineerName === undefined
            ? {}
            : { guestEngineerName: input.guestEngineerName }),
          ...(input.guestEmail === undefined ? {} : { guestEmail: input.guestEmail }),
          ...(input.guestMobile === undefined ? {} : { guestMobile: input.guestMobile }),
          ...(input.engineerNotes === undefined ? {} : { engineerNotes: input.engineerNotes }),
          evDiscoveryEnabled: input.evDiscoveryEnabled ?? false,
          status: 'SCHEDULED',
          ...(input.tasks.length === 0
            ? {}
            : {
                tasks: {
                  create: input.tasks.map((task, displayOrder) => ({
                    organisationId,
                    moduleKey: task.moduleKey,
                    title: task.title,
                    displayOrder,
                    ...(task.assetId === undefined ? {} : { assetId: task.assetId }),
                  })),
                },
              }),
        },
        include: { tasks: true },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'VisitCreated',
          entityType: 'Visit',
          entityId: visit.id,
          data: { siteId: site.id, taskCount: visit.tasks.length },
        },
      });
      return visit;
    });
  }

  async detail(organisationId: string, visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, organisationId },
      include: {
        customer: true,
        site: { include: { contacts: true } },
        jobCategory: true,
        assignedUser: { select: { id: true, displayName: true, email: true } },
        createdByUser: { select: { id: true, displayName: true, email: true } },
        findings: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        tasks: {
          include: {
            asset: {
              include: {
                evChargePoint: {
                  include: { supplies: true, connectors: { include: { supplyMappings: true } } },
                },
              },
            },
            inspection: {
              include: {
                revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
                defects: true,
                draft: { select: { updatedAt: true } },
              },
            },
          },
        },
      },
    });
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
    const media = await this.prisma.media.findMany({
      where: {
        organisationId,
        entityType: 'Asset',
        entityId: {
          in: visit.tasks.flatMap((task) => (task.asset === null ? [] : [task.asset.id])),
        },
        status: 'AVAILABLE',
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...visit,
      tasks: visit.tasks.map((task) => ({
        ...task,
        inspection:
          task.inspection === null
            ? null
            : {
                ...task.inspection,
                draft: {
                  available: task.inspection.draft !== null,
                  updatedAt: task.inspection.draft?.updatedAt ?? null,
                },
              },
        asset:
          task.asset === null
            ? null
            : { ...task.asset, media: media.filter(({ entityId }) => entityId === task.asset?.id) },
      })),
    };
  }

  async jobSheetSource(organisationId: string, visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, organisationId, archivedAt: null },
      include: {
        organisation: { include: { brandProfile: true } },
        customer: true,
        site: {
          include: {
            contacts: { orderBy: [{ primary: 'desc' }, { name: 'asc' }] },
          },
        },
        jobCategory: true,
        assignedUser: { select: { displayName: true, email: true } },
        tasks: {
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            asset: true,
            inspection: {
              select: { status: true, currentRevisionNumber: true },
            },
          },
        },
        rams: {
          orderBy: { linkedAt: 'asc' },
          include: {
            rams: {
              select: {
                id: true,
                reference: true,
                title: true,
                status: true,
                currentRevisionNumber: true,
              },
            },
          },
        },
      },
    });
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
    return visit;
  }

  async update(
    organisationId: string,
    visitId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      reference?: string | null | undefined;
      externalReference?: string | null | undefined;
      title?: string | undefined;
      description?: string | null | undefined;
      exclusions?: string | null | undefined;
      jobCategoryId?: string | null | undefined;
      jobType?: string | null | undefined;
      scheduledStart?: Date | undefined;
      scheduledEnd?: Date | null | undefined;
      engineerNotes?: string | null | undefined;
      evDiscoveryEnabled?: boolean | undefined;
    },
  ) {
    const current = await this.requireVisit(organisationId, visitId);
    this.rejectArchived(current.archivedAt);
    await this.validateCategory(organisationId, input.jobCategoryId ?? undefined);
    const scheduledStart = input.scheduledStart ?? current.scheduledStart;
    const scheduledEnd =
      input.scheduledEnd === undefined ? current.scheduledEnd : input.scheduledEnd;
    if (scheduledEnd !== null && scheduledEnd < scheduledStart)
      throw new DomainError(
        'JOB_SCHEDULE_INVALID',
        'The planned end must be after the planned start.',
        422,
      );
    const data = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as Prisma.VisitUncheckedUpdateInput;
    const auditData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
    ) as Prisma.InputJsonObject;
    return this.prisma.$transaction(async (transaction) => {
      const visit = await transaction.visit.update({ where: { id: visitId }, data });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'VisitUpdated',
          entityType: 'Visit',
          entityId: visitId,
          data: auditData,
        },
      });
      return visit;
    });
  }

  async addTasks(
    organisationId: string,
    visitId: string,
    actorUserId: string,
    correlationId: string,
    input: Array<{ assetId?: string | undefined; moduleKey: string; title: string }>,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const visit = await transaction.visit.findFirst({
        where: { id: visitId, organisationId },
        include: { tasks: { select: { assetId: true, moduleKey: true, displayOrder: true } } },
      });
      if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
      this.rejectArchived(visit.archivedAt);

      const inputKeys = input.map((task) => `${task.assetId ?? 'site'}:${task.moduleKey}`);
      if (new Set(inputKeys).size !== inputKeys.length)
        throw new DomainError(
          'VISIT_TASK_DUPLICATE',
          'The same asset and module cannot be added to a job more than once.',
          409,
        );
      const existingKeys = new Set(
        visit.tasks.map((task) => `${task.assetId ?? 'site'}:${task.moduleKey}`),
      );
      if (inputKeys.some((key) => existingKeys.has(key)))
        throw new DomainError(
          'VISIT_TASK_DUPLICATE',
          'The same asset and module already exists on this job.',
          409,
        );

      const assetIds = [...new Set(input.flatMap((task) => (task.assetId ? [task.assetId] : [])))];
      const assets =
        assetIds.length === 0
          ? []
          : await transaction.asset.findMany({
              where: {
                id: { in: assetIds },
                organisationId,
                siteId: visit.siteId,
                status: 'ACTIVE',
              },
              select: { id: true, assetType: true },
            });
      if (assets.length !== assetIds.length)
        throw new DomainError(
          'VISIT_ASSET_INVALID',
          'One or more job assets are not active assets at this site.',
          422,
        );
      const assetById = new Map(assets.map((asset) => [asset.id, asset]));
      if (
        input.some(
          (task) =>
            task.moduleKey === 'ev-charging' &&
            (task.assetId === undefined ||
              !this.isEvAssetType(assetById.get(task.assetId)?.assetType)),
        )
      )
        throw new DomainError(
          'VISIT_EV_ASSET_INVALID',
          'EV charging tasks can only be added to active EV assets.',
          422,
        );

      const firstDisplayOrder = Math.max(-1, ...visit.tasks.map((task) => task.displayOrder)) + 1;
      const tasks = [];
      for (const [offset, task] of input.entries()) {
        tasks.push(
          await transaction.visitTask.create({
            data: {
              organisationId,
              visitId,
              ...(task.assetId === undefined ? {} : { assetId: task.assetId }),
              moduleKey: task.moduleKey,
              title: task.title,
              status: 'PENDING',
              displayOrder: firstDisplayOrder + offset,
            },
          }),
        );
      }
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'VisitTasksAdded',
          entityType: 'Visit',
          entityId: visitId,
          data: { taskIds: tasks.map((task) => task.id), taskCount: tasks.length },
        },
      });
      return tasks;
    });
  }

  async archive(
    organisationId: string,
    visitId: string,
    actorUserId: string,
    correlationId: string,
  ) {
    const current = await this.requireVisit(organisationId, visitId);
    if (current.archivedAt !== null) return current;
    const archivedAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const visit = await transaction.visit.update({
        where: { id: visitId },
        data: { archivedAt },
      });
      await transaction.guestAccessToken.updateMany({
        where: { visitId, revokedAt: null, expiresAt: { gt: archivedAt } },
        data: { revokedAt: archivedAt },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'VisitArchived',
          entityType: 'Visit',
          entityId: visitId,
          data: { archivedAt: archivedAt.toISOString() },
        },
      });
      return visit;
    });
  }

  async addEvAsset(
    organisationId: string,
    visitId: string,
    actorUserId: string | undefined,
    correlationId: string,
    input: EngineerEvAssetInput,
  ) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, organisationId },
      include: { tasks: { select: { displayOrder: true } } },
    });
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
    this.rejectArchived(visit.archivedAt);
    if (!visit.evDiscoveryEnabled)
      throw new DomainError(
        'EV_DISCOVERY_NOT_ENABLED',
        'Adding chargers is not enabled for this job.',
        403,
      );
    try {
      return await this.prisma.$transaction(async (transaction) => {
        let assetModelId: string | undefined;
        if (input.manufacturer && input.model) {
          const assetModel = await transaction.assetModel.upsert({
            where: {
              manufacturer_model_category: {
                manufacturer: input.manufacturer,
                model: input.model,
                category: 'EV Charger',
              },
            },
            create: {
              manufacturer: input.manufacturer,
              model: input.model,
              category: 'EV Charger',
            },
            update: {},
          });
          assetModelId = assetModel.id;
        }
        const asset = await transaction.asset.create({
          data: {
            organisationId,
            customerId: visit.customerId,
            siteId: visit.siteId,
            assetType: 'EV Charger',
            assetReference: input.assetReference,
            displayName: input.displayName,
            status: 'PROPOSED',
            createdDuringVisitId: visit.id,
            ...(input.manufacturer === undefined ? {} : { manufacturer: input.manufacturer }),
            ...(input.model === undefined ? {} : { model: input.model }),
            ...(input.serialNumber === undefined ? {} : { serialNumber: input.serialNumber }),
            ...(assetModelId === undefined ? {} : { assetModelId }),
            evChargePoint: {
              create: {
                organisationId,
                dcRcdType: input.dcRcdType,
                ...(input.maximumPowerKw === undefined
                  ? {}
                  : { maximumPowerKw: input.maximumPowerKw }),
              },
            },
          },
        });
        const displayOrder = Math.max(-1, ...visit.tasks.map((task) => task.displayOrder)) + 1;
        const task = await transaction.visitTask.create({
          data: {
            organisationId,
            visitId,
            assetId: asset.id,
            moduleKey: 'ev-charging',
            title: 'EV charger inspection',
            displayOrder,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            ...(actorUserId === undefined ? {} : { actorUserId }),
            correlationId,
            eventType: 'EngineerEvAssetCreated',
            entityType: 'Asset',
            entityId: asset.id,
            data: { visitId, siteId: visit.siteId, taskId: task.id },
          },
        });
        return { asset, task };
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error))
        throw new DomainError(
          'ASSET_REFERENCE_EXISTS',
          'This asset reference is already used by another asset at this site.',
          409,
        );
      throw error;
    }
  }

  async addEvAssetWithInspection(
    organisationId: string,
    visitId: string,
    actorUserId: string | undefined,
    correlationId: string,
    input: EngineerEvAssetInput,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const visit = await transaction.visit.findFirst({
          where: { id: visitId, organisationId },
          include: { tasks: { select: { displayOrder: true } } },
        });
        if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
        this.requireActiveDiscoveryVisit(visit);
        return this.createEvAssetRecords(
          transaction,
          visit,
          actorUserId,
          correlationId,
          input,
          true,
        );
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error))
        throw new DomainError(
          'ASSET_REFERENCE_EXISTS',
          'This asset reference is already used by another asset at this site.',
          409,
        );
      throw error;
    }
  }

  async guestLink(organisationId: string, visitId: string, validDays = 7) {
    const visit = await this.requireVisit(organisationId, visitId);
    this.rejectArchived(visit.archivedAt);
    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + validDays * 86400000);
    await this.prisma.guestAccessToken.create({ data: { visitId, tokenHash, expiresAt } });
    return { token, expiresAt };
  }

  async guestPack(token: string) {
    const access = await this.prisma.guestAccessToken.findUnique({
      where: { tokenHash: await hashToken(token) },
      include: {
        visit: {
          include: {
            customer: true,
            site: true,
            findings: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
            tasks: {
              include: {
                inspection: true,
                asset: {
                  include: {
                    evChargePoint: {
                      include: {
                        supplies: true,
                        connectors: { include: { supplyMappings: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (access === null || access.revokedAt !== null || access.expiresAt <= new Date())
      throw new DomainError(
        'GUEST_LINK_INVALID',
        'This guest link is invalid or has expired.',
        401,
      );
    await this.prisma.guestAccessToken.update({
      where: { id: access.id },
      data: { lastUsedAt: new Date() },
    });
    const media = await this.prisma.media.findMany({
      where: {
        organisationId: access.visit.organisationId,
        entityType: 'Asset',
        entityId: {
          in: access.visit.tasks.flatMap((task) => (task.asset === null ? [] : [task.asset.id])),
        },
        status: 'AVAILABLE',
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...access.visit,
      tasks: access.visit.tasks.map((task) => ({
        ...task,
        asset:
          task.asset === null
            ? null
            : { ...task.asset, media: media.filter(({ entityId }) => entityId === task.asset?.id) },
      })),
    };
  }

  async setGuestIdentity(token: string, displayName: string, correlationId: string) {
    const normalisedName = displayName.trim();
    return this.prisma.$transaction(async (transaction) => {
      const access = await transaction.guestAccessToken.findUnique({
        where: { tokenHash: await hashToken(token) },
        include: { visit: true },
      });
      this.validateGuestAccess(access);
      const visit = access.visit;
      if (visit.guestEngineerName?.trim() === normalisedName)
        return {
          identity: { displayName: visit.guestEngineerName, email: visit.guestEmail },
          visit,
        };
      if (visit.guestEngineerName !== null || visit.guestEmail !== null)
        throw new DomainError(
          'GUEST_IDENTITY_CONFLICT',
          'The guest engineer identity is already configured for this job.',
          409,
        );
      const updated = await transaction.visit.updateMany({
        where: {
          id: visit.id,
          organisationId: visit.organisationId,
          guestEngineerName: null,
          guestEmail: null,
        },
        data: { guestEngineerName: normalisedName },
      });
      if (updated.count === 0) {
        const current = await transaction.visit.findUnique({ where: { id: visit.id } });
        if (current?.guestEngineerName?.trim() === normalisedName)
          return {
            identity: { displayName: current.guestEngineerName, email: current.guestEmail },
            visit: current,
          };
        throw new DomainError(
          'GUEST_IDENTITY_CONFLICT',
          'The guest engineer identity is already configured for this job.',
          409,
        );
      }
      const current = await transaction.visit.findUniqueOrThrow({ where: { id: visit.id } });
      await transaction.auditEvent.create({
        data: {
          organisationId: visit.organisationId,
          correlationId,
          eventType: 'GuestEngineerIdentitySet',
          entityType: 'Visit',
          entityId: visit.id,
          data: { displayName: normalisedName },
        },
      });
      return {
        identity: { displayName: current.guestEngineerName!, email: current.guestEmail },
        visit: current,
      };
    });
  }

  async guestVisitScope(token: string) {
    const access = await this.prisma.guestAccessToken.findUnique({
      where: { tokenHash: await hashToken(token) },
      include: { visit: true },
    });
    this.validateGuestAccess(access);
    await this.prisma.guestAccessToken.update({
      where: { id: access.id },
      data: { lastUsedAt: new Date() },
    });
    return access.visit;
  }

  async requireEvDiscoveryVisit(organisationId: string, visitId: string) {
    const visit = await this.requireVisit(organisationId, visitId);
    this.requireActiveDiscoveryVisit(visit);
    return visit;
  }

  async guestMedia(token: string, mediaId: string) {
    const visit = await this.guestPack(token);
    const assetIds = new Set(
      visit.tasks.flatMap((task) => (task.asset === null ? [] : [task.asset.id])),
    );
    const inspectionIds = new Set(
      visit.tasks.flatMap((task) => (task.inspection === null ? [] : [task.inspection.id])),
    );
    const media = await this.prisma.media.findFirst({
      where: { id: mediaId, organisationId: visit.organisationId, status: 'AVAILABLE' },
    });
    const accessible =
      media !== null &&
      ((media.entityType === 'Asset' && assetIds.has(media.entityId)) ||
        (media.entityType === 'Inspection' && inspectionIds.has(media.entityId)) ||
        (media.entityType === 'Visit' && media.entityId === visit.id));
    if (!accessible || media === null)
      throw new DomainError('MEDIA_NOT_FOUND', 'The inspection image was not found.', 404);
    return media;
  }

  async guestInspectionAsset(token: string, inspectionId: string) {
    const visit = await this.guestPack(token);
    const task = visit.tasks.find((candidate) => candidate.inspection?.id === inspectionId);
    if (task?.asset === null || task?.asset === undefined)
      throw new DomainError(
        'INSPECTION_ASSET_NOT_FOUND',
        'The inspection asset was not found in this job.',
        404,
      );
    return { organisationId: visit.organisationId, assetId: task.asset.id };
  }

  async applySync(
    organisationId: string,
    visitId: string,
    clientMutationId: string,
    entityType: string,
    operation: string,
    payload: Record<string, unknown>,
  ) {
    const existing = await this.syncReplay(
      organisationId,
      visitId,
      clientMutationId,
      entityType,
      operation,
      payload,
    );
    if (existing !== null) return existing;
    await this.detail(organisationId, visitId);
    try {
      return await this.prisma.syncMutation.create({
        data: {
          organisationId,
          visitId,
          clientMutationId,
          entityType,
          operation,
          payload: payload as Prisma.InputJsonValue,
          status: 'APPLIED',
          result: { accepted: true },
          appliedAt: new Date(),
        },
      });
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) throw error;
      const replay = await this.syncReplay(
        organisationId,
        visitId,
        clientMutationId,
        entityType,
        operation,
        payload,
      );
      if (replay !== null) return replay;
      throw error;
    }
  }

  async listFindings(organisationId: string, visitId: string) {
    await this.requireVisit(organisationId, visitId);
    return this.prisma.visitFinding.findMany({
      where: { organisationId, visitId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async upsertFindings(organisationId: string, visitId: string, findings: VisitFindingInput[]) {
    return this.prisma.$transaction((transaction) =>
      this.replaceFindings(transaction, organisationId, visitId, findings),
    );
  }

  async upsertFindingsSync(
    organisationId: string,
    visitId: string,
    clientMutationId: string,
    entityType: string,
    payload: { findings: VisitFindingInput[] },
  ) {
    const operation = 'UPSERT_VISIT_FINDINGS';
    const replay = await this.syncReplay(
      organisationId,
      visitId,
      clientMutationId,
      entityType,
      operation,
      payload,
    );
    if (replay !== null) return replay;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const findings = await this.replaceFindings(
          transaction,
          organisationId,
          visitId,
          payload.findings,
        );
        return transaction.syncMutation.create({
          data: {
            organisationId,
            visitId,
            clientMutationId,
            entityType,
            operation,
            payload: jsonValue(payload),
            status: 'APPLIED',
            result: jsonValue({ findings }),
            appliedAt: new Date(),
          },
        });
      });
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) throw error;
      const replayAfterConflict = await this.syncReplay(
        organisationId,
        visitId,
        clientMutationId,
        entityType,
        operation,
        payload,
      );
      if (replayAfterConflict !== null) return replayAfterConflict;
      throw error;
    }
  }

  async deleteFindingMedia(
    organisationId: string,
    visitId: string,
    clientFindingId: string,
    mediaId: string,
  ) {
    await this.requireVisit(organisationId, visitId);
    const findingTag = `finding:${clientFindingId}`;
    const media = await this.prisma.media.findFirst({
      where: {
        id: mediaId,
        organisationId,
        entityType: 'Visit',
        entityId: visitId,
        tags: { has: findingTag },
      },
    });
    const findingTags = media?.tags.filter((tag) => tag.startsWith('finding:')) ?? [];
    if (media === null || findingTags.length !== 1 || findingTags[0] !== findingTag)
      throw new DomainError(
        'VISIT_FINDING_MEDIA_NOT_FOUND',
        'The image was not uploaded for this job finding.',
        404,
      );
    await this.prisma.$transaction(async (transaction) => {
      const linked = await transaction.visitFinding.findMany({
        where: { organisationId, visitId, photoMediaIds: { array_contains: [mediaId] } },
        select: { id: true, photoMediaIds: true },
      });
      for (const finding of linked)
        await transaction.visitFinding.update({
          where: { id: finding.id },
          data: {
            photoMediaIds: Array.isArray(finding.photoMediaIds)
              ? finding.photoMediaIds.filter((id) => id !== mediaId)
              : [],
          },
        });
      await transaction.media.deleteMany({ where: { id: mediaId, organisationId } });
    });
    return media;
  }

  async syncReplay(
    organisationId: string,
    visitId: string,
    clientMutationId: string,
    entityType: string,
    operation: string,
    payload: Record<string, unknown>,
  ) {
    const existing = await this.prisma.syncMutation.findUnique({
      where: { organisationId_clientMutationId: { organisationId, clientMutationId } },
    });
    if (existing === null) return null;
    if (
      existing.visitId !== visitId ||
      existing.entityType !== entityType ||
      existing.operation !== operation ||
      canonicalJson(existing.payload) !== canonicalJson(payload)
    )
      throw new DomainError(
        'SYNC_MUTATION_CONFLICT',
        'This client mutation ID has already been used for a different mutation.',
        409,
      );
    return existing;
  }

  async addEvChargerSync(
    organisationId: string,
    visitId: string,
    clientMutationId: string,
    entityType: string,
    payload: AddEvChargerPayload,
    actorUserId: string | undefined,
    correlationId: string,
  ) {
    const replay = await this.syncReplay(
      organisationId,
      visitId,
      clientMutationId,
      entityType,
      'ADD_EV_CHARGER',
      payload as unknown as Record<string, unknown>,
    );
    if (replay !== null) return replay;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const concurrent = await transaction.syncMutation.findUnique({
          where: { organisationId_clientMutationId: { organisationId, clientMutationId } },
        });
        if (concurrent !== null) {
          if (
            concurrent.visitId !== visitId ||
            concurrent.entityType !== entityType ||
            concurrent.operation !== 'ADD_EV_CHARGER' ||
            canonicalJson(concurrent.payload) !== canonicalJson(payload)
          )
            throw new DomainError(
              'SYNC_MUTATION_CONFLICT',
              'This client mutation ID has already been used for a different mutation.',
              409,
            );
          return concurrent;
        }
        const visit = await transaction.visit.findFirst({
          where: { id: visitId, organisationId },
          include: { tasks: { select: { displayOrder: true } } },
        });
        if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
        this.requireActiveDiscoveryVisit(visit);
        const created = await this.createEvAssetRecords(
          transaction,
          visit,
          actorUserId,
          correlationId,
          payload.asset,
          true,
        );
        if (created.inspection === undefined)
          throw new Error('Atomic EV charger creation did not create an inspection.');
        const chargePoint = created.asset.evChargePoint;
        if (chargePoint === null)
          throw new Error('Atomic EV charger creation did not create EV data.');
        const result = {
          asset: created.asset,
          chargePoint,
          task: created.task,
          inspection: created.inspection,
          idMap: {
            assetId: { local: payload.localIds.assetId, server: created.asset.id },
            chargePointId: { local: payload.localIds.chargePointId, server: chargePoint.id },
            taskId: { local: payload.localIds.taskId, server: created.task.id },
            inspectionId: { local: payload.localIds.inspectionId, server: created.inspection.id },
          },
        };
        return transaction.syncMutation.create({
          data: {
            organisationId,
            visitId,
            clientMutationId,
            entityType,
            operation: 'ADD_EV_CHARGER',
            payload: jsonValue(payload),
            status: 'APPLIED',
            result: jsonValue(result),
            appliedAt: new Date(),
          },
        });
      });
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) throw error;
      const replayAfterConflict = await this.syncReplay(
        organisationId,
        visitId,
        clientMutationId,
        entityType,
        'ADD_EV_CHARGER',
        payload as unknown as Record<string, unknown>,
      );
      if (replayAfterConflict !== null) return replayAfterConflict;
      throw new DomainError(
        'ASSET_REFERENCE_EXISTS',
        'This asset reference is already used by another asset at this site.',
        409,
      );
    }
  }

  async removeEvAsset(
    organisationId: string,
    visitId: string,
    assetId: string,
    actorUserId: string | undefined,
    correlationId: string,
  ) {
    return this.prisma.$transaction(
      (transaction) =>
        this.removeEvAssetRecords(
          transaction,
          organisationId,
          visitId,
          assetId,
          actorUserId,
          correlationId,
        ),
      { isolationLevel: 'Serializable' },
    );
  }

  async removeEvChargerSync(
    organisationId: string,
    visitId: string,
    clientMutationId: string,
    entityType: string,
    payload: RemoveEvChargerPayload,
    actorUserId: string | undefined,
    correlationId: string,
  ) {
    const replay = await this.syncReplay(
      organisationId,
      visitId,
      clientMutationId,
      entityType,
      'REMOVE_EV_CHARGER',
      payload as unknown as Record<string, unknown>,
    );
    if (replay !== null) return replay;
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const concurrent = await transaction.syncMutation.findUnique({
            where: { organisationId_clientMutationId: { organisationId, clientMutationId } },
          });
          if (concurrent !== null) {
            if (
              concurrent.visitId !== visitId ||
              concurrent.entityType !== entityType ||
              concurrent.operation !== 'REMOVE_EV_CHARGER' ||
              canonicalJson(concurrent.payload) !== canonicalJson(payload)
            )
              throw new DomainError(
                'SYNC_MUTATION_CONFLICT',
                'This client mutation ID has already been used for a different mutation.',
                409,
              );
            return concurrent;
          }
          const removed = await this.removeEvAssetRecords(
            transaction,
            organisationId,
            visitId,
            payload.assetId,
            actorUserId,
            correlationId,
          );
          return transaction.syncMutation.create({
            data: {
              organisationId,
              visitId,
              clientMutationId,
              entityType,
              operation: 'REMOVE_EV_CHARGER',
              payload: jsonValue(payload),
              status: 'APPLIED',
              result: jsonValue(removed),
              appliedAt: new Date(),
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) throw error;
      const replayAfterConflict = await this.syncReplay(
        organisationId,
        visitId,
        clientMutationId,
        entityType,
        'REMOVE_EV_CHARGER',
        payload as unknown as Record<string, unknown>,
      );
      if (replayAfterConflict !== null) return replayAfterConflict;
      throw error;
    }
  }

  private async createEvAssetRecords(
    transaction: Prisma.TransactionClient,
    visit: {
      id: string;
      organisationId: string;
      customerId: string;
      siteId: string;
      tasks: Array<{ displayOrder: number }>;
    },
    actorUserId: string | undefined,
    correlationId: string,
    input: EngineerEvAssetInput,
    startInspection: boolean,
  ) {
    let assetModelId: string | undefined;
    if (input.manufacturer && input.model) {
      const assetModel = await transaction.assetModel.upsert({
        where: {
          manufacturer_model_category: {
            manufacturer: input.manufacturer,
            model: input.model,
            category: 'EV Charger',
          },
        },
        create: {
          manufacturer: input.manufacturer,
          model: input.model,
          category: 'EV Charger',
        },
        update: {},
      });
      assetModelId = assetModel.id;
    }
    const asset = await transaction.asset.create({
      data: {
        organisationId: visit.organisationId,
        customerId: visit.customerId,
        siteId: visit.siteId,
        assetType: 'EV Charger',
        assetReference: input.assetReference,
        displayName: input.displayName,
        status: 'PROPOSED',
        createdDuringVisitId: visit.id,
        ...(input.manufacturer === undefined ? {} : { manufacturer: input.manufacturer }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.serialNumber === undefined ? {} : { serialNumber: input.serialNumber }),
        ...(assetModelId === undefined ? {} : { assetModelId }),
        evChargePoint: {
          create: {
            organisationId: visit.organisationId,
            dcRcdType: input.dcRcdType,
            ...(input.maximumPowerKw === undefined ? {} : { maximumPowerKw: input.maximumPowerKw }),
          },
        },
      },
      include: { evChargePoint: true },
    });
    const task = await transaction.visitTask.create({
      data: {
        organisationId: visit.organisationId,
        visitId: visit.id,
        assetId: asset.id,
        moduleKey: 'ev-charging',
        title: 'EV charger inspection',
        status: startInspection ? 'IN_PROGRESS' : 'PENDING',
        displayOrder: Math.max(-1, ...visit.tasks.map(({ displayOrder }) => displayOrder)) + 1,
      },
    });
    const inspection = startInspection
      ? await transaction.inspection.create({
          data: {
            organisationId: visit.organisationId,
            visitId: visit.id,
            visitTaskId: task.id,
            customerId: visit.customerId,
            siteId: visit.siteId,
            assetId: asset.id,
            moduleKey: 'ev-charging',
            inspectionType: task.title,
            status: 'IN_PROGRESS',
          },
        })
      : undefined;
    if (startInspection)
      await transaction.visit.update({
        where: { id: visit.id },
        data: { status: 'IN_PROGRESS' },
      });
    await transaction.auditEvent.create({
      data: {
        organisationId: visit.organisationId,
        ...(actorUserId === undefined ? {} : { actorUserId }),
        correlationId,
        eventType: 'EngineerEvAssetCreated',
        entityType: 'Asset',
        entityId: asset.id,
        data: {
          visitId: visit.id,
          siteId: visit.siteId,
          taskId: task.id,
          ...(inspection === undefined ? {} : { inspectionId: inspection.id }),
        },
      },
    });
    return { asset, task, inspection };
  }

  private async removeEvAssetRecords(
    transaction: Prisma.TransactionClient,
    organisationId: string,
    visitId: string,
    assetId: string,
    actorUserId: string | undefined,
    correlationId: string,
  ) {
    const visit = await transaction.visit.findFirst({
      where: { id: visitId, organisationId },
      select: {
        id: true,
        siteId: true,
        status: true,
        submittedAt: true,
        completedAt: true,
        archivedAt: true,
      },
    });
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
    this.rejectArchived(visit.archivedAt);
    if (
      visit.submittedAt !== null ||
      visit.completedAt !== null ||
      ['SUBMITTED', 'COMPLETED'].includes(visit.status)
    )
      throw new DomainError(
        'EV_ASSET_REMOVAL_LOCKED',
        'Chargers cannot be removed after the job has been submitted or completed.',
        409,
      );

    const asset = await transaction.asset.findFirst({
      where: { id: assetId, organisationId, siteId: visit.siteId },
      include: {
        visitTasks: {
          include: { inspection: { include: { revisions: { select: { id: true } } } } },
        },
        inspections: { include: { revisions: { select: { id: true } } } },
        proposedChanges: { select: { id: true } },
        evChargePoint: { select: { id: true } },
      },
    });
    if (asset === null)
      throw new DomainError('ASSET_NOT_FOUND', 'The charger was not found at this site.', 404);
    if (
      asset.status !== 'PROPOSED' ||
      asset.createdDuringVisitId !== visitId ||
      !this.isEvAssetType(asset.assetType)
    )
      throw new DomainError(
        'EV_ASSET_NOT_REMOVABLE',
        'Only a provisional charger created during this job can be removed.',
        409,
      );

    const tasks = asset.visitTasks;
    const inspections = asset.inspections;
    const taskIds = tasks.map(({ id }) => id);
    const inspectionIds = inspections.map(({ id }) => id);
    const graphBelongsToVisit =
      tasks.length > 0 &&
      tasks.every(
        (task) =>
          task.visitId === visitId &&
          task.moduleKey === 'ev-charging' &&
          !['SUBMITTED', 'COMPLETED'].includes(task.status),
      ) &&
      inspections.every(
        (inspection) =>
          inspection.visitId === visitId &&
          inspection.moduleKey === 'ev-charging' &&
          inspection.visitTaskId !== null &&
          taskIds.includes(inspection.visitTaskId) &&
          inspection.submittedAt === null &&
          !['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SUPERSEDED'].includes(inspection.status),
      );
    const hasRevisions = inspections.some((inspection) => inspection.revisions.length > 0);
    const documents = await transaction.document.count({
      where: {
        organisationId,
        OR: [
          { entityType: 'Asset', entityId: assetId },
          ...(taskIds.length === 0 ? [] : [{ entityType: 'VisitTask', entityId: { in: taskIds } }]),
          ...(inspectionIds.length === 0
            ? []
            : [{ entityType: 'Inspection', entityId: { in: inspectionIds } }]),
        ],
      },
    });
    if (!graphBelongsToVisit || hasRevisions || asset.proposedChanges.length > 0 || documents > 0)
      throw new DomainError(
        'EV_ASSET_REMOVAL_LOCKED',
        'This charger has inspection history or linked records and can no longer be removed.',
        409,
      );

    const media = await transaction.media.findMany({
      where: {
        organisationId,
        OR: [
          { entityType: 'Asset', entityId: assetId },
          ...(inspectionIds.length === 0
            ? []
            : [{ entityType: 'Inspection', entityId: { in: inspectionIds } }]),
        ],
      },
      select: { id: true, storageKey: true },
    });
    await transaction.media.deleteMany({ where: { id: { in: media.map(({ id }) => id) } } });
    await transaction.entityTag.deleteMany({
      where: { organisationId, entityType: 'Asset', entityId: assetId },
    });
    await transaction.defect.deleteMany({
      where: { organisationId, OR: [{ assetId }, { inspectionId: { in: inspectionIds } }] },
    });
    const deletedInspections = await transaction.inspection.deleteMany({
      where: {
        id: { in: inspectionIds },
        organisationId,
        visitId,
        submittedAt: null,
        status: { notIn: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SUPERSEDED'] },
      },
    });
    const deletedTasks = await transaction.visitTask.deleteMany({
      where: {
        id: { in: taskIds },
        organisationId,
        visitId,
        status: { notIn: ['SUBMITTED', 'COMPLETED'] },
      },
    });
    if (deletedInspections.count !== inspectionIds.length || deletedTasks.count !== taskIds.length)
      throw new DomainError(
        'EV_ASSET_REMOVAL_LOCKED',
        'The charger inspection changed while it was being removed.',
        409,
      );
    if (asset.evChargePoint !== null)
      await transaction.evChargePoint.delete({ where: { id: asset.evChargePoint.id } });
    const deletedAsset = await transaction.asset.deleteMany({
      where: {
        id: assetId,
        organisationId,
        siteId: visit.siteId,
        status: 'PROPOSED',
        createdDuringVisitId: visitId,
      },
    });
    if (deletedAsset.count !== 1)
      throw new DomainError(
        'EV_ASSET_REMOVAL_LOCKED',
        'The charger changed while it was being removed.',
        409,
      );
    await transaction.auditEvent.create({
      data: {
        organisationId,
        ...(actorUserId === undefined ? {} : { actorUserId }),
        correlationId,
        eventType: 'EngineerEvAssetRemoved',
        entityType: 'Asset',
        entityId: assetId,
        data: { visitId, siteId: visit.siteId, taskIds, inspectionIds },
      },
    });
    return {
      deleted: true,
      assetId,
      taskIds,
      inspectionIds,
      storageKeys: media.map(({ storageKey }) => storageKey),
    };
  }

  private async replaceFindings(
    transaction: Prisma.TransactionClient,
    organisationId: string,
    visitId: string,
    findings: VisitFindingInput[],
  ) {
    const visit = await transaction.visit.findFirst({ where: { id: visitId, organisationId } });
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
    this.rejectArchived(visit.archivedAt);

    const mediaOwners = new Map<string, string>();
    for (const finding of findings) {
      for (const mediaId of finding.photoMediaIds) {
        const owner = mediaOwners.get(mediaId);
        if (owner !== undefined && owner !== finding.clientFindingId)
          throw new DomainError(
            'VISIT_FINDING_MEDIA_CROSS_LINKED',
            'An image can only be attached to one finding in a job.',
            422,
          );
        mediaOwners.set(mediaId, finding.clientFindingId);
      }
    }
    if (mediaOwners.size > 0) {
      const media = await transaction.media.findMany({
        where: {
          id: { in: [...mediaOwners.keys()] },
          organisationId,
          entityType: 'Visit',
          entityId: visitId,
          status: 'AVAILABLE',
          mimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] },
        },
      });
      if (media.length !== mediaOwners.size)
        throw new DomainError(
          'VISIT_FINDING_MEDIA_INVALID',
          'Every finding image must be an available image uploaded for this job.',
          422,
        );
      for (const item of media) {
        const expectedTag = `finding:${mediaOwners.get(item.id)!}`;
        const findingTags = item.tags.filter((tag) => tag.startsWith('finding:'));
        if (findingTags.length !== 1 || findingTags[0] !== expectedTag)
          throw new DomainError(
            'VISIT_FINDING_MEDIA_INVALID',
            'A finding image does not belong to the submitted finding.',
            422,
          );
      }
    }

    const submittedIds = findings.map(({ clientFindingId }) => clientFindingId);
    await transaction.visitFinding.deleteMany({
      where: {
        organisationId,
        visitId,
        ...(submittedIds.length === 0 ? {} : { clientFindingId: { notIn: submittedIds } }),
      },
    });
    for (const finding of findings)
      await transaction.visitFinding.upsert({
        where: { visitId_clientFindingId: { visitId, clientFindingId: finding.clientFindingId } },
        create: {
          organisationId,
          visitId,
          ...finding,
          description: finding.description ?? null,
          photoMediaIds: finding.photoMediaIds,
        },
        update: {
          title: finding.title,
          description: finding.description ?? null,
          category: finding.category,
          severity: finding.severity,
          status: finding.status,
          photoMediaIds: finding.photoMediaIds,
        },
      });
    return transaction.visitFinding.findMany({
      where: { organisationId, visitId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  private requireActiveDiscoveryVisit(visit: {
    archivedAt?: Date | null;
    status?: string;
    evDiscoveryEnabled: boolean;
  }) {
    this.rejectArchived(visit.archivedAt ?? null);
    if (!['DRAFT', 'SCHEDULED', 'IN_PROGRESS'].includes(visit.status ?? 'SCHEDULED'))
      throw new DomainError(
        'VISIT_NOT_ACTIVE',
        'Chargers can only be added to an active job.',
        409,
      );
    if (!visit.evDiscoveryEnabled)
      throw new DomainError(
        'EV_DISCOVERY_NOT_ENABLED',
        'Adding chargers is not enabled for this job.',
        403,
      );
  }

  private validateGuestAccess<
    T extends { revokedAt: Date | null; expiresAt: Date; visit: unknown },
  >(access: T | null): asserts access is T {
    if (access === null || access.revokedAt !== null || access.expiresAt <= new Date())
      throw new DomainError(
        'GUEST_LINK_INVALID',
        'This guest link is invalid or has expired.',
        401,
      );
  }

  private async requireVisit(organisationId: string, visitId: string) {
    const visit = await this.prisma.visit.findFirst({ where: { id: visitId, organisationId } });
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
    return visit;
  }

  private rejectArchived(archivedAt: Date | null) {
    if (archivedAt !== null && archivedAt !== undefined)
      throw new DomainError('VISIT_ARCHIVED', 'Archived jobs cannot be changed.', 409);
  }

  private isEvAssetType(assetType: string | undefined): boolean {
    return assetType !== undefined && /\bev\b|electric vehicle|charger/iu.test(assetType);
  }

  private async validateCategory(organisationId: string, categoryId: string | undefined) {
    if (categoryId === undefined) return;
    const category = await this.prisma.jobCategory.findFirst({
      where: {
        id: categoryId,
        status: 'ACTIVE',
        OR: [{ organisationId: null }, { organisationId }],
      },
    });
    if (category === null)
      throw new DomainError(
        'JOB_CATEGORY_INVALID',
        'The selected job category is not available.',
        422,
      );
  }

  private async validateAssignedUser(organisationId: string, assignedUserId: string | undefined) {
    if (assignedUserId === undefined) return;
    const membership = await this.prisma.organisationMembership.findFirst({
      where: { organisationId, userId: assignedUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (membership === null)
      throw new DomainError(
        'JOB_ENGINEER_INVALID',
        'The selected engineer is not an active member of this organisation.',
        422,
      );
  }
}
