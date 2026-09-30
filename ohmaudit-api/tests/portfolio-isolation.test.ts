import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { PortfolioService } from '../src/portfolio/portfolio.service';

describe('Portfolio tenant isolation', () => {
  it('refuses to edit a site outside the active organisation', async () => {
    let receivedWhere: unknown;
    const prisma = {
      site: {
        findFirst: (input: { where: unknown }) => {
          receivedWhere = input.where;
          return Promise.resolve(null);
        },
      },
    } as unknown as PrismaClient;
    const service = new PortfolioService(prisma);

    await expect(
      service.updateSite('organisation-b', 'site-from-a', 'user-b', 'correlation-id', {
        name: 'Changed name',
      }),
    ).rejects.toMatchObject({ code: 'SITE_NOT_FOUND', status: 404 });
    expect(receivedWhere).toEqual({ id: 'site-from-a', organisationId: 'organisation-b' });
  });

  it('scopes every dashboard summary count to the active organisation', async () => {
    const receivedWhere: unknown[] = [];
    const prisma = {
      customer: {
        count: (input: { where: unknown }) => {
          receivedWhere.push(input.where);
          return Promise.resolve(4);
        },
      },
      site: {
        count: (input: { where: unknown }) => {
          receivedWhere.push(input.where);
          return Promise.resolve(7);
        },
      },
      asset: {
        count: (input: { where: unknown }) => {
          receivedWhere.push(input.where);
          return Promise.resolve(12);
        },
      },
    } as unknown as PrismaClient;

    const service = new PortfolioService(prisma);
    await expect(service.summary('organisation-a')).resolves.toEqual({
      customers: 4,
      sites: 7,
      assets: 12,
    });
    expect(receivedWhere).toEqual([
      { organisationId: 'organisation-a', status: { not: 'ARCHIVED' } },
      { organisationId: 'organisation-a', status: { not: 'ARCHIVED' } },
      {
        organisationId: 'organisation-a',
        status: { in: ['ACTIVE', 'INACTIVE', 'DECOMMISSIONED', 'REPLACED'] },
        customer: { status: { not: 'ARCHIVED' } },
        site: { status: { not: 'ARCHIVED' } },
      },
    ]);
  });

  it('excludes proposed and removed assets from customer list totals', async () => {
    let receivedInclude: unknown;
    const prisma = {
      customer: {
        findMany: (input: { include: unknown }) => {
          receivedInclude = input.include;
          return Promise.resolve([]);
        },
        count: () => Promise.resolve(0),
      },
    } as unknown as PrismaClient;

    const service = new PortfolioService(prisma);
    await expect(service.listCustomers('organisation-a', '', 1, 20)).resolves.toMatchObject({
      items: [],
      total: 0,
    });
    expect(receivedInclude).toEqual({
      _count: {
        select: {
          sites: true,
          assets: {
            where: {
              status: { in: ['ACTIVE', 'INACTIVE', 'DECOMMISSIONED', 'REPLACED'] },
            },
          },
        },
      },
    });
  });

  it('paginates, filters, and sorts the client directory on the server', async () => {
    let receivedQuery: unknown;
    const prisma = {
      customer: {
        findMany: (input: unknown) => {
          receivedQuery = input;
          return Promise.resolve([]);
        },
        count: () => Promise.resolve(42),
      },
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).listCustomers(
        'organisation-a',
        'energy',
        2,
        20,
        'ACTIVE',
        'DESC',
      ),
    ).resolves.toMatchObject({ page: 2, pageSize: 20, total: 42, pageCount: 3 });
    expect(receivedQuery).toMatchObject({
      where: {
        organisationId: 'organisation-a',
        status: 'ACTIVE',
        name: { contains: 'energy', mode: 'insensitive' },
      },
      orderBy: { name: 'desc' },
      skip: 20,
      take: 20,
    });
  });

  it('always scopes customer retrieval by organisation and returns a non-disclosing 404', async () => {
    let receivedWhere: unknown;
    let receivedInclude: unknown;
    const prisma = {
      customer: {
        findFirst: (input: { where: unknown; include: unknown }) => {
          receivedWhere = input.where;
          receivedInclude = input.include;
          return Promise.resolve(null);
        },
      },
    } as unknown as PrismaClient;
    const service = new PortfolioService(prisma);
    await expect(service.getCustomer('organisation-b', 'customer-from-a')).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
      status: 404,
    });
    expect(receivedWhere).toEqual({ id: 'customer-from-a', organisationId: 'organisation-b' });
    expect(receivedInclude).toMatchObject({
      sites: {
        include: {
          _count: {
            select: {
              assets: {
                where: {
                  status: { in: ['ACTIVE', 'INACTIVE', 'DECOMMISSIONED', 'REPLACED'] },
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          assets: {
            where: {
              status: { in: ['ACTIVE', 'INACTIVE', 'DECOMMISSIONED', 'REPLACED'] },
            },
          },
        },
      },
    });
  });

  it('returns a useful conflict when an asset reference is already in use at the site', async () => {
    const prisma = {
      site: {
        findFirst: () => Promise.resolve({ id: 'site-a', customerId: 'customer-a' }),
      },
      $transaction: () =>
        Promise.reject(
          Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
            meta: { target: ['organisation_id', 'site_id', 'asset_reference'] },
          }),
        ),
    } as unknown as PrismaClient;
    const service = new PortfolioService(prisma);

    await expect(
      service.createAsset('organisation-a', 'user-a', 'correlation-id', {
        siteId: 'site-a',
        assetType: 'EV Charger',
        assetReference: 'EV-001',
        displayName: 'Front charger',
      }),
    ).rejects.toMatchObject({
      code: 'ASSET_REFERENCE_EXISTS',
      status: 409,
      message:
        'This asset reference is already used by another asset at this site. Enter a different reference.',
    });
  });

  it('duplicates complete EV charger supplies, connectors, and mappings', async () => {
    const assetInputs: unknown[] = [];
    const chargerInputs: unknown[] = [];
    const connectorInputs: unknown[] = [];
    const assetCreate = vi.fn((input: unknown) => {
      assetInputs.push(input);
      return Promise.resolve({
        id: 'asset-copy',
        siteId: 'site-a',
        assetReference: 'EV-002',
      });
    });
    const chargerCreate = vi.fn((input: unknown) => {
      chargerInputs.push(input);
      return Promise.resolve({ id: 'charger-copy' });
    });
    const supplyCreate = vi
      .fn()
      .mockResolvedValueOnce({ id: 'supply-copy-a' })
      .mockResolvedValueOnce({ id: 'supply-copy-b' });
    const connectorCreate = vi.fn((input: unknown) => {
      connectorInputs.push(input);
      return Promise.resolve({ id: 'connector-copy' });
    });
    const transaction = {
      asset: { create: assetCreate },
      evChargePoint: { create: chargerCreate },
      evSupply: { create: supplyCreate },
      evConnector: { create: connectorCreate },
      auditEvent: { create: vi.fn() },
    };
    const prisma = {
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'asset-source',
          organisationId: 'organisation-a',
          customerId: 'customer-a',
          siteId: 'site-a',
          assetModelId: null,
          assetType: 'EV Charger',
          iconKey: 'ev-charger',
          manufacturer: null,
          model: null,
          serialNumber: null,
          notes: null,
          evChargePoint: {
            id: 'charger-source',
            chargePointId: 'CP-1',
            operatorName: 'Operator',
            firmwareVersion: '1.2.3',
            installationDate: new Date('2026-01-01'),
            nominalVoltage: 230,
            phaseCount: 1,
            maximumPowerKw: 7.4,
            dcRcdType: 'RDC_DD',
            locationNotes: 'Front bay',
            supplies: [
              {
                id: 'supply-source-a',
                label: 'Supply A',
                phaseCount: 1,
                protectiveDeviceType: 'RCBO',
                protectiveDeviceRating: 32,
                earthingArrangement: 'TNCS',
              },
              {
                id: 'supply-source-b',
                label: 'Supply B',
                phaseCount: 3,
                protectiveDeviceType: 'MCB',
                protectiveDeviceRating: 40,
                earthingArrangement: 'TNS',
              },
            ],
            connectors: [
              {
                id: 'connector-source',
                label: 'Connector 1',
                connectorType: 'Type 2',
                status: 'ACTIVE',
                displayOrder: 2,
                supplyMappings: [{ supplyId: 'supply-source-b' }],
              },
            ],
          },
        }),
      },
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    } as unknown as PrismaClient;

    await new PortfolioService(prisma).duplicateAsset(
      'organisation-a',
      'asset-source',
      'user-a',
      'correlation-a',
      { displayName: 'Copied charger', assetReference: 'EV-002' },
    );

    expect(assetInputs[0]).toMatchObject({
      data: {
        displayName: 'Copied charger',
        assetReference: 'EV-002',
        manufacturer: null,
      },
    });
    expect(chargerInputs[0]).toMatchObject({
      data: { assetId: 'asset-copy', chargePointId: 'CP-1' },
    });
    expect(supplyCreate).toHaveBeenCalledTimes(2);
    expect(connectorInputs[0]).toMatchObject({
      data: {
        chargePointId: 'charger-copy',
        label: 'Connector 1',
        status: 'ACTIVE',
        displayOrder: 2,
        supplyMappings: { create: [{ supplyId: 'supply-copy-b' }] },
      },
    });
  });

  it('does not link a contact when either record is outside the active organisation', async () => {
    const siteContact = { findUnique: () => Promise.resolve(null) };
    const prisma = {
      site: { findFirst: () => Promise.resolve({ id: 'site-a', customerId: 'customer-a' }) },
      contact: { findFirst: () => Promise.resolve(null) },
      siteContact,
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).linkContact('organisation-b', 'site-a', 'contact-from-a'),
    ).rejects.toMatchObject({ code: 'CONTACT_NOT_FOUND', status: 404 });
  });

  it('links an organisation contact to sites owned by different customers', async () => {
    const linked = { siteId: 'site-a', contactId: 'contact-b' };
    const prisma = {
      site: { findFirst: () => Promise.resolve({ id: 'site-a', customerId: 'customer-a' }) },
      contact: {
        findFirst: () =>
          Promise.resolve({
            id: 'contact-b',
            organisationId: 'organisation-a',
            customerId: 'customer-b',
          }),
      },
      siteContact: { findUnique: () => Promise.resolve(null) },
      $transaction: (operation: (transaction: unknown) => Promise<unknown>) =>
        operation({
          contact: { update: () => Promise.resolve() },
          siteContact: { create: () => Promise.resolve(linked) },
        }),
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).linkContact('organisation-a', 'site-a', 'contact-b'),
    ).resolves.toEqual(linked);
  });

  it('loads asset detail with scoped lightweight revisions, media, and reports', async () => {
    let assetWhere: unknown;
    let revisionQuery: unknown;
    let mediaQuery: unknown;
    let documentQuery: unknown;
    const prisma = {
      asset: {
        findFirst: (input: {
          where: unknown;
          include: { inspections: { select: { revisions: unknown } } };
        }) => {
          assetWhere = input.where;
          revisionQuery = input.include.inspections.select.revisions;
          return Promise.resolve({
            id: 'asset-a',
            inspections: [{ id: 'inspection-a', revisions: [{ id: 'revision-a' }] }],
            defects: [],
          });
        },
      },
      media: {
        findMany: (input: unknown) => {
          mediaQuery = input;
          return Promise.resolve([]);
        },
      },
      document: {
        findMany: (input: unknown) => {
          documentQuery = input;
          return Promise.resolve([]);
        },
      },
    } as unknown as PrismaClient;

    await new PortfolioService(prisma).getAsset('organisation-a', 'asset-a');

    expect(assetWhere).toEqual({ id: 'asset-a', organisationId: 'organisation-a' });
    expect(revisionQuery).not.toHaveProperty('select.data');
    expect(revisionQuery).toMatchObject({
      where: { organisationId: 'organisation-a' },
      select: { media: { include: { media: true } } },
    });
    expect(mediaQuery).toMatchObject({
      where: {
        organisationId: 'organisation-a',
        entityType: 'Asset',
        entityId: 'asset-a',
        status: 'AVAILABLE',
      },
    });
    expect(documentQuery).toMatchObject({
      where: {
        organisationId: 'organisation-a',
        OR: [
          { entityType: 'Asset', entityId: 'asset-a' },
          { inspectionRevisionId: { in: ['revision-a'] } },
        ],
      },
    });
  });

  it('does not disclose an asset from another organisation', async () => {
    let where: unknown;
    const prisma = {
      asset: {
        findFirst: (input: { where: unknown }) => {
          where = input.where;
          return Promise.resolve(null);
        },
      },
    } as unknown as PrismaClient;

    await expect(
      new PortfolioService(prisma).getAsset('organisation-b', 'asset-from-a'),
    ).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND', status: 404 });
    expect(where).toEqual({ id: 'asset-from-a', organisationId: 'organisation-b' });
  });
});
