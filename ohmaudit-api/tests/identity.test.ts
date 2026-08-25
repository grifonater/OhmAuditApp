import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthenticatedActor, TokenVerifier } from '../src/auth/auth.types';
import { MemoryIdentityStore } from './support/memory-identity.store';

const environment = {
  APP_ENV: 'local' as const,
  APP_VERSION: '0.2.0',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  ALLOWED_ORIGINS: 'http://localhost:4200',
};

class TestVerifier implements TokenVerifier {
  verify(token: string): Promise<AuthenticatedActor> {
    return Promise.resolve({
      authSubject:
        token === 'user-b'
          ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: token === 'user-b' ? 'b@example.test' : 'a@example.test',
      assuranceLevel: token.endsWith('-mfa') ? 'aal2' : 'aal1',
    });
  }
}

function request(path: string, token: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`https://api.test${path}`, { ...init, headers });
}

describe('identity and tenant isolation', () => {
  it('requires a valid bearer token', async () => {
    const response = await createApp({
      tokenVerifier: new TestVerifier(),
      identityStore: new MemoryIdentityStore(),
    }).request('/api/v1/me', {}, environment);
    expect(response.status).toBe(401);
  });

  it('creates separate organisations and never exposes another tenant', async () => {
    const store = new MemoryIdentityStore();
    const app = createApp({ tokenVerifier: new TestVerifier(), identityStore: store });
    const first = await app.request(
      request('/api/v1/organisations', 'user-a', {
        method: 'POST',
        body: JSON.stringify({ name: 'Organisation A' }),
      }),
      undefined,
      environment,
    );
    const second = await app.request(
      request('/api/v1/organisations', 'user-b', {
        method: 'POST',
        body: JSON.stringify({ name: 'Organisation B' }),
      }),
      undefined,
      environment,
    );
    const firstBody: { organisation: { id: string } } = await first.json();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const crossTenant = await app.request(
      request(`/api/v1/organisations/${firstBody.organisation.id}/members`, 'user-b'),
      undefined,
      environment,
    );
    expect(crossTenant.status).toBe(404);
    await expect(crossTenant.json()).resolves.toMatchObject({ code: 'ORGANISATION_NOT_FOUND' });
  });

  it('enforces aal2 before enabling privileged-role MFA policy', async () => {
    const store = new MemoryIdentityStore();
    const app = createApp({ tokenVerifier: new TestVerifier(), identityStore: store });
    const created = await app.request(
      request('/api/v1/organisations', 'user-a', {
        method: 'POST',
        body: JSON.stringify({ name: 'Secure Organisation' }),
      }),
      undefined,
      environment,
    );
    const body: { organisation: { id: string } } = await created.json();
    const denied = await app.request(
      request(`/api/v1/organisations/${body.organisation.id}/mfa-policy`, 'user-a', {
        method: 'PATCH',
        body: JSON.stringify({ requireMfaForPrivilegedRoles: true }),
      }),
      undefined,
      environment,
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ code: 'MFA_ENROLMENT_REQUIRED' });
  });

  it('keeps platform administration separate from organisation ownership', async () => {
    const store = new MemoryIdentityStore();
    const app = createApp({ tokenVerifier: new TestVerifier(), identityStore: store });
    const response = await app.request(
      request('/api/v1/platform/me', 'user-a'),
      undefined,
      environment,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
  });
});
