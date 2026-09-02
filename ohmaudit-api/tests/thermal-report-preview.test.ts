import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import {
  createApp,
  readBoundedJson,
  thermalCertificateData,
  thermalReportPreviewInput,
} from '../src/app';
import type { ApiBindings } from '../src/shared/environment';

const environment = {
  APP_ENV: 'local',
  APP_VERSION: 'test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  ALLOWED_ORIGINS: 'http://localhost:4200',
} as ApiBindings;

describe('Thermal draft report preview', () => {
  it('accepts only bounded draft data and signature fields', () => {
    expect(
      thermalReportPreviewInput.safeParse({
        data: { outcome: 'PASS' },
        signature: {
          signerName: 'Test Engineer',
          signerRole: 'Engineer',
          signatureData: 'typed',
        },
      }).success,
    ).toBe(true);
    expect(
      thermalReportPreviewInput.safeParse({
        data: {},
        signature: { signerName: 'X', signerRole: 'E', signatureData: 'x' },
        defects: [],
      }).success,
    ).toBe(false);
  });

  it('rejects a declared oversized preview body before reading it', async () => {
    const request = new Request('https://api.example.test/preview', {
      method: 'POST',
      headers: { 'content-length': '524289' },
      body: '{}',
    });

    await expect(readBoundedJson(request, 512 * 1024)).rejects.toMatchObject({
      code: 'REQUEST_TOO_LARGE',
      status: 413,
    });
  });

  it('rejects an oversized streamed preview body without Content-Length', async () => {
    const request = new Request('https://api.example.test/preview', {
      method: 'POST',
      body: new Uint8Array(600_000),
    });

    expect(request.headers.has('content-length')).toBe(false);
    await expect(readBoundedJson(request, 512 * 1024)).rejects.toMatchObject({
      code: 'REQUEST_TOO_LARGE',
      status: 413,
    });
  });

  it('maps malformed bounded JSON to the stable validation error', async () => {
    const request = new Request('https://api.example.test/preview', {
      method: 'POST',
      body: '{',
    });

    await expect(readBoundedJson(request, 512 * 1024)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 422,
    });
  });

  it('scopes thermal payload media to the source inspection', async () => {
    let mediaWhere: unknown;
    const findMany = vi.fn((input: { where: unknown }) => {
      mediaWhere = input.where;
      return Promise.resolve([]);
    });
    const prisma = { media: { findMany } } as unknown as PrismaClient;

    await thermalCertificateData({
      environment,
      prisma,
      organisationId: 'organisation-a',
      inspectionId: 'inspection-a',
      revisionData: { targets: [{ imageIds: ['media-a'] }] },
      reportReference: 'DRAFT-INSPECTI',
      organisationName: 'Test Organisation',
      customerName: 'Test Customer',
      siteName: 'Test Site',
      siteAddress: [],
      reportDate: new Date('2026-09-02T00:00:00.000Z'),
      engineerName: 'Test Engineer',
    });

    expect(mediaWhere).toMatchObject({
      organisationId: 'organisation-a',
      entityType: 'Inspection',
      entityId: 'inspection-a',
    });
  });

  it('requires member authentication and exposes no guest preview route', async () => {
    const inspectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const organisationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const memberResponse = await createApp().request(
      `/api/v1/inspections/${inspectionId}/report-preview.pdf?organisationId=${organisationId}`,
      { method: 'POST' },
      environment,
    );
    const guestResponse = await createApp().request(
      `/api/v1/guest/visits/token/inspections/${inspectionId}/report-preview.pdf`,
      { method: 'POST' },
      environment,
    );

    expect(memberResponse.status).toBe(401);
    expect(guestResponse.status).toBe(404);
  });
});
