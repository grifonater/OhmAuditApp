import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

describe('API foundation', () => {
  it('exposes a versioned health endpoint and correlation ID', async () => {
    const response = await createApp().request(
      '/api/v1/health',
      {},
      {
        APP_ENV: 'local',
        APP_VERSION: '0.2.0',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_JWT_AUDIENCE: 'authenticated',
        ALLOWED_ORIGINS: 'http://localhost:4200',
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-correlation-id')).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      service: 'ohmaudit-api',
      status: 'ok',
      version: '0.2.0',
    });
  });

  it('returns a structured error for unknown routes', async () => {
    const response = await createApp().request(
      '/missing',
      {},
      {
        APP_ENV: 'local',
        APP_VERSION: '0.2.0',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_JWT_AUDIENCE: 'authenticated',
        ALLOWED_ORIGINS: 'http://localhost:4200',
      },
    );
    expect(response.status).toBe(404);
    const body: { code: string } = await response.json();
    expect(body.code).toBe('ROUTE_NOT_FOUND');
  });

  it('requires authentication for direct RAMS routes', async () => {
    const response = await createApp().request(
      '/api/v1/rams/2f06d49d-798b-47cd-a0b9-f837afbeed91?organisationId=c61af703-b384-4c1d-ac2b-adc4d2d8a8eb',
      {},
      {
        APP_ENV: 'local',
        APP_VERSION: '0.2.0',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_JWT_AUDIENCE: 'authenticated',
        ALLOWED_ORIGINS: 'http://localhost:4200',
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });
});
