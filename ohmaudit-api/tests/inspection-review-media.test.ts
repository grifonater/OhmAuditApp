import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthenticatedActor, TokenVerifier } from '../src/auth/auth.types';
import { MemoryIdentityStore } from './support/memory-identity.store';

const organisationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const inspectionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

class ReviewTestVerifier implements TokenVerifier {
  verify(): Promise<AuthenticatedActor> {
    return Promise.resolve({
      authSubject: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'reviewer@example.test',
      assuranceLevel: 'aal1',
    });
  }
}
const environment = {
  APP_ENV: 'local' as const,
  APP_VERSION: 'test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  PUBLIC_WEB_ORIGIN: 'http://localhost:4200',
  ALLOWED_ORIGINS: 'http://localhost:4200',
  MEDIA_BUCKET: { put: () => Promise.resolve(undefined), delete: () => Promise.resolve(undefined) },
};

describe('inspection review media', () => {
  it('protects the reviewer image upload endpoint', async () => {
    const response = await createApp().request(
      `/api/v1/inspections/${inspectionId}/review-media?organisationId=${organisationId}&description=Office%20evidence&uploadId=cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
      {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg', 'x-file-size': '1' },
        body: new Uint8Array([1]),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('requires the inspections.review capability before uploading review evidence', async () => {
    const store = new MemoryIdentityStore();
    const user = await store.upsertUser(await new ReviewTestVerifier().verify());
    const organisation = await store.createOrganisation({
      name: 'Review Tenant',
      ownerUserId: user.id,
    });
    store.memberships[0]!.role.capabilities = ['sites.read'];
    const app = createApp({ tokenVerifier: new ReviewTestVerifier(), identityStore: store });
    const response = await app.request(
      new Request(
        `https://api.test/api/v1/inspections/${inspectionId}/review-media?organisationId=${organisation.id}&description=Office%20evidence&uploadId=cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer token',
            'content-type': 'image/jpeg',
            'x-file-size': '1',
          },
          body: new Uint8Array([1]),
        },
      ),
      undefined,
      environment,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'CAPABILITY_REQUIRED' });
  });
});
