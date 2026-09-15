import { describe, expect, it } from 'vitest';
import {
  connectorSupplyIds,
  engineerWorkspaceStep,
  isSupportedImageMimeType,
  PROTECTIVE_DEVICE_TYPES,
} from '../src/app/operations/ev-visit-helpers';
import {
  applyDataPlateCandidate,
  attachFindingPhotoIds,
} from '../src/app/core/offline-visit.helpers';

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

  it('restores valid engineer workspace steps and defaults invalid URLs to overview', () => {
    expect(engineerWorkspaceStep('rams')).toBe('rams');
    expect(engineerWorkspaceStep('inspections')).toBe('inspections');
    expect(engineerWorkspaceStep('unknown')).toBe('overview');
    expect(engineerWorkspaceStep(null)).toBe('overview');
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

  it('maps uploaded photos only to their client finding', () => {
    const submission = {
      defects: [
        { clientFindingId: 'finding-a', title: 'A' },
        { clientFindingId: 'finding-b', title: 'B' },
      ],
    };
    expect(
      attachFindingPhotoIds(submission, {
        byFindingId: { 'finding-a': ['media-a'], 'finding-b': ['media-b-1', 'media-b-2'] },
        legacyUnassigned: ['legacy-photo'],
      }),
    ).toEqual({
      defects: [
        { clientFindingId: 'finding-a', title: 'A', photoMediaIds: ['media-a'] },
        {
          clientFindingId: 'finding-b',
          title: 'B',
          photoMediaIds: ['media-b-1', 'media-b-2'],
        },
      ],
    });
  });

  it('attaches unassigned legacy photos only to a single legacy finding', () => {
    const mappings = { byFindingId: {}, legacyUnassigned: ['legacy-photo'] };
    expect(attachFindingPhotoIds({ defects: [{ title: 'Old fault' }] }, mappings)).toEqual({
      defects: [{ title: 'Old fault', photoMediaIds: ['legacy-photo'] }],
    });
    expect(
      attachFindingPhotoIds(
        { defects: [{ clientFindingId: 'migrated-finding', title: 'Old fault' }] },
        mappings,
      ),
    ).toEqual({
      defects: [
        {
          clientFindingId: 'migrated-finding',
          title: 'Old fault',
          photoMediaIds: ['legacy-photo'],
        },
      ],
    });
    expect(
      attachFindingPhotoIds({ defects: [{ title: 'One' }, { title: 'Two' }] }, mappings),
    ).toEqual({ defects: [{ title: 'One' }, { title: 'Two' }] });
  });
});
