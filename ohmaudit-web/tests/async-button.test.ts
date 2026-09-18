import { describe, expect, it } from 'vitest';
import { asyncButtonResultState } from '../src/app/shared/async-button-state';

describe('async button result feedback', () => {
  it('shows a tick when an action finishes without an error', () => {
    expect(asyncButtonResultState('')).toBe('success');
    expect(asyncButtonResultState('   ')).toBe('success');
  });

  it('shows a cross when an action finishes with an error', () => {
    expect(asyncButtonResultState('Unable to save.')).toBe('error');
  });
});
