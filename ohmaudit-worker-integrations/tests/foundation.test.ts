import { describe, expect, it } from 'vitest';
import { providerFromPath } from '../src/index';

describe('integrations worker', () => {
  it('extracts a bounded provider slug', () => {
    expect(providerFromPath('/webhooks/tap-electric')).toBe('tap-electric');
  });
  it('rejects nested paths', () => {
    expect(providerFromPath('/webhooks/tap-electric/replay')).toBeUndefined();
  });
});
