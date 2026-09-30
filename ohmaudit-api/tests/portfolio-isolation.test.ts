import { describe, expect, it } from 'vitest';
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
