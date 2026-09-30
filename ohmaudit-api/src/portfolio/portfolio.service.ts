import type { PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

export const portfolioVisibleAssetStatuses = [
  'ACTIVE',
  'INACTIVE',
  'DECOMMISSIONED',
  'REPLACED',
] as const;

export interface InspectionMediaUpdate {
  mediaId: string;
  caption?: string | undefined;
  category?: string | undefined;
  tags?: string[] | undefined;
  sortOrder?: number | undefined;
}

function inspectionMediaUpdateData(input: Omit<InspectionMediaUpdate, 'mediaId'>) {
  return {
    ...(input.caption === undefined ? {} : { caption: input.caption }),
    ...(input.category === undefined ? {} : { category: input.category }),
    ...(input.tags === undefined ? {} : { tags: input.tags }),
    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
  };
}

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function assetReferenceExists(): DomainError {
  return new DomainError(
    'ASSET_REFERENCE_EXISTS',
    'This asset reference is already used by another asset at this site. Enter a different reference.',
    409,
  );
}

export class PortfolioService {
  constructor(private readonly prisma: PrismaClient) {}

  async summary(organisationId: string) {
    const [customers, sites, assets] = await Promise.all([
      this.prisma.customer.count({ where: { organisationId, status: { not: 'ARCHIVED' } } }),
      this.prisma.site.count({ where: { organisationId, status: { not: 'ARCHIVED' } } }),
      this.prisma.asset.count({
        where: {
          organisationId,
          status: { in: [...portfolioVisibleAssetStatuses] },
          customer: { status: { not: 'ARCHIVED' } },
          site: { status: { not: 'ARCHIVED' } },
        },
      }),
    ]);
    return { customers, sites, assets };
  }

  async listCustomers(
    organisationId: string,
    query: string,
    page: number,
    pageSize: number,
    status: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL',
    sort: 'ASC' | 'DESC' = 'ASC',
  ) {
    const where = {
      organisationId,
      status: status === 'ALL' ? { not: 'ARCHIVED' as const } : status,
      ...(query === '' ? {} : { name: { contains: query, mode: 'insensitive' as const } }),
    };
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: {
          _count: {
            select: {
              sites: true,
              assets: { where: { status: { in: [...portfolioVisibleAssetStatuses] } } },
            },
          },
        },
        orderBy: { name: sort === 'DESC' ? 'desc' : 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    const logoIds = items.flatMap(({ logoMediaId }) => (logoMediaId === null ? [] : [logoMediaId]));
    const logos =
      logoIds.length === 0
        ? []
        : await this.prisma.media.findMany({
            where: { organisationId, id: { in: logoIds }, status: 'AVAILABLE' },
          });
    const logoById = new Map(logos.map((logo) => [logo.id, logo]));
    return {
      items: items.map((item) => ({
        ...item,
        logoMedia: item.logoMediaId === null ? null : (logoById.get(item.logoMediaId) ?? null),
      })),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async createCustomer(
    organisationId: string,
    actorUserId: string,
    correlationId: string,
    input: { name: string; reference?: string | undefined; internalNotes?: string | undefined },
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.create({
        data: {
          organisationId,
          name: input.name,
          ...(input.reference === undefined ? {} : { reference: input.reference }),
          ...(input.internalNotes === undefined ? {} : { internalNotes: input.internalNotes }),
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'CustomerCreated',
          entityType: 'Customer',
          entityId: customer.id,
          data: { name: customer.name },
        },
      });
      return customer;
    });
  }

  async updateCustomer(
    organisationId: string,
    customerId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      name?: string | undefined;
      reference?: string | undefined;
      internalNotes?: string | undefined;
    },
  ) {
    await this.requireCustomer(organisationId, customerId);
    const data = Object.fromEntries(
      Object.entries(input).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.update({
        where: { id: customerId },
        data,
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'CustomerUpdated',
          entityType: 'Customer',
          entityId: customerId,
          data,
        },
      });
      return customer;
    });
  }

  async archiveCustomer(
    organisationId: string,
    customerId: string,
    actorUserId: string,
    correlationId: string,
  ) {
    await this.requireCustomer(organisationId, customerId);
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.update({
        where: { id: customerId },
        data: { status: 'ARCHIVED' },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'CustomerArchived',
          entityType: 'Customer',
          entityId: customerId,
          data: { name: customer.name },
        },
      });
      return customer;
    });
  }

  async getCustomer(organisationId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organisationId },
      include: {
        contacts: true,
        sites: {
          include: {
            _count: {
              select: {
                assets: { where: { status: { in: [...portfolioVisibleAssetStatuses] } } },
              },
            },
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            assets: { where: { status: { in: [...portfolioVisibleAssetStatuses] } } },
          },
        },
      },
    });
    if (customer === null)
      throw new DomainError('CUSTOMER_NOT_FOUND', 'The customer was not found.', 404);
    const siteIds = customer.sites.map((site) => site.id);
    const assetIds = (
      await this.prisma.asset.findMany({
        where: { organisationId, customerId },
        select: { id: true },
      })
    ).map((asset) => asset.id);
    const [documents, logoMedia] = await Promise.all([
      this.prisma.document.findMany({
        where: {
          organisationId,
          status: { not: 'ARCHIVED' },
          OR: [
            { entityType: 'Customer', entityId: customerId },
            ...(siteIds.length === 0 ? [] : [{ entityType: 'Site', entityId: { in: siteIds } }]),
            ...(assetIds.length === 0 ? [] : [{ entityType: 'Asset', entityId: { in: assetIds } }]),
          ],
        },
        include: {
          inspectionRevision: {
            select: {
              inspection: {
                select: { visit: { select: { id: true, title: true, scheduledStart: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      customer.logoMediaId === null
        ? Promise.resolve(null)
        : this.prisma.media.findFirst({
            where: { id: customer.logoMediaId, organisationId, status: 'AVAILABLE' },
          }),
    ]);
    return { ...customer, logoMedia, reports: this.groupVisitReports(documents) };
  }

  async setCustomerLogo(
    organisationId: string,
    customerId: string,
    actorUserId: string,
    correlationId: string,
    mediaId: string | null,
  ) {
    await this.requireCustomer(organisationId, customerId);
    if (mediaId !== null) {
      const media = await this.prisma.media.findFirst({
        where: {
          id: mediaId,
          organisationId,
          entityType: 'Customer',
          entityId: customerId,
          category: 'client-logo',
          status: 'AVAILABLE',
        },
      });
      if (media === null)
        throw new DomainError(
          'CLIENT_LOGO_NOT_FOUND',
          'The uploaded client logo was not found.',
          404,
        );
    }
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.update({
        where: { id: customerId },
        data: { logoMediaId: mediaId },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'CustomerLogoChanged',
          entityType: 'Customer',
          entityId: customerId,
          data: { mediaId },
        },
      });
      return customer;
    });
  }

  async createSite(
    organisationId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      customerId: string;
      name: string;
      reference?: string | undefined;
      addressLine1?: string | undefined;
      city?: string | undefined;
      postcode?: string | undefined;
      parkingInformation?: string | undefined;
      accessInstructions?: string | undefined;
      internalNotes?: string | undefined;
    },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, organisationId },
    });
    if (customer === null)
      throw new DomainError('CUSTOMER_NOT_FOUND', 'The customer was not found.', 404);
    return this.prisma.$transaction(async (transaction) => {
      const site = await transaction.site.create({
        data: {
          organisationId,
          customerId: input.customerId,
          name: input.name,
          ...(input.reference === undefined ? {} : { reference: input.reference }),
          ...(input.addressLine1 === undefined ? {} : { addressLine1: input.addressLine1 }),
          ...(input.city === undefined ? {} : { city: input.city }),
          ...(input.postcode === undefined ? {} : { postcode: input.postcode }),
          ...(input.parkingInformation === undefined
            ? {}
            : { parkingInformation: input.parkingInformation }),
          ...(input.accessInstructions === undefined
            ? {}
            : { accessInstructions: input.accessInstructions }),
          ...(input.internalNotes === undefined ? {} : { internalNotes: input.internalNotes }),
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'SiteCreated',
          entityType: 'Site',
          entityId: site.id,
          data: { name: site.name, customerId: input.customerId },
        },
      });
      return site;
    });
  }

  async getSite(organisationId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organisationId },
      include: {
        customer: true,
        siteContacts: {
          where: { contact: { organisationId } },
          include: { contact: true },
          orderBy: [{ primary: 'desc' }, { contact: { name: 'asc' } }],
        },
        assets: {
          where: { status: { not: 'REMOVED' } },
          orderBy: { displayName: 'asc' },
        },
        visits: {
          where: { archivedAt: null },
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            scheduledStart: true,
            scheduledEnd: true,
            guestEngineerName: true,
            assignedUser: { select: { displayName: true } },
            _count: { select: { tasks: true } },
          },
          orderBy: [{ scheduledStart: 'desc' }, { id: 'desc' }],
        },
      },
    });
    if (site === null) throw new DomainError('SITE_NOT_FOUND', 'The site was not found.', 404);
    const assetIds = site.assets.map((asset) => asset.id);
    const [documents, media] = await Promise.all([
      this.prisma.document.findMany({
        where: {
          organisationId,
          status: { not: 'ARCHIVED' },
          OR: [
            { entityType: 'Site', entityId: siteId },
            ...(assetIds.length === 0 ? [] : [{ entityType: 'Asset', entityId: { in: assetIds } }]),
          ],
        },
        include: {
          inspectionRevision: {
            select: {
              inspection: {
                select: { visit: { select: { id: true, title: true, scheduledStart: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.media.findMany({
        where: {
          organisationId,
          entityType: 'Site',
          entityId: siteId,
          category: 'site-image',
          status: 'AVAILABLE',
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);
    const { siteContacts, visits, ...siteFields } = site;
    return {
      ...siteFields,
      contacts: siteContacts.map(({ contact, primary, createdAt }) => ({
        ...contact,
        primary,
        associationCreatedAt: createdAt,
      })),
      jobs: visits.map(({ assignedUser, guestEngineerName, _count, ...visit }) => ({
        ...visit,
        assignedEngineerName: assignedUser?.displayName ?? guestEngineerName,
        taskCount: _count.tasks,
      })),
      media,
      reports: this.groupVisitReports(documents),
    };
  }

  async updateSite(
    organisationId: string,
    siteId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      name?: string | undefined;
      reference?: string | undefined;
      addressLine1?: string | undefined;
      city?: string | undefined;
      postcode?: string | undefined;
      parkingInformation?: string | undefined;
      accessInstructions?: string | undefined;
      internalNotes?: string | undefined;
    },
  ) {
    await this.requireSite(organisationId, siteId);
    const data = Object.fromEntries(
      Object.entries(input).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    return this.prisma.$transaction(async (transaction) => {
      const site = await transaction.site.update({ where: { id: siteId }, data });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'SiteUpdated',
          entityType: 'Site',
          entityId: siteId,
          data,
        },
      });
      return site;
    });
  }

  async createAsset(
    organisationId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      siteId: string;
      assetType: string;
      assetReference: string;
      displayName: string;
      iconKey?: string | null | undefined;
      manufacturer?: string | undefined;
      model?: string | undefined;
      serialNumber?: string | undefined;
      notes?: string | undefined;
    },
  ) {
    const site = await this.prisma.site.findFirst({ where: { id: input.siteId, organisationId } });
    if (site === null) throw new DomainError('SITE_NOT_FOUND', 'The site was not found.', 404);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        let assetModelId: string | undefined;
        if (input.manufacturer !== undefined && input.model !== undefined) {
          const model = await transaction.assetModel.upsert({
            where: {
              manufacturer_model_category: {
                manufacturer: input.manufacturer,
                model: input.model,
                category: input.assetType,
              },
            },
            create: {
              manufacturer: input.manufacturer,
              model: input.model,
              category: input.assetType,
            },
            update: {},
          });
          assetModelId = model.id;
        }
        const asset = await transaction.asset.create({
          data: {
            organisationId,
            customerId: site.customerId,
            siteId: input.siteId,
            assetType: input.assetType,
            assetReference: input.assetReference,
            displayName: input.displayName,
            ...(input.iconKey === undefined ? {} : { iconKey: input.iconKey }),
            ...(input.manufacturer === undefined ? {} : { manufacturer: input.manufacturer }),
            ...(input.model === undefined ? {} : { model: input.model }),
            ...(input.serialNumber === undefined ? {} : { serialNumber: input.serialNumber }),
            ...(input.notes === undefined ? {} : { notes: input.notes }),
            ...(assetModelId === undefined ? {} : { assetModelId }),
            ...(/emergency\s*lighting/iu.test(input.assetType)
              ? { emergencyLightingSystem: { create: { organisationId } } }
              : {}),
          },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'AssetCreated',
            entityType: 'Asset',
            entityId: asset.id,
            data: { assetReference: asset.assetReference, siteId: input.siteId },
          },
        });
        return asset;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) throw assetReferenceExists();
      throw error;
    }
  }

  async updateAssetStatus(
    organisationId: string,
    assetId: string,
    actorUserId: string,
    correlationId: string,
    status: 'PROPOSED' | 'ACTIVE' | 'INACTIVE' | 'REMOVED' | 'DECOMMISSIONED' | 'REPLACED',
    replacementAssetId?: string,
  ) {
    const existing = await this.prisma.asset.findFirst({ where: { id: assetId, organisationId } });
    if (existing === null)
      throw new DomainError('ASSET_NOT_FOUND', 'The asset was not found.', 404);
    if (
      replacementAssetId !== undefined &&
      (await this.prisma.asset.findFirst({ where: { id: replacementAssetId, organisationId } })) ===
        null
    )
      throw new DomainError(
        'REPLACEMENT_ASSET_NOT_FOUND',
        'The replacement asset was not found.',
        422,
      );
    return this.prisma.$transaction(async (transaction) => {
      const asset = await transaction.asset.update({
        where: { id: assetId },
        data: {
          status,
          ...(replacementAssetId === undefined ? {} : { replacementAssetId }),
          ...(status === 'DECOMMISSIONED' ? { decommissionedAt: new Date() } : {}),
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'AssetLifecycleChanged',
          entityType: 'Asset',
          entityId: assetId,
          data: { previousStatus: existing.status, status, replacementAssetId },
        },
      });
      return asset;
    });
  }

  async updateAsset(
    organisationId: string,
    assetId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      assetType?: string | undefined;
      assetReference?: string | undefined;
      displayName?: string | undefined;
      iconKey?: string | null | undefined;
      manufacturer?: string | undefined;
      model?: string | undefined;
      serialNumber?: string | undefined;
      notes?: string | undefined;
    },
  ) {
    const existing = await this.requireAsset(organisationId, assetId);
    const data = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const manufacturer = input.manufacturer ?? existing.manufacturer;
        const modelName = input.model ?? existing.model;
        const category = input.assetType ?? existing.assetType;
        let assetModelId = existing.assetModelId;
        if (manufacturer && modelName) {
          const assetModel = await transaction.assetModel.upsert({
            where: {
              manufacturer_model_category: { manufacturer, model: modelName, category },
            },
            create: { manufacturer, model: modelName, category },
            update: {},
          });
          assetModelId = assetModel.id;
        }
        const asset = await transaction.asset.update({
          where: { id: assetId },
          data: { ...data, assetModelId },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'AssetUpdated',
            entityType: 'Asset',
            entityId: assetId,
            data,
          },
        });
        return asset;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) throw assetReferenceExists();
      throw error;
    }
  }

  async getAsset(organisationId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organisationId },
      include: {
        customer: { select: { id: true, name: true, reference: true, status: true } },
        site: {
          select: {
            id: true,
            name: true,
            reference: true,
            status: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            county: true,
            postcode: true,
            countryCode: true,
          },
        },
        assetModel: true,
        replacementAsset: {
          select: {
            id: true,
            assetReference: true,
            displayName: true,
            assetType: true,
            status: true,
          },
        },
        replacedAssets: {
          where: { organisationId },
          select: {
            id: true,
            assetReference: true,
            displayName: true,
            assetType: true,
            status: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        },
        createdDuringVisit: {
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            scheduledStart: true,
            scheduledEnd: true,
          },
        },
        inspections: {
          where: { organisationId },
          select: {
            id: true,
            visitId: true,
            visitTaskId: true,
            moduleKey: true,
            inspectionType: true,
            status: true,
            currentRevisionNumber: true,
            effectiveDate: true,
            submittedAt: true,
            reviewedAt: true,
            approvedAt: true,
            createdAt: true,
            updatedAt: true,
            visit: {
              select: {
                id: true,
                reference: true,
                title: true,
                status: true,
                scheduledStart: true,
                scheduledEnd: true,
              },
            },
            revisions: {
              where: { organisationId },
              select: {
                id: true,
                revisionNumber: true,
                createdAt: true,
                createdByUserId: true,
                media: {
                  where: { organisationId },
                  include: { media: true },
                  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
                },
              },
              orderBy: [{ revisionNumber: 'desc' }, { id: 'desc' }],
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        defects: {
          where: { organisationId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
    if (asset === null) throw new DomainError('ASSET_NOT_FOUND', 'The asset was not found.', 404);

    const revisionIds = asset.inspections.flatMap((inspection) =>
      inspection.revisions.map((revision) => revision.id),
    );
    const [media, documents] = await Promise.all([
      this.prisma.media.findMany({
        where: { organisationId, entityType: 'Asset', entityId: assetId, status: 'AVAILABLE' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.document.findMany({
        where: {
          organisationId,
          status: { not: 'ARCHIVED' },
          OR: [
            { entityType: 'Asset', entityId: assetId },
            ...(revisionIds.length === 0 ? [] : [{ inspectionRevisionId: { in: revisionIds } }]),
          ],
        },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          title: true,
          category: true,
          mediaId: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          inspectionRevisionId: true,
          templateKey: true,
          templateVersion: true,
          reportReference: true,
          overallOutcome: true,
          inspectionRevision: {
            select: {
              revisionNumber: true,
              inspection: {
                select: { id: true, moduleKey: true, inspectionType: true, status: true },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return { ...asset, media, documents };
  }

  async addContact(
    organisationId: string,
    input: {
      customerId?: string | undefined;
      siteId?: string | undefined;
      name: string;
      role?: string | undefined;
      email?: string | undefined;
      telephone?: string | undefined;
      mobile?: string | undefined;
      notes?: string | undefined;
    },
  ) {
    const [customer, site] = await Promise.all([
      input.customerId === undefined
        ? Promise.resolve(null)
        : this.prisma.customer.findFirst({ where: { id: input.customerId, organisationId } }),
      input.siteId === undefined
        ? Promise.resolve(null)
        : this.prisma.site.findFirst({ where: { id: input.siteId, organisationId } }),
    ]);
    if (input.customerId !== undefined && customer === null)
      throw new DomainError('CUSTOMER_NOT_FOUND', 'The customer was not found.', 404);
    if (input.siteId !== undefined && site === null)
      throw new DomainError('SITE_NOT_FOUND', 'The site was not found.', 404);
    if (customer !== null && site !== null && customer.id !== site.customerId)
      throw new DomainError(
        'CONTACT_CUSTOMER_MISMATCH',
        'The contact customer does not own the selected site.',
        422,
      );
    const contact = await this.prisma.contact.create({
      data: {
        organisationId,
        name: input.name,
        ...(customer === null && site === null
          ? {}
          : { customerId: customer === null ? site!.customerId : customer.id }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.telephone === undefined ? {} : { telephone: input.telephone }),
        ...(input.mobile === undefined ? {} : { mobile: input.mobile }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(site === null ? {} : { siteContacts: { create: { siteId: site.id } } }),
      },
      include: {
        siteContacts: { include: { site: { select: { id: true, name: true, reference: true } } } },
      },
    });
    const { siteContacts, ...contactFields } = contact;
    return {
      ...contactFields,
      sites: siteContacts.map(({ site: linkedSite, primary, createdAt }) => ({
        ...linkedSite,
        primary,
        createdAt,
      })),
    };
  }

  async listContacts(organisationId: string, query: string) {
    const contacts = await this.prisma.contact.findMany({
      where: {
        organisationId,
        ...(query === ''
          ? {}
          : {
              OR: ['name', 'role', 'email', 'telephone', 'mobile'].map((field) => ({
                [field]: { contains: query, mode: 'insensitive' as const },
              })),
            }),
      },
      include: {
        customer: { select: { id: true, name: true, reference: true } },
        siteContacts: {
          where: { site: { organisationId } },
          include: {
            site: {
              select: { id: true, customerId: true, name: true, reference: true, status: true },
            },
          },
          orderBy: [{ primary: 'desc' }, { site: { name: 'asc' } }],
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return contacts.map(({ siteContacts, ...contact }) => ({
      ...contact,
      sites: siteContacts.map(({ site, primary, createdAt }) => ({ ...site, primary, createdAt })),
    }));
  }

  async linkContact(organisationId: string, siteId: string, contactId: string) {
    const [site, contact] = await Promise.all([
      this.prisma.site.findFirst({ where: { id: siteId, organisationId } }),
      this.prisma.contact.findFirst({ where: { id: contactId, organisationId } }),
    ]);
    if (site === null) throw new DomainError('SITE_NOT_FOUND', 'The site was not found.', 404);
    if (contact === null)
      throw new DomainError('CONTACT_NOT_FOUND', 'The contact was not found.', 404);
    const existing = await this.prisma.siteContact.findUnique({
      where: { siteId_contactId: { siteId, contactId } },
    });
    if (existing !== null)
      throw new DomainError(
        'SITE_CONTACT_EXISTS',
        'The contact is already linked to the site.',
        409,
      );
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (contact.customerId === null)
          await transaction.contact.update({
            where: { id: contactId },
            data: { customerId: site.customerId },
          });
        return transaction.siteContact.create({
          data: { siteId, contactId },
          include: { contact: true },
        });
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error))
        throw new DomainError(
          'SITE_CONTACT_EXISTS',
          'The contact is already linked to the site.',
          409,
        );
      throw error;
    }
  }

  async unlinkContact(organisationId: string, siteId: string, contactId: string) {
    const [site, contact] = await Promise.all([
      this.prisma.site.findFirst({ where: { id: siteId, organisationId }, select: { id: true } }),
      this.prisma.contact.findFirst({
        where: { id: contactId, organisationId },
        select: { id: true },
      }),
    ]);
    if (site === null) throw new DomainError('SITE_NOT_FOUND', 'The site was not found.', 404);
    if (contact === null)
      throw new DomainError('CONTACT_NOT_FOUND', 'The contact was not found.', 404);
    const deleted = await this.prisma.siteContact.deleteMany({ where: { siteId, contactId } });
    if (deleted.count === 0)
      throw new DomainError(
        'SITE_CONTACT_NOT_FOUND',
        'The contact is not linked to the site.',
        404,
      );
  }

  createTag(organisationId: string, input: { name: string; colour: string }) {
    return this.prisma.tag.create({ data: { organisationId, ...input } });
  }
  listTags(organisationId: string) {
    return this.prisma.tag.findMany({ where: { organisationId }, orderBy: { name: 'asc' } });
  }

  async addDocument(
    organisationId: string,
    input: { entityType: string; entityId: string; title: string; category: string },
  ) {
    await this.requireEntity(organisationId, input.entityType, input.entityId);
    return this.prisma.document.create({ data: { organisationId, ...input } });
  }

  async registerMedia(
    organisationId: string,
    actorUserId: string | undefined,
    input: {
      entityType: string;
      entityId: string;
      category: string;
      caption?: string | undefined;
      originalFilename?: string | undefined;
      tags?: string[] | undefined;
      sortOrder?: number | undefined;
      mimeType: string;
      size: number;
    },
  ) {
    await this.requireEntity(organisationId, input.entityType, input.entityId);
    return this.prisma.media.create({
      data: {
        organisationId,
        ...(actorUserId === undefined ? {} : { capturedByUserId: actorUserId }),
        storageKey: `${organisationId}/${input.entityType.toLowerCase()}/${crypto.randomUUID()}`,
        entityType: input.entityType,
        entityId: input.entityId,
        category: input.category,
        mimeType: input.mimeType,
        size: input.size,
        ...(input.caption === undefined ? {} : { caption: input.caption }),
        ...(input.originalFilename === undefined
          ? {}
          : { originalFilename: input.originalFilename }),
        ...(input.tags === undefined ? {} : { tags: input.tags }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      },
    });
  }

  async getMedia(organisationId: string, mediaId: string) {
    const media = await this.prisma.media.findFirst({ where: { id: mediaId, organisationId } });
    if (media === null) throw new DomainError('MEDIA_NOT_FOUND', 'The media was not found.', 404);
    return media;
  }

  markMediaAvailable(mediaId: string) {
    return this.prisma.media.update({ where: { id: mediaId }, data: { status: 'AVAILABLE' } });
  }

  async assertMediaMutable(organisationId: string, mediaIds: string | string[]) {
    const ids = Array.isArray(mediaIds) ? mediaIds : [mediaIds];
    const historicalReference =
      typeof this.prisma.inspectionRevisionMedia?.findFirst === 'function'
        ? await this.prisma.inspectionRevisionMedia.findFirst({
            where: { organisationId, mediaId: { in: ids } },
            select: { mediaId: true },
          })
        : null;
    if (historicalReference !== null)
      throw new DomainError(
        'MEDIA_HISTORY_PROTECTED',
        'This image is part of an inspection revision and cannot be changed.',
        409,
      );
  }

  async updateInspectionMedia(
    organisationId: string,
    mediaId: string,
    input: {
      caption?: string | undefined;
      category?: string | undefined;
      tags?: string[] | undefined;
      sortOrder?: number | undefined;
    },
  ) {
    const media = await this.getMedia(organisationId, mediaId);
    if (media.entityType !== 'Inspection')
      throw new DomainError(
        'MEDIA_NOT_INSPECTION',
        'Only inspection images can be edited here.',
        422,
      );
    await this.assertMediaMutable(organisationId, media.id);
    return this.prisma.media.update({
      where: { id: media.id },
      data: inspectionMediaUpdateData(input),
    });
  }

  async bulkUpdateInspectionMedia(
    organisationId: string,
    inspectionId: string,
    updates: InspectionMediaUpdate[],
    requireAvailable = false,
  ) {
    await this.assertMediaMutable(
      organisationId,
      updates.map(({ mediaId }) => mediaId),
    );
    return this.prisma.$transaction(async (transaction) => {
      const ids = updates.map(({ mediaId }) => mediaId);
      const scope = {
        organisationId,
        entityType: 'Inspection',
        entityId: inspectionId,
        id: { in: ids },
        ...(requireAvailable ? { status: 'AVAILABLE' as const } : {}),
      };
      const existing = await transaction.media.findMany({ where: scope });
      if (existing.length !== updates.length)
        throw new DomainError('MEDIA_NOT_FOUND', 'The media was not found.', 404);

      for (const { mediaId, ...input } of updates) {
        const result = await transaction.media.updateMany({
          where: { ...scope, id: mediaId },
          data: inspectionMediaUpdateData(input),
        });
        if (result.count !== 1)
          throw new DomainError('MEDIA_NOT_FOUND', 'The media was not found.', 404);
      }

      const media = await transaction.media.findMany({ where: scope });
      if (media.length !== updates.length)
        throw new DomainError('MEDIA_NOT_FOUND', 'The media was not found.', 404);
      const mediaById = new Map(media.map((item) => [item.id, item]));
      return updates.map(({ mediaId }) => mediaById.get(mediaId)!);
    });
  }

  async deleteMedia(organisationId: string, mediaId: string) {
    const media = await this.getMedia(organisationId, mediaId);
    const historicalReference =
      typeof this.prisma.inspectionRevisionMedia?.findFirst === 'function'
        ? await this.prisma.inspectionRevisionMedia.findFirst({
            where: { organisationId, mediaId },
            select: { mediaId: true },
          })
        : null;
    if (historicalReference !== null)
      throw new DomainError(
        'MEDIA_HISTORY_PROTECTED',
        'This image is part of an inspection revision and cannot be deleted.',
        409,
      );
    await this.prisma.$transaction(async (transaction) => {
      await transaction.customer.updateMany({
        where: { organisationId, logoMediaId: mediaId },
        data: { logoMediaId: null },
      });
      if (media.entityType === 'Site' && media.isPrimary) {
        await transaction.site.updateMany({
          where: { organisationId, mainPhotoMediaId: mediaId },
          data: { mainPhotoMediaId: null },
        });
      }
      await transaction.media.deleteMany({ where: { id: mediaId, organisationId } });
    });
    return media;
  }

  async deleteInspectionMedia(
    organisationId: string,
    inspectionId: string,
    assetId: string | null,
    mediaId: string,
  ) {
    const media = await this.prisma.media.findFirst({
      where: {
        id: mediaId,
        organisationId,
        OR: [
          { entityType: 'Inspection', entityId: inspectionId },
          ...(assetId === null
            ? []
            : [
                {
                  entityType: 'Asset',
                  entityId: assetId,
                  tags: { has: `inspection:${inspectionId}` },
                },
              ]),
        ],
      },
    });
    if (media === null)
      throw new DomainError(
        'INSPECTION_MEDIA_NOT_FOUND',
        'The media was not uploaded for this inspection.',
        404,
      );
    const historicalReference =
      typeof this.prisma.inspectionRevisionMedia?.findFirst === 'function'
        ? await this.prisma.inspectionRevisionMedia.findFirst({
            where: { organisationId, mediaId: media.id },
            select: { mediaId: true },
          })
        : null;
    if (historicalReference !== null)
      throw new DomainError(
        'MEDIA_HISTORY_PROTECTED',
        'This image is part of an inspection revision and cannot be deleted.',
        409,
      );
    await this.prisma.$transaction(async (transaction) => {
      const linkedDefects = await transaction.defect.findMany({
        where: { organisationId, inspectionId },
        select: { id: true, photoMediaIds: true },
      });
      for (const defect of linkedDefects) {
        const photoMediaIds = Array.isArray(defect.photoMediaIds)
          ? defect.photoMediaIds.filter((id) => id !== media.id)
          : [];
        if (
          Array.isArray(defect.photoMediaIds) &&
          photoMediaIds.length !== defect.photoMediaIds.length
        )
          await transaction.defect.update({
            where: { id: defect.id },
            data: { photoMediaIds },
          });
      }
      await transaction.media.deleteMany({ where: { id: media.id, organisationId } });
    });
    return media;
  }

  async setSitePhotoPrimary(organisationId: string, siteId: string, mediaId: string | null) {
    await this.requireSite(organisationId, siteId);
    if (mediaId !== null) {
      const media = await this.prisma.media.findFirst({
        where: {
          id: mediaId,
          organisationId,
          entityType: 'Site',
          entityId: siteId,
          category: 'site-image',
          status: 'AVAILABLE',
        },
      });
      if (media === null) throw new DomainError('MEDIA_NOT_FOUND', 'The media was not found.', 404);
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.media.updateMany({
        where: { organisationId, entityType: 'Site', entityId: siteId, isPrimary: true },
        data: { isPrimary: false },
      });
      if (mediaId !== null) {
        await transaction.media.update({
          where: { id: mediaId },
          data: { isPrimary: true },
        });
      }
      await transaction.site.update({
        where: { id: siteId },
        data: { mainPhotoMediaId: mediaId },
      });
    });
  }

  private groupVisitReports<
    T extends {
      id: string;
      entityType: string;
      entityId: string;
      title: string;
      category: string;
      createdAt: Date;
      issuedAt: Date | null;
      inspectionRevisionId: string | null;
      mediaId: string | null;
      inspectionRevision: {
        inspection: { visit: { id: string; title: string; scheduledStart: Date } | null };
      } | null;
    },
  >(documents: T[]) {
    const standalone = documents.filter(({ inspectionRevision }) => {
      const visit = inspectionRevision?.inspection.visit;
      return visit === null || visit === undefined;
    });
    const groups = new Map<string, T[]>();
    for (const document of documents) {
      const visit = document.inspectionRevision?.inspection.visit;
      if (visit === null || visit === undefined) continue;
      groups.set(visit.id, [...(groups.get(visit.id) ?? []), document]);
    }
    const visitReports = [...groups.values()].map((items) => {
      const visit = items[0]!.inspectionRevision!.inspection.visit!;
      const latest = items.reduce((current, item) =>
        item.createdAt > current.createdAt ? item : current,
      );
      return {
        id: `visit-${visit.id}`,
        entityType: 'Visit',
        entityId: visit.id,
        title: visit.title,
        category: 'Combined job report',
        mediaId: null,
        inspectionRevisionId: null,
        issuedAt: latest.issuedAt,
        createdAt: latest.createdAt,
        reportType: 'VISIT' as const,
        visitId: visit.id,
        documentCount: items.length,
      };
    });
    return [...standalone, ...visitReports].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
  }

  async search(organisationId: string, query: string) {
    const [customers, sites, assets, documents] = await Promise.all([
      this.prisma.customer.findMany({
        where: { organisationId, name: { contains: query, mode: 'insensitive' } },
        take: 10,
      }),
      this.prisma.site.findMany({
        where: {
          organisationId,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { postcode: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          customer: { select: { id: true, name: true } },
          _count: {
            select: {
              assets: { where: { status: { in: [...portfolioVisibleAssetStatuses] } } },
            },
          },
        },
        take: 10,
      }),
      this.prisma.asset.findMany({
        where: {
          organisationId,
          status: { notIn: ['PROPOSED', 'REMOVED'] },
          OR: [
            { assetReference: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
            { serialNumber: { contains: query, mode: 'insensitive' } },
            { manufacturer: { contains: query, mode: 'insensitive' } },
            { model: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 20,
      }),
      this.prisma.document.findMany({
        where: { organisationId, title: { contains: query, mode: 'insensitive' } },
        take: 10,
      }),
    ]);
    return { customers, sites, assets, documents };
  }

  async timeline(organisationId: string, entityType: string, entityId: string) {
    let where: object = { organisationId, entityType, entityId };
    if (entityType === 'Visit') {
      const visit = await this.prisma.visit.findFirst({
        where: { id: entityId, organisationId },
        select: {
          inspections: { select: { id: true } },
          tasks: { select: { assetId: true } },
          rams: { select: { rams: { select: { id: true } } } },
        },
      });
      if (visit === null) return [];
      where = {
        organisationId,
        OR: [
          { entityType: 'Visit', entityId },
          ...visit.inspections.map((inspection) => ({
            entityType: 'Inspection',
            entityId: inspection.id,
          })),
          ...visit.tasks.flatMap((task) =>
            task.assetId === null ? [] : [{ entityType: 'Asset', entityId: task.assetId }],
          ),
          ...visit.rams.map(({ rams }) => ({ entityType: 'Rams', entityId: rams.id })),
        ],
      };
    }
    return this.prisma.auditEvent.findMany({
      where,
      include: { actor: { select: { displayName: true, email: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  private async requireEntity(
    organisationId: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    const exists =
      entityType === 'Organisation'
        ? entityId === organisationId
          ? await this.prisma.organisation.findFirst({ where: { id: entityId } })
          : null
        : entityType === 'Visit'
          ? await this.prisma.visit.findFirst({ where: { id: entityId, organisationId } })
          : entityType === 'Customer'
            ? await this.prisma.customer.findFirst({ where: { id: entityId, organisationId } })
            : entityType === 'Site'
              ? await this.prisma.site.findFirst({ where: { id: entityId, organisationId } })
              : entityType === 'Asset'
                ? await this.prisma.asset.findFirst({ where: { id: entityId, organisationId } })
                : entityType === 'Inspection'
                  ? await this.prisma.inspection.findFirst({
                      where: { id: entityId, organisationId },
                    })
                  : entityType === 'EmergencyLightingFitting'
                    ? await this.prisma.emergencyLightingFitting.findFirst({
                        where: { id: entityId, organisationId },
                      })
                    : entityType === 'EmergencyLightingLocation'
                      ? await this.prisma.emergencyLightingLocation.findFirst({
                          where: { id: entityId, organisationId },
                        })
                      : entityType === 'EmergencyLightingDevice'
                        ? await this.prisma.emergencyLightingDevice.findFirst({
                            where: { id: entityId, organisationId },
                          })
                        : null;
    if (exists === null)
      throw new DomainError('ENTITY_NOT_FOUND', 'The related record was not found.', 404);
  }

  private async requireCustomer(organisationId: string, customerId: string): Promise<void> {
    if (
      (await this.prisma.customer.findFirst({ where: { id: customerId, organisationId } })) === null
    )
      throw new DomainError('CUSTOMER_NOT_FOUND', 'The customer was not found.', 404);
  }

  private async requireSite(organisationId: string, siteId: string): Promise<void> {
    if ((await this.prisma.site.findFirst({ where: { id: siteId, organisationId } })) === null)
      throw new DomainError('SITE_NOT_FOUND', 'The site was not found.', 404);
  }

  private async requireAsset(organisationId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, organisationId } });
    if (asset === null) throw new DomainError('ASSET_NOT_FOUND', 'The asset was not found.', 404);
    return asset;
  }
}
