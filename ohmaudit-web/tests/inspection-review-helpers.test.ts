import { describe, expect, it } from 'vitest';
import {
  administratorCorrectionReason,
  connectorSupplySelection,
  hasReachedRevision,
} from '../src/app/operations/inspection-review.helpers';

describe('inspection review helpers', () => {
  it('preserves the connector supply mapping shape used by EV revisions', () => {
    expect(connectorSupplySelection('supply-a')).toEqual(['supply-a']);
    expect(connectorSupplySelection('')).toEqual([]);
  });

  it('extracts the administrator correction reason from revision validation', () => {
    expect(
      administratorCorrectionReason({
        administratorOverride: { reason: 'Connector was assigned to the wrong supply.' },
      }),
    ).toBe('Connector was assigned to the wrong supply.');
    expect(administratorCorrectionReason({ administratorOverride: {} })).toBeUndefined();
  });

  it('identifies stale inspection reads after an override', () => {
    expect(hasReachedRevision(4, 5)).toBe(false);
    expect(hasReachedRevision(5, 5)).toBe(true);
    expect(hasReachedRevision(6, 5)).toBe(true);
  });
});
