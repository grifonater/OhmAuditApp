import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { InspectionService } from '../src/inspections/inspection.service';
import { createApp } from '../src/app';
import type { AuthenticatedActor, TokenVerifier } from '../src/auth/auth.types';
import { MemoryIdentityStore } from './support/memory-identity.store';

class DraftTestVerifier implements TokenVerifier {
  verify(): Promise<AuthenticatedActor> {
    return Promise.resolve({
      authSubject: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'viewer@example.test',
      assuranceLevel: 'aal1',
    });
  }
}

describe('inspection drafts', () => {
  it('scopes draft lookup and upsert to the organisation', async () => {
    const upsert = vi.fn().mockResolvedValue({
      inspectionId: 'inspection-a',
      updatedAt: new Date('2026-09-13T12:00:00Z'),
    });
    const findFirst = vi.fn().mockResolvedValue({ id: 'inspection-a', status: 'IN_PROGRESS' });
    const prisma = {
      inspection: { findFirst },
      inspectionDraft: { upsert },
    } as unknown as PrismaClient;

    await new InspectionService(prisma).upsertDraft('organisation-a', 'inspection-a', {
      data: { outcome: 'PASS' },
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'inspection-a', organisationId: 'organisation-a' },
      select: { id: true, status: true },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { inspectionId: 'inspection-a' },
      create: {
        organisationId: 'organisation-a',
        inspectionId: 'inspection-a',
        payload: { data: { outcome: 'PASS' } },
      },
      update: { payload: { data: { outcome: 'PASS' } } },
      select: { inspectionId: true, updatedAt: true },
    });
  });

  it('does not allow submitted inspection drafts to be changed', async () => {
    const upsert = vi.fn();
    const prisma = {
      inspection: {
        findFirst: vi.fn().mockResolvedValue({ id: 'inspection-a', status: 'SUBMITTED' }),
      },
      inspectionDraft: { upsert },
    } as unknown as PrismaClient;

    await expect(
      new InspectionService(prisma).upsertDraft('organisation-a', 'inspection-a', {}),
    ).rejects.toMatchObject({ code: 'INSPECTION_DRAFT_NOT_EDITABLE', status: 409 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns no cross-tenant draft', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { inspectionDraft: { findFirst } } as unknown as PrismaClient;

    await expect(
      new InspectionService(prisma).draft('organisation-b', 'inspection-a'),
    ).rejects.toMatchObject({ code: 'INSPECTION_DRAFT_NOT_FOUND', status: 404 });
    expect(findFirst).toHaveBeenCalledWith({
      where: { inspectionId: 'inspection-a', organisationId: 'organisation-b' },
    });
  });

  it('requires certificates.generate before accessing a draft PDF', async () => {
    const store = new MemoryIdentityStore();
    const actor = await new DraftTestVerifier().verify();
    const user = await store.upsertUser(actor);
    const organisation = await store.createOrganisation({
      name: 'Draft Viewer',
      ownerUserId: user.id,
    });
    store.memberships[0]!.role.capabilities = ['sites.read'];
    const app = createApp({ tokenVerifier: new DraftTestVerifier(), identityStore: store });
    const response = await app.request(
      new Request(
        `https://api.test/api/v1/inspections/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/draft.pdf?organisationId=${organisation.id}`,
        { headers: { authorization: 'Bearer token' } },
      ),
      undefined,
      {
        APP_ENV: 'local',
        APP_VERSION: '0.2.0',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_JWT_AUDIENCE: 'authenticated',
        ALLOWED_ORIGINS: 'http://localhost:4200',
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'CAPABILITY_REQUIRED' });
  });
});
