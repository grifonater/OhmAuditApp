import { describe, expect, it } from 'vitest';
import { assetDetailPath, assetDetailRoute } from '../src/app/core/asset-routes';

describe('generic asset detail route', () => {
  it('requires asset read access at organisation scope', () => {
    expect(assetDetailRoute.path).toBe('org/:organisationId/assets/:assetId');
    expect(assetDetailRoute.capabilities).toEqual(['assets.read']);
  });

  it('builds the generic asset link', () => {
    expect(assetDetailPath('org-1', 'asset-1')).toEqual(['/app/org', 'org-1', 'assets', 'asset-1']);
  });
});
