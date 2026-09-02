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
      return Promise.resolve([
        {
          id: 'media-a',
          organisationId: 'organisation-a',
          entityType: 'Inspection',
          entityId: 'inspection-a',
          category: 'thermal-image',
          mimeType: 'image/jpeg',
          status: 'AVAILABLE',
          storageKey: 'inspection-a/media-a.jpg',
        },
      ]);
    });
    const prisma = {
      media: {
        findMany,
        findFirst: vi.fn(() =>
          Promise.resolve({
            id: 'media-a',
            organisationId: 'organisation-a',
            mimeType: 'image/jpeg',
            status: 'AVAILABLE',
            storageKey: 'inspection-a/media-a.jpg',
          }),
        ),
      },
    } as unknown as PrismaClient;
    const mediaEnvironment = {
      ...environment,
      MEDIA_BUCKET: {
        get: vi.fn(() =>
          Promise.resolve({
            size: 3,
            arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
          }),
        ),
      },
    } as unknown as ApiBindings;

    await thermalCertificateData({
      environment: mediaEnvironment,
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

  it('retrieves all unique assigned images and preserves target image order and descriptions', async () => {
    const ids = Array.from({ length: 24 }, (_, index) => `media-${index + 1}`);
    let requestedIds: string[] = [];
    const rows = ids.map((id, index) => ({
      id,
      organisationId: 'organisation-a',
      entityType: 'Inspection',
      entityId: 'inspection-a',
      category:
        index === 0 ? 'unclassified-image' : index % 2 === 0 ? 'thermal-image' : 'standard-image',
      mimeType: 'image/jpeg',
      status: 'AVAILABLE',
      storageKey: `inspection-a/${id}.jpg`,
    }));
    const findMany = vi.fn((input: { where: { id: { in: string[] } } }) => {
      requestedIds = input.where.id.in;
      return Promise.resolve([...rows].reverse());
    });
    const findFirst = vi.fn((input: { where: { id: string; organisationId: string } }) =>
      Promise.resolve(
        rows.find(
          ({ id, organisationId }) =>
            id === input.where.id && organisationId === input.where.organisationId,
        ) ?? null,
      ),
    );
    const prisma = { media: { findMany, findFirst } } as unknown as PrismaClient;
    const bytes = new TextEncoder().encode('jpeg bytes');
    const mediaEnvironment = {
      ...environment,
      MEDIA_BUCKET: {
        get: vi.fn(() =>
          Promise.resolve({
            size: bytes.byteLength,
            arrayBuffer: () => Promise.resolve(bytes.buffer),
          }),
        ),
      },
    } as unknown as ApiBindings;

    const result = await thermalCertificateData({
      environment: mediaEnvironment,
      prisma,
      organisationId: 'organisation-a',
      inspectionId: 'inspection-a',
      revisionData: {
        targets: [
          {
            name: 'First',
            imageIds: ids.slice(0, 13),
            imageDescriptions: { 'media-1': '  first\u0000 description  ' },
          },
          {
            name: 'Second',
            imageIds: ['media-1', ...ids.slice(13)],
            imageDescriptions: {
              'media-1': 'Target-specific text',
              'media-14': 'x'.repeat(600),
            },
          },
        ],
      },
      reportReference: 'THERMAL-001',
      organisationName: 'Test Organisation',
      customerName: 'Test Customer',
      siteName: 'Test Site',
      siteAddress: [],
      reportDate: new Date('2026-09-02T00:00:00.000Z'),
      engineerName: 'Test Engineer',
    });

    expect(requestedIds).toEqual(ids.slice(0, 24));
    expect(result.targets[0]?.images).toHaveLength(13);
    expect(result.targets[1]?.images.map(({ kind }) => kind)).toEqual([
      'Visual',
      ...ids.slice(13, 24).map((_, index) => (index % 2 === 1 ? 'Infrared' : 'Standard')),
    ]);
    expect(result.targets[0]?.images[0]).toMatchObject({ description: 'first  description' });
    expect(result.targets[1]?.images[0]).toMatchObject({ description: 'Target-specific text' });
    expect(result.targets[1]?.images[1]?.description).toHaveLength(500);
    expect(result.targets[1]?.images).toHaveLength(12);
  });

  it('throws THERMAL_REPORT_IMAGE_UNAVAILABLE when a scoped media lookup cannot resolve every requested id', async () => {
    let requestedIds: string[] = [];
    const prisma = {
      media: {
        findMany: vi.fn((input: { where: { id: { in: string[] } } }) => {
          requestedIds = input.where.id.in;
          return Promise.resolve([
            {
              id: 'media-1',
              organisationId: 'organisation-a',
              entityType: 'Inspection',
              entityId: 'inspection-a',
              category: 'thermal-image',
              mimeType: 'image/jpeg',
              status: 'AVAILABLE',
              storageKey: 'inspection-a/media-1.jpg',
            },
          ]);
        }),
      },
    } as unknown as PrismaClient;

    await expect(
      thermalCertificateData({
        environment,
        prisma,
        organisationId: 'organisation-a',
        inspectionId: 'inspection-a',
        revisionData: { targets: [{ imageIds: ['media-1', 'media-2'] }] },
        reportReference: 'THERMAL-001',
        organisationName: 'Test Organisation',
        customerName: 'Test Customer',
        siteName: 'Test Site',
        siteAddress: [],
        reportDate: new Date('2026-09-02T00:00:00.000Z'),
        engineerName: 'Test Engineer',
      }),
    ).rejects.toMatchObject({
      code: 'THERMAL_REPORT_IMAGE_UNAVAILABLE',
      status: 422,
    });

    expect(requestedIds).toEqual(['media-1', 'media-2']);
  });

  it('throws THERMAL_REPORT_IMAGE_UNAVAILABLE when a resolved image cannot be loaded from storage', async () => {
    const prisma = {
      media: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              id: 'media-1',
              organisationId: 'organisation-a',
              entityType: 'Inspection',
              entityId: 'inspection-a',
              category: 'thermal-image',
              mimeType: 'image/jpeg',
              status: 'AVAILABLE',
              storageKey: 'inspection-a/media-1.jpg',
            },
            {
              id: 'media-2',
              organisationId: 'organisation-a',
              entityType: 'Inspection',
              entityId: 'inspection-a',
              category: 'thermal-image',
              mimeType: 'image/jpeg',
              status: 'AVAILABLE',
              storageKey: 'inspection-a/media-2.jpg',
            },
          ]),
        ),
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
    } as unknown as PrismaClient;
    const mediaEnvironment = {
      ...environment,
      MEDIA_BUCKET: {
        get: vi.fn(() => Promise.resolve(null)),
      },
    } as unknown as ApiBindings;

    await expect(
      thermalCertificateData({
        environment: mediaEnvironment,
        prisma,
        organisationId: 'organisation-a',
        inspectionId: 'inspection-a',
        revisionData: { targets: [{ imageIds: ['media-1', 'media-2'] }] },
        reportReference: 'THERMAL-001',
        organisationName: 'Test Organisation',
        customerName: 'Test Customer',
        siteName: 'Test Site',
        siteAddress: [],
        reportDate: new Date('2026-09-02T00:00:00.000Z'),
        engineerName: 'Test Engineer',
      }),
    ).rejects.toMatchObject({
      code: 'THERMAL_REPORT_IMAGE_UNAVAILABLE',
      status: 422,
    });
  });

  it('prioritises an issued-document outcome override and enriches the equipment traceability line', async () => {
    const prisma = {
      media: { findMany: vi.fn(() => Promise.resolve([])) },
    } as unknown as PrismaClient;

    const result = await thermalCertificateData({
      environment,
      prisma,
      organisationId: 'organisation-a',
      inspectionId: 'inspection-a',
      revisionData: {
        outcome: 'FAULTS_REPORTED',
        equipment: {
          name: 'FLIR E8-XT',
          equipmentType: 'Thermal imaging camera',
          manufacturer: 'FLIR',
          model: 'E8-XT',
          serialNumber: 'SN-8812',
          calibrationDueAt: '2027-03-15T00:00:00.000Z',
        },
      },
      reportReference: 'THERMAL-001',
      organisationName: 'Test Organisation',
      customerName: 'Test Customer',
      siteName: 'Test Site',
      siteAddress: [],
      reportDate: new Date('2026-09-02T00:00:00.000Z'),
      engineerName: 'Test Engineer',
      outcome: '  Board and terminations found in satisfactory condition.  ',
    });

    expect(result.outcome).toBe('Board and terminations found in satisfactory condition.');
    expect(result.details.equipment).toContain('FLIR E8-XT');
    expect(result.details.equipment).toContain('Thermal imaging camera');
    expect(result.details.equipment).toContain('FLIR E8-XT');
    expect(result.details.equipment).toContain('S/N SN-8812');
    expect(result.details.equipment).toContain('Calibration due 2027-03-15');
  });

  it('falls back to the draft outcome when no issued-document override is provided', async () => {
    const prisma = {
      media: { findMany: vi.fn(() => Promise.resolve([])) },
    } as unknown as PrismaClient;

    const result = await thermalCertificateData({
      environment,
      prisma,
      organisationId: 'organisation-a',
      inspectionId: 'inspection-a',
      revisionData: { outcome: 'FAULTS_REPORTED' },
      reportReference: 'THERMAL-001',
      organisationName: 'Test Organisation',
      customerName: 'Test Customer',
      siteName: 'Test Site',
      siteAddress: [],
      reportDate: new Date('2026-09-02T00:00:00.000Z'),
      engineerName: 'Test Engineer',
    });

    expect(result.outcome).toBe('FAULTS_REPORTED');
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
