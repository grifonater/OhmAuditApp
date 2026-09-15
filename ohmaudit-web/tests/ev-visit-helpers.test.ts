import { describe, expect, it } from 'vitest';
import {
  connectorSupplyIds,
  isSupportedImageMimeType,
  PROTECTIVE_DEVICE_TYPES,
} from '../src/app/operations/ev-visit-helpers';
import { applyDataPlateCandidate } from '../src/app/core/offline-visit.helpers';

describe('EV visit helpers', () => {
  it('accepts only image formats supported by the upload API', () => {
    expect(isSupportedImageMimeType('image/jpeg')).toBe(true);
    expect(isSupportedImageMimeType('image/png')).toBe(true);
    expect(isSupportedImageMimeType('image/webp')).toBe(true);
    expect(isSupportedImageMimeType('image/heic')).toBe(false);
  });

  it('offers all supported protective device types', () => {
    expect(PROTECTIVE_DEVICE_TYPES).toEqual(['MCB', 'MCCB', 'RCBO', 'HRC', 'AFDD', 'OTHER']);
  });

  it('assigns a sole supply only when a connector has no explicit mapping', () => {
    expect(connectorSupplyIds([], [{ id: 'supply-1' }])).toEqual(['supply-1']);
    expect(connectorSupplyIds([], [{ id: 'supply-1' }, { id: 'supply-2' }])).toEqual([]);
    expect(connectorSupplyIds(['explicit'], [{ id: 'supply-1' }])).toEqual(['explicit']);
  });

  it('applies a selected nameplate candidate without changing other manual values', () => {
    const values = {
      manufacturer: 'Manual make',
      model: 'Manual model',
      serialNumber: '',
      maximumPowerKw: null,
    };
    expect(applyDataPlateCandidate(values, { field: 'serialNumber', value: 'SN-100' })).toEqual({
      ...values,
      serialNumber: 'SN-100',
    });
    expect(values.serialNumber).toBe('');
    expect(
      applyDataPlateCandidate(values, { field: 'maximumPowerKw', value: 'not a number' }),
    ).toBe(values);
  });
});
