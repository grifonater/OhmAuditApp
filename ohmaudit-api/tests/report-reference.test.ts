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

  it('numbers job inspections in task order without duplicating fallback inspections', () => {
    const orderedIds = orderedInspectionIds(
      ['inspection-b', undefined, 'inspection-a'],
      ['inspection-a', 'inspection-c'],
    );

    expect(orderedIds).toEqual(['inspection-b', 'inspection-a', 'inspection-c']);
    expect(
      inspectionReportReference({
        jobReference: '101',
        externalReference: 'PO-7',
        currentReference: 'CURRENT-3',
        inspectionId: 'inspection-a',
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
