import { describe, expect, it, vi } from 'vitest';
import worker from '../src/worker';

describe('web deployment metadata', () => {
  it('returns the current Cloudflare Worker version without cacheable headers', async () => {
    const assetFetch = vi.fn();
    const response = await worker.fetch(new Request('https://ohmaudit.com/deployment.json'), {
      CF_VERSION_METADATA: {
        id: '11111111-2222-4333-8444-555555555555',
        tag: 'production',
        timestamp: '2026-08-25T08:30:00.000Z',
      },
      ASSETS: { fetch: assetFetch },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      id: '11111111-2222-4333-8444-555555555555',
      tag: 'production',
      createdAt: '2026-08-25T08:30:00.000Z',
    });
    expect(assetFetch).not.toHaveBeenCalled();
  });

  it('delegates all other paths to the static asset binding', async () => {
    const expected = new Response('asset');
    const assetFetch = vi.fn().mockResolvedValue(expected);
    const response = await worker.fetch(new Request('https://ohmaudit.com/main.js'), {
      CF_VERSION_METADATA: { id: 'id', tag: '', timestamp: 'timestamp' },
      ASSETS: { fetch: assetFetch },
    });

    expect(response).toBe(expected);
    expect(assetFetch).toHaveBeenCalledOnce();
  });
});
