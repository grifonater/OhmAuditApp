import { describe, expect, it } from 'vitest';
import { createCandidate } from '../src/index';

describe('AI worker', () => {
  it('marks every extraction candidate for human confirmation', () => {
    expect(createCandidate('serialNumber', 'ABC123', 0.94)).toEqual({
      field: 'serialNumber',
      value: 'ABC123',
      confidence: 0.94,
      requiresHumanConfirmation: true,
    });
  });
});
