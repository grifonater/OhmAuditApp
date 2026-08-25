import { describe, expect, it } from 'vitest';
import { PlatformStatus } from '../src/app/platform-status';

describe('PlatformStatus', () => {
  it('uses calm offline language when connectivity is absent', () => {
    const status = new PlatformStatus();
    status.online.set(false);
    expect(status.label()).toBe('Saved on device');
  });
});
