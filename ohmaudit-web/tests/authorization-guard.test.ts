import { describe, expect, it } from 'vitest';
import { authorizationUrl } from '../src/app/core/authorization-url';

describe('authorization guard URL', () => {
  it('uses the configured API version path exactly once', () => {
    expect(authorizationUrl('http://localhost:8787/api/v1', '/me')).toBe(
      'http://localhost:8787/api/v1/me',
    );
    expect(
      authorizationUrl('https://api.example.test/api/v1/', '/organisations/org-a/entitlements'),
    ).toBe('https://api.example.test/api/v1/organisations/org-a/entitlements');
  });
});
