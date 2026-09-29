import { describe, expect, it } from 'vitest';
import {
  inspectionReportReference,
  orderedInspectionIds,
  preferredReportReference,
} from '../src/shared/report-reference';

describe('report references', () => {
  it('prefers the job reference, then external reference, then current reference', () => {
    expect(
      preferredReportReference({
        jobReference: ' JOB-101 ',
        externalReference: 'PO-7',
        currentReference: 'CURRENT-3',
      }),
    ).toBe('JOB-101');
    expect(
      preferredReportReference({
        jobReference: ' ',
        externalReference: ' PO-7 ',
        currentReference: 'CURRENT-3',
      }),
    ).toBe('PO-7');
    expect(
      preferredReportReference({
        jobReference: null,
        externalReference: '',
        currentReference: ' CURRENT-3 ',
      }),
    ).toBe('CURRENT-3');
  });

  it('numbers job inspections by natural asset reference without duplicating fallbacks', () => {
    const orderedIds = orderedInspectionIds(
      [
        {
          id: 'inspection-10',
          inspectionType: 'EV inspection',
          asset: { assetReference: '10' },
        },
        undefined,
        {
          id: 'inspection-2',
          inspectionType: 'EV inspection',
          asset: { assetReference: '2' },
        },
      ],
      [
        {
          id: 'inspection-2',
          inspectionType: 'EV inspection',
          asset: { assetReference: '2' },
        },
        {
          id: 'inspection-1',
          inspectionType: 'EV inspection',
          asset: { assetReference: '1' },
        },
      ],
    );

    expect(orderedIds).toEqual(['inspection-1', 'inspection-2', 'inspection-10']);
    expect(
      inspectionReportReference({
        jobReference: '101',
        externalReference: 'PO-7',
        currentReference: 'CURRENT-3',
        inspectionId: 'inspection-2',
        orderedInspectionIds: orderedIds,
      }),
    ).toBe('101-2');
  });

  it('leaves standalone inspection references unnumbered', () => {
    expect(
      inspectionReportReference({
        currentReference: 'INS-44',
        inspectionId: 'inspection-a',
      }),
    ).toBe('INS-44');
  });
});
