import { describe, expect, it } from 'vitest';
import type { AssetMedia } from '../src/app/core/api.service';
import {
  buildMediaMetadataUpdateBody,
  buildThermalInspectionReport,
  canReviewThermalPdf,
  metadataFailureAction,
  normalizeImageDescriptions,
  normalizeThermalTarget,
  patchImageDescription,
  remapImageDescriptions,
  remapThermalSubmissionIds,
  remapThermalTargetIds,
  thermalImageLimitError,
  thermalPreviewBody,
  thermalPreviewSignerError,
  type ThermalDetails,
  type ThermalTarget,
} from '../src/app/operations/thermal-inspection.helpers';

const details: ThermalDetails = {
  scope: 'Main distribution equipment',
  purpose: 'Inspection',
  inspectionMethod: 'Thermography',
  areasInspected: 'Plant room',
  areasExcluded: '',
  limitations: '',
  environmentalConditions: '',
  loadCondition: 'Normal load',
  clientRepresentative: '',
  ambientTemperatureC: 20,
  emissivity: 0.95,
  reflectedTemperatureC: 20,
  equipmentId: '',
  additionalNotes: '',
};
const media = (id: string, sortOrder: number): AssetMedia => ({
  id,
  category: 'thermal-image',
  caption: `Image ${id}`,
  tags: ['panel'],
  sortOrder,
  mimeType: 'image/jpeg',
});
const target: ThermalTarget = {
  id: 'target-1',
  name: 'Main panel',
  reference: 'DB-1',
  location: 'Plant room',
  imageIds: ['media-1'],
  imageDescriptions: { 'media-1': 'Infrared image showing the hot connection.' },
  condition: 'FAULT',
  issueSummary: 'Elevated temperature',
  severity: 'MAJOR',
  maxTemperatureC: 70,
  deltaTemperatureC: 25,
  observations: 'Hot connection',
  recommendation: 'Inspect connection',
};

describe('thermal inspection helpers', () => {
  it('constructs one ordered bulk metadata request body', () => {
    expect(
      buildMediaMetadataUpdateBody([
        { mediaId: 'server-2', media: media('local-2', 0) },
        { mediaId: 'server-1', media: media('local-1', 1) },
      ]),
    ).toEqual({
      updates: [
        {
          mediaId: 'server-2',
          category: 'thermal-image',
          caption: 'Image local-2',
          tags: ['panel'],
          sortOrder: 0,
        },
        {
          mediaId: 'server-1',
          category: 'thermal-image',
          caption: 'Image local-1',
          tags: ['panel'],
          sortOrder: 1,
        },
      ],
    });
  });

  it('uses the exact draft report data and signature for preview', () => {
    const report = buildThermalInspectionReport({
      details,
      targets: [target],
      images: [media('media-1', 0)],
      signerName: 'Alex Engineer',
      signedAt: '2026-09-02T12:00:00.000Z',
    });
    expect(thermalPreviewBody(report)).toEqual({
      data: report.data,
      signature: report.signature,
    });
    expect(report.defects[0]?.photoMediaIds).toEqual(report.data.targets[0]?.imageIds);
    expect(report.data.targets[0]?.imageDescriptions).toEqual(target.imageDescriptions);
  });

  it('only offers preview to an online member with a current inspection', () => {
    expect(canReviewThermalPdf({ guestToken: '', online: true, hasInspection: true })).toBe(true);
    expect(canReviewThermalPdf({ guestToken: 'guest', online: true, hasInspection: true })).toBe(
      false,
    );
    expect(canReviewThermalPdf({ guestToken: '', online: false, hasInspection: true })).toBe(false);
    expect(canReviewThermalPdf({ guestToken: '', online: true, hasInspection: false })).toBe(false);
  });

  it('enforces the single-request 500 image limit before upload', () => {
    expect(thermalImageLimitError(498, 2)).toBe('');
    expect(thermalImageLimitError(498, 3)).toContain('up to 500 images');
  });

  it('normalizes legacy targets and sanitizes malformed description maps', () => {
    const legacy = normalizeThermalTarget({ ...target, imageDescriptions: undefined });
    expect(legacy?.imageDescriptions).toEqual({});

    const normalized = normalizeThermalTarget({
      ...target,
      imageIds: ['media-1', 'media-2'],
      imageDescriptions: {
        'media-1': `  ${'x'.repeat(510)}  `,
        'media-2': 42,
        orphan: 'not assigned',
      },
    });
    expect(normalized?.imageDescriptions).toEqual({ 'media-1': 'x'.repeat(500) });
  });

  it('patches descriptions sparsely and removes empty values', () => {
    const assigned = { imageIds: ['media-1', 'media-2'], imageDescriptions: {} };
    const patched = patchImageDescription(assigned, 'media-1', '  Panel connection  ');
    expect(patched).toEqual({ 'media-1': 'Panel connection' });
    expect(
      patchImageDescription({ ...assigned, imageDescriptions: patched }, 'media-1', '   '),
    ).toEqual({});
    expect(normalizeImageDescriptions(assigned.imageIds, { orphan: 'ignored' })).toEqual({});
  });

  it('remaps only thermal ID fields and description keys for offline sync', () => {
    const submission = {
      data: {
        note: 'offline:media-1',
        targets: [
          {
            imageIds: ['offline:media-1'],
            imageDescriptions: { 'offline:media-1': 'Connection detail' },
          },
        ],
      },
      defects: [{ photoMediaIds: ['offline:media-1'] }],
      arbitrary: { 'offline:media-1': 'offline:media-1' },
    };
    expect(remapThermalSubmissionIds(submission, { 'offline:media-1': 'server-1' })).toEqual({
      data: {
        note: 'offline:media-1',
        targets: [
          { imageIds: ['server-1'], imageDescriptions: { 'server-1': 'Connection detail' } },
        ],
      },
      defects: [{ photoMediaIds: ['server-1'] }],
      arbitrary: { 'offline:media-1': 'offline:media-1' },
    });
    expect(
      remapImageDescriptions(
        ['offline:media-1'],
        { 'offline:media-1': 'Connection detail' },
        { 'offline:media-1': 'server-1' },
      ),
    ).toEqual({ 'server-1': 'Connection detail' });
  });

  it('preserves descriptions while the report builder IDs are remapped', () => {
    expect(remapThermalTargetIds(target, { 'media-1': 'server-1' })).toMatchObject({
      imageIds: ['server-1'],
      imageDescriptions: { 'server-1': 'Infrared image showing the hot connection.' },
    });
  });

  it('validates preview signer names before opening a window', () => {
    expect(thermalPreviewSignerError(' A ')).toContain('engineer name');
    expect(thermalPreviewSignerError('Alex Engineer')).toBe('');
  });

  it('retries failed metadata online but defers dirty metadata offline', () => {
    expect(metadataFailureAction(true, 2)).toBe('retry');
    expect(metadataFailureAction(false, 2)).toBe('defer');
    expect(metadataFailureAction(true, 0)).toBe('fail');
  });
});
