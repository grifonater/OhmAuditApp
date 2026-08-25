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
        status: { in: ['PROPOSED', 'ACTIVE', 'INACTIVE'] },
      },
    ]);
  });

  it('always scopes customer retrieval by organisation and returns a non-disclosing 404', async () => {
    let receivedWhere: unknown;
    const prisma = {
      customer: {
        findFirst: (input: { where: unknown }) => {
          receivedWhere = input.where;
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
});
