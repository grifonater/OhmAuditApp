import { describe, expect, it } from 'vitest';
import { schedulerHealth } from '../src/index';

describe('scheduler worker', () => {
  it('reports its service identity', async () => {
    const response = schedulerHealth('0.1.0');
    await expect(response.json()).resolves.toMatchObject({
      service: 'ohmaudit-worker-scheduler',
      status: 'ok',
    });
  });
});
