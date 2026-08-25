import { describe, expect, it } from 'vitest';
import { resourceName } from '../src/environment.js';

describe('resource naming', () => {
  it('keeps every environment explicit', () => {
    expect(resourceName('media', 'staging')).toBe('ohmaudit-media-staging');
  });

  it('rejects unsafe resource fragments', () => {
    expect(() => resourceName('../media', 'production')).toThrow();
  });
});
