import { describe, expect, it, vi } from 'vitest';
import { addEvChargerPayloadInput, createApp, inspectionAssetMediaKindInput } from '../src/app';
import type { AuthenticatedActor, TokenVerifier } from '../src/auth/auth.types';
import type { PrismaClient } from '../src/generated/prisma/client';
import { VisitService, type AddEvChargerPayload } from '../src/visits/visit.service';
import { MemoryIdentityStore } from './support/memory-identity.store';

const organisationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const visitId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const mutationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const localIds = {
  assetId: '10000000-0000-4000-8000-000000000001',
  chargePointId: '10000000-0000-4000-8000-000000000002',
  taskId: '10000000-0000-4000-8000-000000000003',
  inspectionId: '10000000-0000-4000-8000-000000000004',
};
const payload: AddEvChargerPayload = {
  localIds,
  asset: {
    assetReference: 'EVCP-04',
    displayName: 'Rear car park charger',
    maximumPowerKw: 22,
    dcRcdType: 'RDC_DD',
  },
};
const environment = {
  APP_ENV: 'local' as const,
  APP_VERSION: '0.2.0',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  ALLOWED_ORIGINS: 'http://localhost:4200',
};

class EngineerTestVerifier implements TokenVerifier {
  verify(): Promise<AuthenticatedActor> {
    return Promise.resolve({
      authSubject: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      email: 'engineer@example.test',
      assuranceLevel: 'aal1',
    });
  }
}

describe('engineer guest API contracts', () => {
  it('bounds and validates guest identity before resolving its token', async () => {
    const app = createApp();
    const tooLarge = await app.request(
      `/api/v1/guest/visits/token/identity`,
      { method: 'PATCH', body: JSON.stringify({ displayName: 'x'.repeat(5000) }) },
      environment,
    );
    const invalid = await app.request(
      `/api/v1/guest/visits/token/identity`,
      { method: 'PATCH', body: JSON.stringify({ displayName: ' x ' }) },
      environment,
    );

    expect(tooLarge.status).toBe(413);
    expect(invalid.status).toBe(422);
  });

  it('protects visit-scoped member analysis and registers data-plate media kind', async () => {
    const response = await createApp().request(
      `/api/v1/visits/${visitId}/charger-data-plate-analysis?organisationId=${organisationId}`,
      { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: new Uint8Array([1]) },
      environment,
    );

    expect(response.status).toBe(401);
    expect(inspectionAssetMediaKindInput.parse('data-plate')).toBe('data-plate');
  });

  it('requires the EV specialist capability for authenticated charger sync', async () => {
    const verifier = new EngineerTestVerifier();
    const store = new MemoryIdentityStore();
    const user = await store.upsertUser(await verifier.verify());
    const organisation = await store.createOrganisation({
      name: 'Engineer permissions',
      ownerUserId: user.id,
    });
    store.memberships[0]!.role.capabilities = ['inspections.perform'];
    const response = await createApp({ tokenVerifier: verifier, identityStore: store }).request(
      `/api/v1/visits/${visitId}/sync?organisationId=${organisation.id}`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({
          clientMutationId: mutationId,
          entityType: 'Asset',
          operation: 'ADD_EV_CHARGER',
          payload,
        }),
      },
      { ...environment, DATABASE_URL: 'postgresql://test:test@localhost:5432/test' },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'CAPABILITY_REQUIRED' });
  });

  it('requires UUID local IDs in the ADD_EV_CHARGER payload', () => {
    expect(addEvChargerPayloadInput.safeParse(payload).success).toBe(true);
    expect(
      addEvChargerPayloadInput.safeParse({
        ...payload,
        localIds: { ...payload.localIds, inspectionId: 'temporary-inspection' },
      }).success,
    ).toBe(false);
  });
});

function identityPrisma(visit: Record<string, unknown>) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-a' });
  const transaction = {
    guestAccessToken: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'token-a',
        revokedAt: null,
        expiresAt: new Date('2099-01-01T00:00:00Z'),
        visit,
      }),
    },
    visit: {
      updateMany,
      findUnique: vi.fn().mockResolvedValue({ ...visit, guestEngineerName: 'Ada Engineer' }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...visit, guestEngineerName: 'Ada Engineer' }),
    },
    auditEvent: { create: auditCreate },
  };
  return {
    prisma: {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    } as unknown as PrismaClient,
    updateMany,
    auditCreate,
  };
}

describe('guest engineer identity', () => {
  it('derives the visit from the token, trims the name, and audits the first write', async () => {
    const { prisma, updateMany, auditCreate } = identityPrisma({
      id: visitId,
      organisationId,
      guestEngineerName: null,
      guestEmail: null,
    });

    const result = await new VisitService(prisma).setGuestIdentity(
      'opaque-token',
      '  Ada Engineer  ',
      'correlation-a',
    );

    expect(result.identity).toEqual({ displayName: 'Ada Engineer', email: null });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: visitId,
        organisationId,
        guestEngineerName: null,
        guestEmail: null,
      },
      data: { guestEngineerName: 'Ada Engineer' },
    });
    const auditInput: unknown = auditCreate.mock.calls[0]?.[0];
    expect(auditInput).toMatchObject({
      data: {
        organisationId,
        eventType: 'GuestEngineerIdentitySet',
        entityType: 'Visit',
        entityId: visitId,
        data: { displayName: 'Ada Engineer' },
      },
    });
  });

  it('replays the same normalized name without another write or audit', async () => {
    const { prisma, updateMany, auditCreate } = identityPrisma({
      id: visitId,
      organisationId,
      guestEngineerName: 'Ada Engineer',
      guestEmail: null,
    });

    await expect(
      new VisitService(prisma).setGuestIdentity('opaque-token', ' Ada Engineer ', 'correlation-a'),
    ).resolves.toMatchObject({ identity: { displayName: 'Ada Engineer' } });
    expect(updateMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects replacing a configured name or email', async () => {
    const { prisma, updateMany } = identityPrisma({
      id: visitId,
      organisationId,
      guestEngineerName: null,
      guestEmail: 'configured@example.test',
    });

    await expect(
      new VisitService(prisma).setGuestIdentity('opaque-token', 'Ada Engineer', 'correlation-a'),
    ).rejects.toMatchObject({ code: 'GUEST_IDENTITY_CONFLICT', status: 409 });
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('ADD_EV_CHARGER sync', () => {
  it('creates the complete graph and APPLIED result in one transaction', async () => {
    const resultCreate = vi.fn((input: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'sync-a', ...input.data }),
    );
    const transaction = {
      syncMutation: { findUnique: vi.fn().mockResolvedValue(null), create: resultCreate },
      visit: {
        findFirst: vi.fn().mockResolvedValue({
          id: visitId,
          organisationId,
          customerId: 'customer-a',
          siteId: 'site-a',
          status: 'SCHEDULED',
          archivedAt: null,
          evDiscoveryEnabled: true,
          tasks: [{ displayOrder: 2 }],
        }),
        update: vi.fn().mockResolvedValue({ id: visitId, status: 'IN_PROGRESS' }),
      },
      asset: {
        create: vi.fn().mockResolvedValue({
          id: 'asset-server',
          displayName: payload.asset.displayName,
          evChargePoint: { id: 'charge-point-server', assetId: 'asset-server' },
        }),
      },
      visitTask: {
        create: vi.fn().mockResolvedValue({
          id: 'task-server',
          title: 'EV charger inspection',
          status: 'IN_PROGRESS',
        }),
      },
      inspection: {
        create: vi.fn().mockResolvedValue({ id: 'inspection-server', status: 'IN_PROGRESS' }),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const transactionRunner = vi.fn((operation: (client: typeof transaction) => unknown) =>
      Promise.resolve(operation(transaction)),
    );
    const prisma = {
      syncMutation: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: transactionRunner,
    } as unknown as PrismaClient;

    const mutation = await new VisitService(prisma).addEvChargerSync(
      organisationId,
      visitId,
      mutationId,
      'Asset',
      payload,
      'engineer-a',
      'correlation-a',
    );

    expect(transactionRunner).toHaveBeenCalledTimes(1);
    const assetCreateInput: unknown = transaction.asset.create.mock.calls[0]?.[0];
    const taskCreateInput: unknown = transaction.visitTask.create.mock.calls[0]?.[0];
    const inspectionCreateInput: unknown = transaction.inspection.create.mock.calls[0]?.[0];
    expect(assetCreateInput).toMatchObject({
      data: {
        status: 'PROPOSED',
        evChargePoint: { create: { dcRcdType: 'RDC_DD', organisationId } },
      },
      include: { evChargePoint: true },
    });
    expect(taskCreateInput).toMatchObject({
      data: { status: 'IN_PROGRESS', displayOrder: 3 },
    });
    expect(inspectionCreateInput).toMatchObject({
      data: {
        visitId,
        assetId: 'asset-server',
        status: 'IN_PROGRESS',
      },
    });
    expect(transaction.visit.update).toHaveBeenCalledWith({
      where: { id: visitId },
      data: { status: 'IN_PROGRESS' },
    });
    expect(mutation).toMatchObject({
      status: 'APPLIED',
      result: {
        asset: { id: 'asset-server' },
        task: { id: 'task-server' },
        inspection: { id: 'inspection-server' },
        idMap: {
          assetId: { local: localIds.assetId, server: 'asset-server' },
          chargePointId: { local: localIds.chargePointId, server: 'charge-point-server' },
          taskId: { local: localIds.taskId, server: 'task-server' },
          inspectionId: { local: localIds.inspectionId, server: 'inspection-server' },
        },
      },
    });
  });

  it('returns an exact replay and rejects reuse for a different payload or visit', async () => {
    const stored = {
      id: 'sync-a',
      organisationId,
      visitId,
      clientMutationId: mutationId,
      entityType: 'Asset',
      operation: 'ADD_EV_CHARGER',
      payload,
      status: 'APPLIED',
      result: { accepted: true },
    };
    const prisma = {
      syncMutation: { findUnique: vi.fn().mockResolvedValue(stored) },
    } as unknown as PrismaClient;
    const service = new VisitService(prisma);

    await expect(
      service.addEvChargerSync(
        organisationId,
        visitId,
        mutationId,
        'Asset',
        payload,
        undefined,
        'correlation-a',
      ),
    ).resolves.toBe(stored);
    await expect(
      service.addEvChargerSync(
        organisationId,
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        mutationId,
        'Asset',
        payload,
        undefined,
        'correlation-a',
      ),
    ).rejects.toMatchObject({ code: 'SYNC_MUTATION_CONFLICT', status: 409 });
    await expect(
      service.addEvChargerSync(
        organisationId,
        visitId,
        mutationId,
        'Asset',
        { ...payload, asset: { ...payload.asset, displayName: 'Different charger' } },
        undefined,
        'correlation-a',
      ),
    ).rejects.toMatchObject({ code: 'SYNC_MUTATION_CONFLICT', status: 409 });
  });

  it('does not store an APPLIED mutation when inspection creation fails', async () => {
    const syncCreate = vi.fn();
    const transaction = {
      syncMutation: { findUnique: vi.fn().mockResolvedValue(null), create: syncCreate },
      visit: {
        findFirst: vi.fn().mockResolvedValue({
          id: visitId,
          organisationId,
          customerId: 'customer-a',
          siteId: 'site-a',
          status: 'IN_PROGRESS',
          archivedAt: null,
          evDiscoveryEnabled: true,
          tasks: [],
        }),
      },
      asset: {
        create: vi.fn().mockResolvedValue({
          id: 'asset-server',
          evChargePoint: { id: 'charge-point-server' },
        }),
      },
      visitTask: {
        create: vi.fn().mockResolvedValue({ id: 'task-server', title: 'EV charger inspection' }),
      },
      inspection: { create: vi.fn().mockRejectedValue(new Error('inspection insert failed')) },
    };
    const prisma = {
      syncMutation: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    } as unknown as PrismaClient;

    await expect(
      new VisitService(prisma).addEvChargerSync(
        organisationId,
        visitId,
        mutationId,
        'Asset',
        payload,
        undefined,
        'correlation-a',
      ),
    ).rejects.toThrow('inspection insert failed');
    expect(syncCreate).not.toHaveBeenCalled();
  });

  it('rejects disabled discovery and completed visits before creating assets', async () => {
    const assetCreate = vi.fn();
    const status = { value: 'SCHEDULED' };
    const discovery = { value: false };
    const transaction = {
      syncMutation: { findUnique: vi.fn().mockResolvedValue(null) },
      visit: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            id: visitId,
            organisationId,
            customerId: 'customer-a',
            siteId: 'site-a',
            status: status.value,
            archivedAt: null,
            evDiscoveryEnabled: discovery.value,
            tasks: [],
          }),
        ),
      },
      asset: { create: assetCreate },
    };
    const prisma = {
      syncMutation: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    } as unknown as PrismaClient;
    const service = new VisitService(prisma);

    await expect(
      service.addEvChargerSync(
        organisationId,
        visitId,
        mutationId,
        'Asset',
        payload,
        undefined,
        'correlation-a',
      ),
    ).rejects.toMatchObject({ code: 'EV_DISCOVERY_NOT_ENABLED', status: 403 });
    discovery.value = true;
    status.value = 'COMPLETED';
    await expect(
      service.addEvChargerSync(
        organisationId,
        visitId,
        mutationId,
        'Asset',
        payload,
        undefined,
        'correlation-a',
      ),
    ).rejects.toMatchObject({ code: 'VISIT_NOT_ACTIVE', status: 409 });
    expect(assetCreate).not.toHaveBeenCalled();
  });
});
