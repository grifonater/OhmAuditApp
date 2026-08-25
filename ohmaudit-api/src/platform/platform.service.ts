import type { PrismaClient } from '../generated/prisma/client';
import { moduleCatalogue } from '../entitlements/module-catalogue';
import { DomainError } from '../shared/domain-error';

const EV_CATEGORY = 'EV Charger';

function normalise(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-GB');
}

function modelKey(manufacturer: string, model: string): string {
  return `${normalise(manufacturer)}\u0000${normalise(model)}`;
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

export class PlatformService {
  constructor(private readonly prisma: PrismaClient) {}

  async status(userId: string) {
    const [user, activeSuperadmins] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.user.count({ where: { platformRole: 'PLATFORM_ADMIN', status: 'ACTIVE' } }),
    ]);
    return {
      platformRole: user.platformRole,
      bootstrapAvailable: activeSuperadmins === 0,
    };
  }

  async bootstrap(
    userId: string,
    suppliedToken: string,
    configuredToken: string | undefined,
    correlationId: string,
  ) {
    if (configuredToken === undefined)
      throw new DomainError(
        'SUPERADMIN_BOOTSTRAP_DISABLED',
        'Set SUPERADMIN_BOOTSTRAP_TOKEN in the API environment before claiming the first superadmin account.',
        503,
      );
    if ((await hash(suppliedToken)) !== (await hash(configuredToken)))
      throw new DomainError('SUPERADMIN_BOOTSTRAP_INVALID', 'The bootstrap token is invalid.', 403);
    return this.prisma.$transaction(async (transaction) => {
      if (
        (await transaction.user.count({
          where: { platformRole: 'PLATFORM_ADMIN', status: 'ACTIVE' },
        })) > 0
      )
        throw new DomainError(
          'SUPERADMIN_BOOTSTRAP_COMPLETE',
          'A superadmin already exists. Ask a superadmin to promote this account.',
          409,
        );
      const user = await transaction.user.update({
        where: { id: userId },
        data: { platformRole: 'PLATFORM_ADMIN' },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: userId,
          eventType: 'SuperadminBootstrapped',
          entityType: 'User',
          entityId: userId,
          correlationId,
          data: { email: user.email },
        },
      });
      return user;
    });
  }

  listUsers(query: string) {
    return this.prisma.user.findMany({
      ...(query === ''
        ? {}
        : {
            where: {
              OR: [
                { email: { contains: query, mode: 'insensitive' } },
                { displayName: { contains: query, mode: 'insensitive' } },
              ],
            },
          }),
      select: {
        id: true,
        email: true,
        displayName: true,
        platformRole: true,
        status: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
      orderBy: [{ platformRole: 'desc' }, { email: 'asc' }],
      take: 200,
    });
  }

  async setUserRole(
    actorUserId: string,
    userId: string,
    platformRole: 'USER' | 'PLATFORM_ADMIN',
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({ where: { id: userId } });
      if (target === null) throw new DomainError('USER_NOT_FOUND', 'The user was not found.', 404);
      if (target.platformRole === 'PLATFORM_ADMIN' && platformRole === 'USER') {
        const remaining = await transaction.user.count({
          where: { platformRole: 'PLATFORM_ADMIN', status: 'ACTIVE', id: { not: userId } },
        });
        if (remaining === 0)
          throw new DomainError(
            'LAST_SUPERADMIN',
            'Promote another user before removing the final superadmin.',
            409,
          );
      }
      const user = await transaction.user.update({
        where: { id: userId },
        data: { platformRole },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId,
          eventType: 'UserPlatformRoleChanged',
          entityType: 'User',
          entityId: userId,
          correlationId,
          data: { previousRole: target.platformRole, platformRole },
        },
      });
      return user;
    });
  }

  async listOrganisations(query: string) {
    await this.syncModuleCatalogue();
    return this.prisma.organisation.findMany({
      ...(query === ''
        ? {}
        : {
            where: {
              OR: [
                { name: { contains: query, mode: 'insensitive' as const } },
                { slug: { contains: query, mode: 'insensitive' as const } },
                {
                  brandProfile: {
                    tradingName: { contains: query, mode: 'insensitive' as const },
                  },
                },
              ],
            },
          }),
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        brandProfile: { select: { tradingName: true, registeredName: true } },
        moduleEntitlements: {
          include: { module: true },
          orderBy: { module: { displayOrder: 'asc' } },
        },
        _count: { select: { memberships: true, customers: true, sites: true, assets: true } },
      },
      orderBy: { name: 'asc' },
      take: 250,
    });
  }

  async organisation(organisationId: string) {
    await this.syncModuleCatalogue();
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      include: {
        brandProfile: true,
        moduleEntitlements: { include: { module: true } },
        memberships: {
          include: { user: true, role: true },
          orderBy: { user: { email: 'asc' } },
        },
        roles: { orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] },
      },
    });
    if (organisation === null)
      throw new DomainError('ORGANISATION_NOT_FOUND', 'The organisation was not found.', 404);
    const definitions = await this.prisma.moduleDefinition.findMany({
      where: { active: true },
      orderBy: { displayOrder: 'asc' },
    });
    const entitlementByModule = new Map(
      organisation.moduleEntitlements.map((item) => [item.moduleId, item] as const),
    );
    return {
      ...organisation,
      modules: definitions.map((module) => ({
        ...module,
        entitlement: entitlementByModule.get(module.id) ?? null,
      })),
    };
  }

  async setOrganisationModule(
    actorUserId: string,
    organisationId: string,
    moduleKey: string,
    input: {
      status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
      expiresAt?: Date | null | undefined;
    },
    correlationId: string,
  ) {
    await this.syncModuleCatalogue();
    const module = await this.prisma.moduleDefinition.findUnique({ where: { key: moduleKey } });
    if (module === null)
      throw new DomainError('MODULE_NOT_FOUND', 'The module was not found.', 404);
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const entitlement = await transaction.organisationModuleEntitlement.upsert({
        where: { organisationId_moduleId: { organisationId, moduleId: module.id } },
        create: {
          organisationId,
          moduleId: module.id,
          status: input.status,
          ...(input.status === 'TRIAL'
            ? { trialStartedAt: now, trialEndsAt: input.expiresAt ?? null }
            : { currentPeriodEndsAt: input.expiresAt ?? null }),
        },
        update: {
          status: input.status,
          ...(input.status === 'TRIAL'
            ? {
                trialStartedAt: now,
                trialEndsAt: input.expiresAt ?? null,
                currentPeriodEndsAt: null,
              }
            : { currentPeriodEndsAt: input.expiresAt ?? null, trialEndsAt: null }),
        },
        include: { module: true },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          eventType: 'OrganisationModuleChanged',
          entityType: 'OrganisationModuleEntitlement',
          entityId: entitlement.id,
          correlationId,
          data: { moduleKey, status: input.status, expiresAt: input.expiresAt ?? null },
        },
      });
      return entitlement;
    });
  }

  async setOrganisationMember(
    actorUserId: string,
    organisationId: string,
    membershipId: string,
    input: { roleId?: string | undefined; status?: 'ACTIVE' | 'INACTIVE' | undefined },
    correlationId: string,
  ) {
    const membership = await this.prisma.organisationMembership.findFirst({
      where: { id: membershipId, organisationId },
      include: { user: true, role: true },
    });
    if (membership === null)
      throw new DomainError('MEMBERSHIP_NOT_FOUND', 'The organisation member was not found.', 404);
    if (input.roleId !== undefined) {
      const roleExists = await this.prisma.role.count({
        where: { id: input.roleId, organisationId },
      });
      if (roleExists === 0)
        throw new DomainError('ROLE_NOT_FOUND', 'The selected role was not found.', 404);
    }
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.organisationMembership.update({
        where: { id: membershipId },
        data: {
          ...(input.roleId === undefined ? {} : { roleId: input.roleId }),
          ...(input.status === undefined ? {} : { status: input.status }),
        },
        include: { user: true, role: true },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          eventType: 'OrganisationMemberChangedByPlatform',
          entityType: 'OrganisationMembership',
          entityId: membershipId,
          correlationId,
          data: { roleId: input.roleId, status: input.status },
        },
      });
      return updated;
    });
  }

  async createSupportSession(
    platformAdminUserId: string,
    organisationId: string,
    targetUserId: string,
    reason: string,
    correlationId: string,
  ) {
    const membership = await this.prisma.organisationMembership.findFirst({
      where: { organisationId, userId: targetUserId, status: 'ACTIVE' },
      include: { user: true, organisation: true },
    });
    if (membership === null)
      throw new DomainError(
        'MEMBERSHIP_NOT_FOUND',
        'The active organisation member was not found.',
        404,
      );
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/gu, '');
    const tokenHash = await hash(token);
    const session = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.platformSupportSession.create({
        data: {
          platformAdminUserId,
          organisationId,
          targetUserId,
          tokenHash,
          reason,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId: platformAdminUserId,
          eventType: 'PlatformSupportSessionStarted',
          entityType: 'PlatformSupportSession',
          entityId: created.id,
          correlationId,
          data: { targetUserId, reason, expiresAt: created.expiresAt },
        },
      });
      return created;
    });
    return {
      id: session.id,
      token,
      expiresAt: session.expiresAt,
      target: {
        id: membership.user.id,
        email: membership.user.email,
        displayName: membership.user.displayName,
      },
      organisation: { id: membership.organisation.id, name: membership.organisation.name },
    };
  }

  async revokeSupportSession(
    platformAdminUserId: string,
    sessionId: string,
    correlationId: string,
  ) {
    const session = await this.prisma.platformSupportSession.findFirst({
      where: { id: sessionId, platformAdminUserId },
    });
    if (session === null)
      throw new DomainError('SUPPORT_SESSION_NOT_FOUND', 'The support session was not found.', 404);
    if (session.revokedAt !== null) return session;
    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.platformSupportSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId: session.organisationId,
          actorUserId: platformAdminUserId,
          eventType: 'PlatformSupportSessionEnded',
          entityType: 'PlatformSupportSession',
          entityId: sessionId,
          correlationId,
          data: { targetUserId: session.targetUserId },
        },
      });
      return revoked;
    });
  }

  async requestPasswordReset(
    actorUserId: string,
    organisationId: string,
    userId: string,
    correlationId: string,
    auth: { supabaseUrl: string; publishableKey: string; redirectTo: string },
  ) {
    const membership = await this.prisma.organisationMembership.findFirst({
      where: { organisationId, userId },
      include: { user: true },
    });
    if (membership === null)
      throw new DomainError('MEMBERSHIP_NOT_FOUND', 'The organisation member was not found.', 404);
    const response = await fetch(
      `${auth.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(auth.redirectTo)}`,
      {
        method: 'POST',
        headers: { apikey: auth.publishableKey, 'content-type': 'application/json' },
        body: JSON.stringify({ email: membership.user.email }),
      },
    );
    if (!response.ok)
      throw new DomainError(
        'PASSWORD_RESET_FAILED',
        'Supabase could not send the password reset email. Please try again shortly.',
        503,
      );
    await this.prisma.auditEvent.create({
      data: {
        organisationId,
        actorUserId,
        eventType: 'PasswordResetRequestedByPlatform',
        entityType: 'User',
        entityId: userId,
        correlationId,
        data: { email: membership.user.email },
      },
    });
    return { email: membership.user.email };
  }

  private async syncModuleCatalogue(): Promise<void> {
    for (const [displayOrder, definition] of moduleCatalogue.entries()) {
      await this.prisma.moduleDefinition.upsert({
        where: { key: definition.key },
        create: { ...definition, displayOrder },
        update: {
          name: definition.name,
          description: definition.description,
          displayOrder,
          capabilities: [...definition.capabilities],
          active: true,
        },
      });
    }
  }

  async stockCatalogue(limit: number, query: string) {
    const [groups, models] = await Promise.all([
      this.prisma.asset.groupBy({
        by: ['manufacturer', 'model'],
        where: {
          assetType: { contains: 'EV', mode: 'insensitive' },
          manufacturer: { not: null },
          model: { not: null },
          status: { notIn: ['REMOVED', 'DECOMMISSIONED', 'REPLACED'] },
        },
        _count: { _all: true },
      }),
      this.prisma.assetModel.findMany({
        where: {
          category: { contains: 'EV', mode: 'insensitive' },
          stockImageMediaId: { not: null },
        },
        orderBy: [{ manufacturer: 'asc' }, { model: 'asc' }],
      }),
    ]);
    const mediaIds = [...new Set(models.flatMap((model) => model.stockImageMediaId ?? []))];
    const media = await this.prisma.media.findMany({
      where: { id: { in: mediaIds }, status: 'AVAILABLE' },
      select: { id: true, mimeType: true, createdAt: true },
    });
    const mediaById = new Map(media.map((item) => [item.id, item] as const));
    const availableIds = new Set(media.map((item) => item.id));
    const counts = new Map(
      groups.flatMap((group) =>
        group.manufacturer === null || group.model === null
          ? []
          : [[modelKey(group.manufacturer, group.model), group._count._all] as const],
      ),
    );
    const stockedKeys = new Set(
      models
        .filter(
          (model) => model.stockImageMediaId !== null && availableIds.has(model.stockImageMediaId),
        )
        .map((model) => modelKey(model.manufacturer, model.model)),
    );
    const matchesQuery = (manufacturer: string, model: string) =>
      query === '' || normalise(`${manufacturer} ${model}`).includes(normalise(query));
    const unmatched = groups
      .flatMap((group) =>
        group.manufacturer === null || group.model === null
          ? []
          : [
              {
                manufacturer: group.manufacturer,
                model: group.model,
                count: group._count._all,
              },
            ],
      )
      .filter(
        (item) =>
          !stockedKeys.has(modelKey(item.manufacturer, item.model)) &&
          matchesQuery(item.manufacturer, item.model),
      )
      .sort(
        (left, right) =>
          right.count - left.count || left.manufacturer.localeCompare(right.manufacturer),
      )
      .slice(0, limit);
    const imageGroups = new Map<
      string,
      {
        mediaId: string;
        mimeType: string;
        createdAt: Date;
        models: Array<{ id: string; manufacturer: string; model: string; count: number }>;
      }
    >();
    for (const model of models) {
      const mediaItem =
        model.stockImageMediaId === null ? undefined : mediaById.get(model.stockImageMediaId);
      if (model.stockImageMediaId === null || mediaItem === undefined) continue;
      const group = imageGroups.get(model.stockImageMediaId) ?? {
        mediaId: model.stockImageMediaId,
        mimeType: mediaItem.mimeType,
        createdAt: mediaItem.createdAt,
        models: [],
      };
      group.models.push({
        id: model.id,
        manufacturer: model.manufacturer,
        model: model.model,
        count: counts.get(modelKey(model.manufacturer, model.model)) ?? 0,
      });
      imageGroups.set(model.stockImageMediaId, group);
    }
    return {
      unmatched,
      stocked: [...imageGroups.values()]
        .filter((group) => group.models.some((item) => matchesQuery(item.manufacturer, item.model)))
        .sort(
          (left, right) =>
            Math.max(...right.models.map((item) => item.count)) -
            Math.max(...left.models.map((item) => item.count)),
        )
        .slice(0, limit),
      totalMatchedModels: groups.length,
      availableImageCount: availableIds.size,
    };
  }

  async registerStockImage(
    actorUserId: string,
    input: {
      organisationId: string;
      manufacturer: string;
      models: string[];
      mimeType: string;
      size: number;
    },
  ) {
    if ((await this.prisma.organisation.count({ where: { id: input.organisationId } })) === 0)
      throw new DomainError('ORGANISATION_NOT_FOUND', 'The organisation was not found.', 404);
    const uniqueModels = [
      ...new Map(input.models.map((model) => [normalise(model), model.trim()])).values(),
    ];
    return this.prisma.$transaction(async (transaction) => {
      const assetModels = [];
      for (const modelName of uniqueModels) {
        assetModels.push(
          await transaction.assetModel.upsert({
            where: {
              manufacturer_model_category: {
                manufacturer: input.manufacturer.trim(),
                model: modelName,
                category: EV_CATEGORY,
              },
            },
            create: {
              manufacturer: input.manufacturer.trim(),
              model: modelName,
              category: EV_CATEGORY,
              status: 'PUBLISHED',
            },
            update: { status: 'PUBLISHED' },
          }),
        );
      }
      const media = await transaction.media.create({
        data: {
          organisationId: input.organisationId,
          capturedByUserId: actorUserId,
          storageKey: `platform/ev-stock/${crypto.randomUUID()}`,
          entityType: 'AssetModel',
          entityId: assetModels[0]!.id,
          category: 'ev-stock-image',
          caption: `${input.manufacturer.trim()} ${uniqueModels.join(', ')}`,
          mimeType: input.mimeType,
          size: input.size,
        },
      });
      await transaction.assetModel.updateMany({
        where: { id: { in: assetModels.map(({ id }) => id) } },
        data: { stockImageMediaId: media.id },
      });
      return { media, models: assetModels };
    });
  }

  async addModelsToImage(mediaId: string, manufacturer: string, modelNames: string[]) {
    const media = await this.stockMedia(mediaId, false);
    const models = [];
    for (const modelName of [...new Set(modelNames.map((item) => item.trim()).filter(Boolean))]) {
      models.push(
        await this.prisma.assetModel.upsert({
          where: {
            manufacturer_model_category: {
              manufacturer: manufacturer.trim(),
              model: modelName,
              category: EV_CATEGORY,
            },
          },
          create: {
            manufacturer: manufacturer.trim(),
            model: modelName,
            category: EV_CATEGORY,
            status: 'PUBLISHED',
            stockImageMediaId: media.id,
          },
          update: { status: 'PUBLISHED', stockImageMediaId: media.id },
        }),
      );
    }
    return models;
  }

  async unlinkModel(assetModelId: string) {
    const model = await this.prisma.assetModel.findUnique({ where: { id: assetModelId } });
    if (model === null)
      throw new DomainError('ASSET_MODEL_NOT_FOUND', 'The model was not found.', 404);
    return this.prisma.assetModel.update({
      where: { id: assetModelId },
      data: { stockImageMediaId: null },
    });
  }

  async deleteStockImage(mediaId: string) {
    const media = await this.stockMedia(mediaId, false);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.assetModel.updateMany({
        where: { stockImageMediaId: mediaId },
        data: { stockImageMediaId: null },
      });
      await transaction.media.delete({ where: { id: mediaId } });
    });
    return media;
  }

  stockMedia(mediaId: string, availableOnly = true) {
    return this.prisma.media
      .findFirst({
        where: {
          id: mediaId,
          entityType: 'AssetModel',
          category: 'ev-stock-image',
          ...(availableOnly ? { status: 'AVAILABLE' as const } : {}),
        },
      })
      .then((media) => {
        if (media === null)
          throw new DomainError('STOCK_IMAGE_NOT_FOUND', 'The stock image was not found.', 404);
        return media;
      });
  }

  async stockImageForAsset(assetId: string, organisationId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organisationId },
      include: { assetModel: true },
    });
    if (asset === null) throw new DomainError('ASSET_NOT_FOUND', 'The asset was not found.', 404);
    let mediaId = asset.assetModel?.stockImageMediaId ?? null;
    if (mediaId === null && asset.manufacturer && asset.model) {
      const candidates = await this.prisma.assetModel.findMany({
        where: {
          manufacturer: { equals: asset.manufacturer, mode: 'insensitive' },
          model: { equals: asset.model, mode: 'insensitive' },
          category: { contains: 'EV', mode: 'insensitive' },
          stockImageMediaId: { not: null },
        },
        take: 1,
      });
      mediaId = candidates[0]?.stockImageMediaId ?? null;
    }
    return mediaId === null ? null : this.stockMedia(mediaId);
  }
}
