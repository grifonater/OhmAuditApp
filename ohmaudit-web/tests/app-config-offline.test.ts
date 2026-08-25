import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfigService, type RuntimeConfig } from '../src/app/core/app-config.service';

const config: RuntimeConfig = {
  apiBaseUrl: 'https://api.example.test/api/v1',
  supabaseUrl: 'https://project.supabase.co',
  supabasePublishableKey: 'public-key',
  authRedirectUrl: 'https://app.example.test/auth/callback',
};

function installStorage(): Map<string, string> {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  return values;
}

describe('AppConfigService offline startup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the last valid runtime configuration when the network is unavailable', async () => {
    installStorage();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(config))));
    const online = new AppConfigService();
    await online.load();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const offline = new AppConfigService();
    await offline.load();

    expect(offline.config).toEqual(config);
  });

  it('still fails clearly when a device has never loaded a valid configuration', async () => {
    installStorage();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const service = new AppConfigService();

    await expect(service.load()).rejects.toThrow('Failed to fetch');
  });
});
