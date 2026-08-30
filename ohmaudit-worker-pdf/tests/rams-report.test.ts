import { describe, expect, it } from 'vitest';
import pdfWorker, { renderRamsReportHtml, type RamsRenderPayload } from '../src/index';

function payload(): RamsRenderPayload {
  return {
    templateVersion: 'rams-a4-v1',
    documentState: 'UNDER_REVIEW',
    revisionNumber: 2,
    reference: 'RAMS-001',
    title: 'Replace <main> distribution board',
    effectiveFrom: '2026-09-01',
    submittedAt: '2026-08-30T09:00:00Z',
    approvedAt: null,
    reviewComment: 'Confirm isolation & prove dead',
    generatedAt: '2026-08-30T10:00:00Z',
    organisation: { name: 'OhmAudit Electrical Ltd', addressLines: ['1 Test Street'] },
    job: {
      id: 'job-1',
      reference: 'JOB-001',
      externalReference: 'PO-42',
      title: 'Distribution board replacement',
      category: 'Electrical installation',
      jobType: 'Planned works',
      plannedStart: '2026-09-01',
      targetCompletion: '2026-09-02',
    },
    customer: { name: 'Apex & Co' },
    site: { name: 'Apex House', addressLines: ['1 Victoria Street', 'Bristol'] },
    people: {
      preparedBy: { displayName: 'A <Author>', email: 'author@example.test' },
      reviewedBy: { displayName: 'R Reviewer' },
      assignedEngineer: { displayName: 'E Engineer' },
    },
    data: {
      schemaVersion: 2,
      overview: {
        title: 'DB replacement',
        category: 'Electrical',
        effectiveFrom: '2026-09-01',
        reviewBy: '2026-09-30',
        revisionSummary: 'Added isolation controls',
      },
      scope: {
        scopeOfWorks: 'Isolate and replace the board.',
        exclusions: ['Upstream network alterations'],
        engineerBriefing: ['Review switching schedule'],
        keyActivities: ['Safe isolation', 'Functional testing'],
        assumptions: ['Shutdown is approved'],
        workAreas: ['Main switch room'],
        workBoundaries: 'Barriered work zone',
        responsibilities: [
          {
            id: 'responsibility-1',
            name: 'S Supervisor',
            role: 'Site supervisor',
            organisation: 'OhmAudit Electrical Ltd',
            responsibility: 'Controls access',
            contact: '07000 000000',
          },
        ],
      },
      methodStatement: {
        steps: [
          {
            id: 'step-1',
            title: 'Isolate supply',
            required: true,
            detail: 'Lock off, label and prove dead.',
            responsibility: 'Authorised electrician',
            estimatedMinutes: 30,
          },
        ],
      },
      riskAssessment: {
        hazards: [
          {
            id: 'hazard-1',
            hazard: 'Electric shock',
            peopleAtRisk: 'Engineers',
            howHarmed: 'Contact with live conductors',
            initialLikelihood: 4,
            initialSeverity: 5,
            controls: 'Safe isolation and lock-off.',
            residualLikelihood: 1,
            residualSeverity: 5,
            furtherActions: 'Verify test instrument',
            actionOwner: 'Supervisor',
            actionDueDate: '2026-09-01',
            actionStatus: 'OPEN',
          },
        ],
      },
      requirements: {
        ppe: ['Arc-rated clothing'],
        tools: ['GS38 test equipment'],
        plant: ['Access tower'],
        materials: ['Distribution board'],
        competencies: ['18th Edition'],
        training: ['Safe isolation'],
        substances: ['Cleaning solvent'],
        welfare: ['Client facilities'],
        emergencyArrangements: ['Stop work and call 999'],
        emergencyDetails: {
          contactName: 'Site control',
          contactNumber: '07000 000001',
          nearestHospital: 'Central Hospital',
          hospitalAddress: '1 Hospital Road',
          assemblyPoint: 'Main gate',
          additionalInfo: 'Call site control after emergency services.',
        },
      },
      supportingInformation: {
        siteAccess: 'Sign in at reception.',
        permits: 'Electrical permit required.',
        welfare: 'Welfare on ground floor.',
        environmental: 'Segregate waste.',
        references: [
          { id: 'ref-1', title: 'Switching schedule', url: 'https://malicious.test/<script>' },
        ],
        permitReferences: [{ id: 'permit-1', name: 'Permit to work', reference: 'PTW-001' }],
        coshhReferences: [{ id: 'coshh-1', name: 'Cleaning solvent', reference: 'COSHH-001' }],
        workingAtHeightReferences: [
          { id: 'wah-1', name: 'Tower rescue plan', reference: 'WAH plan 1' },
        ],
        legislationReferences: [
          {
            id: 'law-1',
            name: 'Electricity at Work Regulations',
            reference: '1989',
          },
        ],
        documents: [
          {
            id: 'document-1',
            name: 'Board drawing',
            type: 'Drawing',
            reference: 'DRG-001',
            status: 'Approved',
          },
        ],
        electricalSafety: ['Follow GS6 and safe isolation procedure.'],
      },
      review: {
        approvalMode: 'REVIEWER',
        requireEngineerAcknowledgement: true,
        internalNotes: 'Internal note',
        changeImpact: 'Engineers must be re-briefed.',
        revisionReason: 'Review feedback',
        changeSummary: 'Isolation sequence updated.',
      },
    },
    revisionHistory: [
      {
        revisionNumber: 1,
        createdAt: '2026-08-29T12:00:00Z',
        createdBy: { displayName: 'A Author' },
        status: 'SUBMITTED',
        summary: 'Initial issue',
      },
    ],
  };
}

const environment = {
  APP_ENV: 'local',
  APP_VERSION: 'test',
  RENDER_TIMEOUT_MS: '30000',
} as const;

describe('RAMS A4 renderer', () => {
  it('renders the complete controlled document and escapes all client content', () => {
    const html = renderRamsReportHtml(payload());
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('<strong>UNDER REVIEW</strong>');
    expect(html).toContain('UNDER REVIEW - NOT APPROVED FOR USE');
    expect(html).toContain('Scope, boundaries &amp; responsibilities');
    expect(html).toContain('Resources, competence &amp; substances');
    expect(html).toContain('Risk assessment');
    expect(html).toContain('aria-label="Five by five risk matrix"');
    expect(html).toContain('Engineer acknowledgement');
    expect(html).toContain('Revision history');
    expect(html).toContain('CONTROLLED DOCUMENT');
    expect(html).toContain('Replace &lt;main&gt; distribution board');
    expect(html).toContain('A &lt;Author&gt;');
    expect(html).toContain('https://malicious.test/&lt;script&gt;');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/(?:src|href)=["']https?:/u);
  });

  it('uses Browser Run for A4 printing with JavaScript disabled', async () => {
    let options: BrowserRunPDFOptions | undefined;
    const browser = {
      quickAction: (_action: 'pdf', received: BrowserRunPDFOptions) => {
        options = received;
        return Promise.resolve(
          new Response('%PDF-1.7\nrams', {
            headers: { 'content-type': 'application/pdf', 'x-browser-ms-used': '321' },
          }),
        );
      },
    } as unknown as BrowserRun;
    const response = await pdfWorker.fetch(
      new Request('https://pdf.test/render/rams-a4-v1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload()),
      }),
      { ...environment, BROWSER: browser },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-ohmaudit-pdf-renderer')).toBe('browser-run');
    expect(options?.setJavaScriptEnabled).toBe(false);
    expect(options?.emulateMediaType).toBe('print');
    expect(options?.pdfOptions).toMatchObject({
      format: 'a4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });
    expect(options !== undefined && 'html' in options ? options.html : '').toContain(
      'Electrical safety',
    );
  });

  it('rejects declared and actual bodies larger than 1 MB', async () => {
    const declared = await pdfWorker.fetch(
      new Request('https://pdf.test/render/rams-a4-v1', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '1048577' },
        body: '{}',
      }),
      environment,
    );
    const actual = await pdfWorker.fetch(
      new Request('https://pdf.test/render/rams-a4-v1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: `{"padding":"${'x'.repeat(1024 * 1024)}"}`,
      }),
      environment,
    );

    expect(declared.status).toBe(413);
    expect(await declared.json()).toMatchObject({ code: 'RAMS_PAYLOAD_TOO_LARGE' });
    expect(actual.status).toBe(413);
  });

  it('returns structured validation and renderer errors without native fallback', async () => {
    const invalid = await pdfWorker.fetch(
      new Request('https://pdf.test/render/rams-a4-v1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentState: 'DRAFT' }),
      }),
      environment,
    );
    const unavailable = await pdfWorker.fetch(
      new Request('https://pdf.test/render/rams-a4-v1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload()),
      }),
      environment,
    );

    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ code: 'INVALID_RAMS_PAYLOAD' });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('x-ohmaudit-pdf-renderer')).toBeNull();
    expect(await unavailable.json()).toMatchObject({ code: 'RAMS_RENDERER_UNAVAILABLE' });
  });
});
