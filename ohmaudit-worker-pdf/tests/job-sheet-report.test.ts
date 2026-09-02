import { describe, expect, it } from 'vitest';
import pdfWorker, {
  renderJobSheetReportHtml,
  type JobSheetRenderPayload,
  type RamsRenderPayload,
} from '../src/index';

function rams(reference: string): RamsRenderPayload {
  return {
    templateVersion: 'rams-a4-v1',
    documentState: 'DRAFT',
    revisionNumber: null,
    reference,
    title: `RAMS ${reference}`,
    effectiveFrom: null,
    submittedAt: null,
    approvedAt: null,
    reviewComment: null,
    generatedAt: '2026-09-02T09:00:00Z',
    organisation: { name: 'Ohm & Co', addressLines: ['1 Test Street'] },
    job: {
      id: 'job-1',
      reference: 'JOB-001',
      externalReference: null,
      title: 'Test job',
      category: null,
      jobType: null,
      plannedStart: null,
      targetCompletion: null,
    },
    customer: { name: 'Customer' },
    site: { name: 'Site', addressLines: ['Site road'] },
    jobs: [
      {
        job: {
          id: 'job-1',
          reference: 'JOB-001',
          externalReference: null,
          title: 'Test job',
          category: null,
          jobType: null,
          plannedStart: null,
          targetCompletion: null,
        },
        customer: { name: 'Customer' },
        site: { name: 'Site', addressLines: ['Site road'] },
      },
    ],
    people: { preparedBy: { name: 'Author' } },
    data: {
      schemaVersion: 2,
      overview: { title: 'Overview', category: '', effectiveFrom: '' },
      scope: { scopeOfWorks: 'Safe work', exclusions: [], engineerBriefing: [] },
      methodStatement: { steps: [] },
      riskAssessment: { hazards: [] },
      requirements: { ppe: [], tools: [], competencies: [], emergencyArrangements: [] },
      supportingInformation: {
        siteAccess: '',
        permits: '',
        welfare: '',
        environmental: '',
        references: [],
      },
      review: { approvalMode: 'AUTHOR', requireEngineerAcknowledgement: false },
    },
    revisionHistory: [],
    acknowledgements: [],
  };
}

function payload(): JobSheetRenderPayload {
  return {
    templateVersion: 'job-sheet-a4-v1',
    generatedAt: '2026-09-02T10:30:00Z',
    organisation: {
      name: 'Ohm <Audit>',
      addressLines: ['1 & 2 Test Street', 'Northampton'],
      telephone: '01604 000000',
      email: 'work@example.test',
      website: 'https://example.test',
      logoImage: { mimeType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' },
    },
    job: {
      id: 'job-1',
      reference: 'JOB-<&',
      externalReference: 'PO-42',
      title: 'Inspect <main> board',
      description: 'Inspect & test all circuits.',
      exclusions: 'Roof <plant>',
      jobType: 'Planned work',
      category: 'Electrical',
      status: 'SCHEDULED',
      scheduledStart: '2026-09-03T08:00:00Z',
      scheduledEnd: '2026-09-03T16:00:00Z',
      engineerNotes: 'Call "reception".',
    },
    customer: { name: 'Apex & Co', reference: 'CUST-1' },
    site: {
      name: 'Apex House',
      reference: 'SITE-1',
      addressLines: ['1 Victoria Street', 'Bristol', 'BS1 1AA'],
      accessInstructions: 'Sign in at reception.',
      parkingInformation: 'Use bay 5.',
      openingTimes: '08:00-17:00',
      ppeRequirements: 'Safety boots',
      inductionInformation: 'Online induction required.',
    },
    contacts: [
      {
        name: 'Site <Manager>',
        role: 'Manager',
        email: 'site@example.test',
        telephone: '0117 000000',
        mobile: '07000 000000',
        primary: true,
      },
    ],
    assignment: {
      name: 'E Engineer',
      email: 'engineer@example.test',
      mobile: '07000 000001',
      kind: 'MEMBER',
    },
    tasks: [
      {
        order: 2,
        title: 'Final checks',
        moduleKey: 'final-checks',
        status: 'PENDING',
        asset: null,
        inspection: null,
      },
      {
        order: 1,
        title: 'Inspect board',
        moduleKey: 'fixed-wire',
        status: 'READY',
        asset: {
          reference: 'DB-01',
          displayName: 'Main DB',
          type: 'Distribution board',
          manufacturer: 'Example',
          model: 'DB100',
          serialNumber: 'SN-001',
        },
        inspection: { status: 'DRAFT', currentRevisionNumber: 3 },
      },
    ],
    attachedRams: [
      {
        reference: 'RAMS-001',
        title: 'Electrical works',
        documentState: 'APPROVED',
        revisionNumber: 2,
      },
    ],
  };
}

const environment = {
  APP_ENV: 'local',
  APP_VERSION: 'test',
  RENDER_TIMEOUT_MS: '30000',
} as const;

function request(path: string, body: unknown): Request {
  return new Request(`https://pdf.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('job sheet A4 renderer', () => {
  it('renders complete escaped data with only embedded image resources', () => {
    const html = renderJobSheetReportHtml(payload());

    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('Ohm &lt;Audit&gt;');
    expect(html).toContain('Inspect &lt;main&gt; board');
    expect(html).toContain('Roof &lt;plant&gt;');
    expect(html).toContain('Site &lt;Manager&gt;');
    expect(html).toContain('1 Victoria Street\nBristol\nBS1 1AA');
    expect(html).toContain('DB-01');
    expect(html).toContain('Distribution board');
    expect(html).toContain('Revision 3');
    expect(html).toContain('RAMS-001');
    expect(html).toContain('2026-09-02T10:30:00Z');
    expect(html.indexOf('Inspect board')).toBeLessThan(html.indexOf('Final checks'));
    expect(html).toContain('src="data:image/png;base64,iVBOR');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/(?:src|href)=["'](?:https?:)?\/\//u);
  });

  it('appends every full RAMS at a new-page boundary without fixed package watermarks', () => {
    const input = payload();
    input.rams = [rams('RAMS-A'), rams('RAMS-B')];
    const html = renderJobSheetReportHtml(input);

    expect(html.match(/<section class="package-rams">/gu)).toHaveLength(2);
    expect(html).toContain('RAMS-A');
    expect(html).toContain('RAMS-B');
    expect(html.match(/RISK ASSESSMENT &amp; METHOD STATEMENT/gu)).toHaveLength(2);
    expect(html.match(/src="data:image\/png;base64,iVBOR/gu)).toHaveLength(3);
    expect(html).toContain('break-before: page');
    expect(html).toContain('.package-rams .watermark { position: absolute !important; }');
  });

  it('validates the base and with-RAMS routes independently', async () => {
    const base = payload();
    const withRams = payload();
    withRams.rams = [];
    const browser = {
      quickAction: () => Promise.resolve(new Response('%PDF-1.7', { status: 200 })),
    } as unknown as BrowserRun;

    const baseResponse = await pdfWorker.fetch(request('/render/job-sheet-a4-v1', base), {
      ...environment,
      BROWSER: browser,
    });
    const packageResponse = await pdfWorker.fetch(
      request('/render/job-sheet-with-rams-a4-v1', withRams),
      { ...environment, BROWSER: browser },
    );
    const missingRams = await pdfWorker.fetch(request('/render/job-sheet-with-rams-a4-v1', base), {
      ...environment,
      BROWSER: browser,
    });

    expect(baseResponse.status).toBe(200);
    expect(packageResponse.status).toBe(200);
    expect(missingRams.status).toBe(422);
    await expect(missingRams.json()).resolves.toMatchObject({
      code: 'INVALID_JOB_SHEET_PAYLOAD',
    });
  });

  it('uses Browser Run print options and an escaped package-wide job footer', async () => {
    let options: BrowserRunPDFOptions | undefined;
    const response = await pdfWorker.fetch(request('/render/job-sheet-a4-v1', payload()), {
      ...environment,
      BROWSER: {
        quickAction: (_action: 'pdf', received: BrowserRunPDFOptions) => {
          options = received;
          return Promise.resolve(
            new Response('%PDF-1.7', { headers: { 'x-browser-ms-used': '456' } }),
          );
        },
      } as unknown as BrowserRun,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-ohmaudit-pdf-renderer')).toBe('browser-run');
    expect(response.headers.get('x-ohmaudit-browser-ms-used')).toBe('456');
    expect(options?.setJavaScriptEnabled).toBe(false);
    expect(options?.emulateMediaType).toBe('print');
    expect(options?.pdfOptions).toMatchObject({
      format: 'a4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      tagged: true,
      outline: true,
    });
    expect(options?.pdfOptions?.footerTemplate).toContain('Job JOB-&lt;&amp;');
    expect(options?.pdfOptions?.footerTemplate).toContain(
      'Page <span class="pageNumber"></span> of <span class="totalPages"></span>',
    );
  });

  it('rejects malformed job sheets and malformed nested RAMS', async () => {
    const malformed = payload();
    malformed.tasks[0]!.order = 1.5;
    const nested = payload();
    nested.rams = [
      { ...rams('RAMS-BAD'), documentState: 'INVALID' } as unknown as RamsRenderPayload,
    ];

    const malformedResponse = await pdfWorker.fetch(
      request('/render/job-sheet-a4-v1', malformed),
      environment,
    );
    const nestedResponse = await pdfWorker.fetch(
      request('/render/job-sheet-with-rams-a4-v1', nested),
      environment,
    );

    expect(malformedResponse.status).toBe(422);
    expect(nestedResponse.status).toBe(422);
    await expect(nestedResponse.json()).resolves.toMatchObject({
      code: 'INVALID_JOB_SHEET_PAYLOAD',
    });
  });

  it('returns structured errors when Browser Run is unavailable or fails', async () => {
    const unavailable = await pdfWorker.fetch(
      request('/render/job-sheet-a4-v1', payload()),
      environment,
    );
    const failed = await pdfWorker.fetch(request('/render/job-sheet-a4-v1', payload()), {
      ...environment,
      BROWSER: {
        quickAction: () => Promise.resolve(new Response('failed', { status: 429 })),
      } as unknown as BrowserRun,
    });

    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({
      code: 'JOB_SHEET_RENDERER_UNAVAILABLE',
    });
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toMatchObject({ code: 'JOB_SHEET_RENDER_FAILED' });
  });
});
