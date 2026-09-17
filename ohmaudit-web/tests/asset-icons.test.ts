import { describe, expect, it } from 'vitest';
import {
  assetIconOptions,
  defaultAssetIconKey,
  resolvedAssetIconKey,
} from '../src/app/shared/asset-icons';

describe('asset icons', () => {
  it('offers 30 unique Hugeicons-backed choices', () => {
    expect(assetIconOptions).toHaveLength(30);
    expect(new Set(assetIconOptions.map(({ key }) => key)).size).toBe(30);
    expect(assetIconOptions.every(({ icon }) => Array.isArray(icon))).toBe(true);
  });
  it.each([
    ['EV Charger', 'ev-charger'],
    ['Solar PV System', 'solar-panel'],
    ['Emergency Lighting System', 'emergency-light'],
    ['Main Distribution Board', 'distribution-board'],
    ['Battery storage', 'battery'],
    ['Energy meter', 'meter'],
    ['Air handling unit', 'general'],
  ] as const)('selects the type default for %s', (assetType, expected) => {
    expect(defaultAssetIconKey(assetType)).toBe(expected);
  });

  it('uses a stored override instead of the type default', () => {
    expect(resolvedAssetIconKey('EV Charger', 'meter')).toBe('meter');
    expect(resolvedAssetIconKey('EV Charger', null)).toBe('ev-charger');
  });
});
