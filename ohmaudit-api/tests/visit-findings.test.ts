import { describe, expect, it, vi } from 'vitest';
import {
  createApp,
  defectSubmissionInput,
  inspectionStatusFilterInput,
  visitFindingsInput,
} from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import { InspectionService } from '../src/inspections/inspection.service';
import { VisitService, type VisitFindingInput } from '../src/visits/visit.service';

const organisationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const visitId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const firstFindingId = '10000000-0000-4000-8000-000000000001';
const secondFindingId = '10000000-0000-4000-8000-000000000002';
const mediaId = '20000000-0000-4000-8000-000000000001';
const environment = {
  APP_ENV: 'local' as const,
  APP_VERSION: '0.2.0',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  ALLOWED_ORIGINS: 'http://localhost:4200',
};

const finding = (clientFindingId = firstFindingId): VisitFindingInput => ({
  clientFindingId,
  title: 'Damaged enclosure',
  description: 'Cracked at the lower fixing',
  category: 'FAULT',
  severity: 'MAJOR',
  status: 'OPEN',
  photoMediaIds: [mediaId],
});

function findingPrisma(mediaTags = [`finding:${firstFindingId}`]) {
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const upsert = vi.fn((input: { create: Record<string, unknown> }) =>
    Promise.resolve({ id: 'finding-server', ...input.create }),
  );
  const records = [
    {
      id: 'finding-server',
      organisationId,
      visitId,
      ...finding(),
      createdAt: new Date('2026-09-15T12:00:00Z'),
      updatedAt: new Date('2026-09-15T12:00:00Z'),
    },
  ];
  const transaction = {
    visit: {
      findFirst: vi.fn().mockResolvedValue({ id: visitId, organisationId, archivedAt: null }),
    },
    media: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: mediaId,
          organisationId,
          entityType: 'Visit',
          entityId: visitId,
          status: 'AVAILABLE',
          mimeType: 'image/jpeg',
          tags: mediaTags,
        },
      ]),
    },
    visitFinding: {
      deleteMany,
      upsert,
      findMany: vi.fn().mockResolvedValue(records),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient,
    transaction,
    deleteMany,
    upsert,
  };
}

describe('visit finding validation', () => {
  it.each([
    ['GET', `/api/v1/visits/${visitId}/findings?organisationId=${organisationId}`],
    ['PUT', `/api/v1/visits/${visitId}/findings?organisationId=${organisationId}`],
    [
      'POST',
      `/api/v1/visits/${visitId}/findings/${firstFindingId}/images?organisationId=${organisationId}`,
    ],
    [
      'DELETE',
      `/api/v1/visits/${visitId}/findings/${firstFindingId}/images/${mediaId}?organisationId=${organisationId}`,
    ],
  ])('protects the authenticated %s endpoint', async (method, path) => {
    const response = await createApp().request(path, { method }, environment);
    expect(response.status).toBe(401);
  });

  it('accepts no more than 100 uniquely identified UUID findings', () => {
    expect(visitFindingsInput.safeParse({ findings: [finding()] }).success).toBe(true);
    expect(
      visitFindingsInput.safeParse({ findings: [finding(), finding(firstFindingId)] }).success,
    ).toBe(false);
    expect(visitFindingsInput.safeParse({ findings: [finding('temporary-finding')] }).success).toBe(
      false,
    );
    expect(
      visitFindingsInput.safeParse({ findings: Array.from({ length: 101 }, () => finding()) })
        .success,
    ).toBe(false);
  });

  it('validates the semantic awaiting-review status', () => {
    expect(inspectionStatusFilterInput.parse('AWAITING_REVIEW')).toBe('AWAITING_REVIEW');
    expect(inspectionStatusFilterInput.safeParse('WAITING').success).toBe(false);
  });

  it('accepts legacy automatic RCD finding IDs in queued inspection submissions', () => {
    expect(
      defectSubmissionInput.safeParse({
        clientFindingId: `automatic-rcd-${visitId}`,
        category: 'FAULT',
        title: 'Faulty RCD reading',
        severity: 'MAJOR',
      }).success,
    ).toBe(true);
    expect(
      defectSubmissionInput.safeParse({
        clientFindingId: 'automatic-rcd-not-a-uuid',
        category: 'FAULT',
        title: 'Faulty RCD reading',
        severity: 'MAJOR',
      }).success,
    ).toBe(false);
  });
});

describe('authoritative visit finding upsert', () => {
  it('requests findings in normal and guest visit payloads', async () => {
    const visitFindFirst = vi
      .fn()
      .mockResolvedValue({ id: visitId, tasks: [], findings: [finding()] });
    const guestFindUnique = vi.fn().mockResolvedValue({
      id: 'access-token',
      revokedAt: null,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      visit: { id: visitId, organisationId, tasks: [], findings: [finding()] },
    });
    const prisma = {
      visit: { findFirst: visitFindFirst },
      guestAccessToken: {
        findUnique: guestFindUnique,
        update: vi.fn().mockResolvedValue({}),
      },
      media: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const service = new VisitService(prisma);

    await expect(service.detail(organisationId, visitId)).resolves.toMatchObject({
      findings: [{ clientFindingId: firstFindingId }],
    });
    await expect(service.guestPack('opaque-token')).resolves.toMatchObject({
      findings: [{ clientFindingId: firstFindingId }],
    });
    const detailQuery: unknown = visitFindFirst.mock.calls[0]?.[0];
    const guestQuery: unknown = guestFindUnique.mock.calls[0]?.[0];
    const findingsInclude = { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] };
    expect(detailQuery).toMatchObject({ include: { findings: findingsInclude } });
    expect(guestQuery).toMatchObject({
      include: { visit: { include: { findings: findingsInclude } } },
    });
  });

  it('upserts submitted IDs and deletes every omitted finding', async () => {
    const { prisma, deleteMany, upsert } = findingPrisma();

    const result = await new VisitService(prisma).upsertFindings(organisationId, visitId, [
      finding(),
    ]);

    expect(result).toHaveLength(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        organisationId,
        visitId,
        clientFindingId: { notIn: [firstFindingId] },
      },
    });
    const upsertQuery: unknown = upsert.mock.calls[0]?.[0];
    expect(upsertQuery).toMatchObject({
      where: { visitId_clientFindingId: { visitId, clientFindingId: firstFindingId } },
      update: { title: 'Damaged enclosure', photoMediaIds: [mediaId] },
    });
  });

  it('requires available Visit media carrying exactly the submitted finding tag', async () => {
    const invalidTag = findingPrisma([`finding:${secondFindingId}`]);
    await expect(
      new VisitService(invalidTag.prisma).upsertFindings(organisationId, visitId, [finding()]),
    ).rejects.toMatchObject({ code: 'VISIT_FINDING_MEDIA_INVALID', status: 422 });

    const crossLinked = findingPrisma();
    await expect(
      new VisitService(crossLinked.prisma).upsertFindings(organisationId, visitId, [
        finding(),
        finding(secondFindingId),
      ]),
    ).rejects.toMatchObject({ code: 'VISIT_FINDING_MEDIA_CROSS_LINKED', status: 422 });
    expect(crossLinked.transaction.media.findMany).not.toHaveBeenCalled();
  });

  it('stores UPSERT_VISIT_FINDINGS and replays the same sync mutation', async () => {
    const { transaction } = findingPrisma();
    const mutation = {
      id: 'mutation-server',
      organisationId,
      visitId,
      clientMutationId: '30000000-0000-4000-8000-000000000001',
      entityType: 'VisitFinding',
      operation: 'UPSERT_VISIT_FINDINGS',
      payload: { findings: [finding()] },
      status: 'APPLIED',
    };
    const replay = { value: null as typeof mutation | null };
    const syncCreate = vi.fn().mockImplementation(() => {
      replay.value = mutation;
      return Promise.resolve(mutation);
    });
    const syncTransaction = { ...transaction, syncMutation: { create: syncCreate } };
    const prisma = {
      syncMutation: { findUnique: vi.fn(() => Promise.resolve(replay.value)) },
      $transaction: vi.fn((operation: (client: typeof syncTransaction) => unknown) =>
        Promise.resolve(operation(syncTransaction)),
      ),
    } as unknown as PrismaClient;
    const service = new VisitService(prisma);

    await expect(
      service.upsertFindingsSync(
        organisationId,
        visitId,
        mutation.clientMutationId,
        mutation.entityType,
        mutation.payload,
      ),
    ).resolves.toBe(mutation);
    await expect(
      service.upsertFindingsSync(
        organisationId,
        visitId,
        mutation.clientMutationId,
        mutation.entityType,
        mutation.payload,
      ),
    ).resolves.toBe(mutation);
    expect(syncCreate).toHaveBeenCalledTimes(1);
  });

  it('uses SUBMITTED and UNDER_REVIEW for the semantic review queue', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { inspection: { findMany } } as unknown as PrismaClient;

    await new InspectionService(prisma).list(organisationId, 'AWAITING_REVIEW');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organisationId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      }),
    );
  });
});
