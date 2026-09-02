import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
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
    input: {
      assetReference: string;
      displayName: string;
      manufacturer?: string | undefined;
      model?: string | undefined;
      serialNumber?: string | undefined;
      maximumPowerKw?: number | undefined;
      dcRcdType: 'TYPE_B' | 'RDC_DD' | 'NONE';
    },
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
        (media.entityType === 'Inspection' && inspectionIds.has(media.entityId)));
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
    const existing = await this.prisma.syncMutation.findUnique({
      where: { organisationId_clientMutationId: { organisationId, clientMutationId } },
    });
    if (existing !== null) return existing;
    await this.detail(organisationId, visitId);
    return this.prisma.syncMutation.create({
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
