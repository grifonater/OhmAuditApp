import { describe, expect, it } from 'vitest';
import {
  normaliseDocumentPath,
  renderCertificatePdf,
  renderEvCertificatePdf,
  renderThermalReportHtml,
  renderThermalCertificatePdf,
  renderVisitReportPdf,
} from '../src/index';
import pdfWorker from '../src/index';

describe('PDF worker', () => {
  it('accepts bounded template identifiers', () => {
    expect(normaliseDocumentPath(new URL('https://pdf.test/render/ev-certificate-v1'))).toBe(
      'ev-certificate-v1',
    );
  });
  it('rejects traversal-shaped paths', () => {
    expect(normaliseDocumentPath(new URL('https://pdf.test/render/../secret'))).toBeUndefined();
  });
  it('renders a valid single-page PDF from an immutable certificate payload', () => {
    const pdf = renderCertificatePdf({
      title: 'EV Charging Inspection Certificate',
      organisationName: 'Demo Electrical Ltd',
      customerName: 'Logistics Customer',
      siteName: 'Raunds',
      assetName: 'Charger 01',
      inspectionType: 'Periodic inspection',
      effectiveDate: '2026-08-14',
      revisionNumber: 1,
      engineerName: 'A Engineer',
      outcome: 'PASS',
      summaryLines: ['Continuity: 0.12 ohm'],
    });
    const text = new TextDecoder().decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('DEMO ELECTRICAL LTD');
    expect(text).toContain('LOGISTICS CUSTOMER');
    expect(text).toContain('CONTINUITY: 0.12 OHM');
    expect(text).not.toContain('Demo Electrical Ltd');
    expect(pdf.byteLength).toBeGreaterThan(500);
  });
  it('groups a visit into a cover page and one page per certificate', () => {
    const certificate = {
      title: 'EV Charging Inspection Certificate',
      organisationName: 'Demo Electrical Ltd',
      customerName: 'Logistics Customer',
      siteName: 'Raunds',
      assetName: 'Charger 01',
      inspectionType: 'Periodic inspection',
      effectiveDate: '2026-08-14',
      revisionNumber: 1,
      engineerName: 'A Engineer',
      outcome: 'PASS',
      summaryLines: ['Continuity: 0.12 ohm'],
    };
    const text = new TextDecoder().decode(
      renderVisitReportPdf({
        title: 'Raunds annual visit — combined report',
        organisationName: certificate.organisationName,
        customerName: certificate.customerName,
        siteName: certificate.siteName,
        visitDate: '2026-08-14',
        certificates: [certificate, { ...certificate, assetName: 'Charger 02' }],
      }),
    );
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 3');
    expect(text).toContain('Certificates included: 2');
    expect(text).toContain('RAUNDS ANNUAL VISIT');
    expect(text).toContain('CHARGER 02');
  });
  it('renders the EV charger template with supplies, connector tests and sign-off', () => {
    const text = new TextDecoder().decode(
      renderEvCertificatePdf({
        testingCompany: {
          name: 'Ohm Audit Electrical Ltd',
          addressLines: ['1 Test Street', 'Northampton, NN1 1AA'],
          registrationNumber: 'NAPIT-12345',
        },
        testingLocation: {
          name: 'DSV — Raunds',
          addressLines: ['Raunds Logistics Park', 'Raunds, NN9 6EQ'],
        },
        charger: {
          name: 'Charger 01',
          location: 'North car park',
          make: 'Example EV',
          model: 'Rapid 50',
          serialNumber: 'SN-001',
          powerOutputKw: '50 kW',
        },
        supplies: [
          {
            label: 'Main supply',
            phaseCount: '3',
            breaker: 'C 63 A',
            earthingArrangement: 'TN-C-S',
            zsOhms: '0.31',
            maximumPfcKa: '2.4',
          },
        ],
        connectors: [
          {
            label: 'Connector A',
            connectorType: 'CCS2',
            supplyNumbers: '1',
            pePreTest: 'PASS',
            cpError: 'PASS',
            peError: 'PASS',
            cpStates: 'PASS',
            rcd1x0Ms: '21',
            rcd1x180Ms: '23',
            rcd5x0Ms: '8',
            rcd5x180Ms: '9',
            dcRcdType: 'RDC-DD',
            dcRamp0Ma: '5.7',
            dcRamp180Ma: '5.9',
          },
        ],
        testDate: '2026-08-14',
        outcome: 'PASS',
        reasonForFailure: '',
        notes: 'Unit is in good condition.',
        engineerName: 'A Engineer',
        certificateReference: 'CERT-001',
      }),
    );
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('EV Charge Point Test Certificate');
    expect(text).toContain('MAIN SUPPLY');
    expect(text).toContain('PE pre-test: PASS');
    expect(text).toContain('Certificate Ref: CERT-001');
    expect(text).toContain('UNIT IS IN GOOD CONDITION.');
    expect(text).toContain('A ENGINEER');
    expect(text).not.toContain('North car park');
  });
  it('renders a multi-page thermal report with target conditions and fault guidance', () => {
    const text = new TextDecoder().decode(
      renderThermalCertificatePdf({
        organisationName: 'Ohm Audit Electrical Ltd',
        customerName: 'Apex Facilities Group',
        siteName: 'Apex House',
        siteAddress: ['1 Victoria Street', 'Bristol BS1 6AA'],
        reportDate: '2026-08-22',
        engineerName: 'A Engineer',
        reportReference: 'THERMAL-001',
        outcome: 'FAULTS_REPORTED',
        targets: [
          {
            name: 'DB-01 Main distribution board',
            reference: 'DB-01',
            location: 'Ground floor electrical room',
            condition: 'FAULT',
            issueSummary: 'Elevated temperature at outgoing breaker L3',
            severity: 'MAJOR',
            maxTemperatureC: '72.4',
            deltaTemperatureC: '31.8',
            observations: 'Hotspot observed at the outgoing breaker connection.',
            recommendation: 'Inspect and retorque connection before return to service.',
            images: [],
          },
          {
            name: 'DB-02 Plant room board',
            reference: 'DB-02',
            location: 'Plant room',
            condition: 'NO_ISSUES',
            issueSummary: '',
            severity: '',
            maxTemperatureC: '',
            deltaTemperatureC: '',
            observations: '',
            recommendation: '',
            images: [],
          },
        ],
      }),
    );
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 4');
    expect(text).toContain('THERMAL IMAGING REPORT');
    expect(text).toContain('DB-01 MAIN DISTRIBUTION BOARD');
    expect(text).toContain('ELEVATED TEMPERATURE AT OUTGOING BREAKER L3');
    expect(text).toContain('NO THERMAL ANOMALIES OR REPORTABLE ISSUES');
    expect(text).not.toContain('Apex Facilities Group');
  });
  it('renders a self-contained A4 thermal report preview with escaped client content', () => {
    const html = renderThermalReportHtml({
      organisationName: 'Ohm Audit Electrical Ltd',
      customerName: 'Apex <Facilities>',
      siteName: 'Apex House',
      siteAddress: ['1 Victoria Street', 'Bristol BS1 6AA'],
      reportDate: '2026-08-23',
      engineerName: 'A Engineer',
      reportReference: 'THERMAL-001',
      outcome: 'FAULTS_REPORTED',
      logoImage: {
        mimeType: 'image/png',
        base64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lm8uWQAAAABJRU5ErkJggg==',
      },
      details: {
        scope: 'Main distribution equipment',
        purpose: 'Identify abnormal heating',
        inspectionMethod: 'Non-contact survey under normal load',
        areasInspected: 'Main switch room',
        areasExcluded: 'Roof plant room',
        limitations: 'Panels remained energised',
        environmentalConditions: 'Dry',
        loadCondition: 'Normal operating load',
        ambientTemperatureC: '21.4',
        emissivity: '0.95',
        reflectedTemperatureC: '20.8',
        clientRepresentative: 'S Mitchell',
        additionalNotes: 'Access provided by facilities team',
        equipment: 'Flir E8-XT · S/N 12345',
      },
      targets: [
        {
          name: 'DB-01 Main board',
          reference: 'DB-01',
          location: 'Ground floor switch room',
          condition: 'FAULT',
          issueSummary: 'Elevated temperature at outgoing breaker L3',
          severity: 'MAJOR',
          maxTemperatureC: '72.4',
          deltaTemperatureC: '31.8',
          observations: 'Hotspot at the outgoing connection',
          recommendation: 'Inspect and retorque before return to service',
          images: [],
        },
      ],
    });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(html).toContain('APEX &lt;FACILITIES&gt;');
    expect(html).not.toContain('Apex <Facilities>');
    expect(html).toContain('INSPECT AND RETORQUE BEFORE RETURN TO SERVICE');
    expect(html).toContain('data:image/png;base64,iVBOR');
    expect(html).toContain('PAGE 2 OF 2');
    expect(html).not.toContain('<script');
  });
  it('serves the thermal HTML preview with private and restrictive response headers', async () => {
    const response = await pdfWorker.fetch(
      new Request('https://pdf.test/render/thermal-report-html', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Thermal Imaging Report',
          organisationName: 'Ohm Audit Electrical Ltd',
          customerName: 'Apex Facilities Group',
          siteName: 'Apex House',
          inspectionType: 'Thermal imaging',
          effectiveDate: '2026-08-23',
          revisionNumber: 1,
          engineerName: 'A Engineer',
          outcome: 'SATISFACTORY',
          summaryLines: [],
          thermalCertificate: {
            organisationName: 'Ohm Audit Electrical Ltd',
            customerName: 'Apex Facilities Group',
            siteName: 'Apex House',
            siteAddress: ['1 Victoria Street'],
            reportDate: '2026-08-23',
            engineerName: 'A Engineer',
            reportReference: 'THERMAL-001',
            outcome: 'SATISFACTORY',
            targets: [],
          },
        }),
      }),
      {
        APP_ENV: 'local',
        APP_VERSION: 'test',
        RENDER_TIMEOUT_MS: '30000',
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await response.text()).toContain('THERMAL IMAGING REPORT');
  });
  it('uses Browser Run for an individual thermal PDF and streams its response', async () => {
    const browserPdf = new TextEncoder().encode('%PDF-1.7\nmanaged browser');
    let browserOptions: BrowserRunPDFOptions | undefined;
    const browser = {
      quickAction: (_action: 'pdf', options: BrowserRunPDFOptions) => {
        browserOptions = options;
        return Promise.resolve(
          new Response(browserPdf, {
            headers: { 'content-type': 'application/pdf', 'x-browser-ms-used': '1240' },
          }),
        );
      },
    } as unknown as BrowserRun;
    const response = await pdfWorker.fetch(
      new Request('https://pdf.test/render/thermal-imaging-report-v1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Thermal Imaging Report',
          organisationName: 'Ohm Audit Electrical Ltd',
          customerName: 'Apex Facilities Group',
          siteName: 'Apex House',
          inspectionType: 'Thermal imaging',
          effectiveDate: '2026-08-23',
          revisionNumber: 1,
          engineerName: 'A Engineer',
          outcome: 'SATISFACTORY',
          summaryLines: [],
          thermalCertificate: {
            organisationName: 'Ohm Audit Electrical Ltd',
            customerName: 'Apex Facilities Group',
            siteName: 'Apex House',
            siteAddress: ['1 Victoria Street'],
            reportDate: '2026-08-23',
            engineerName: 'A Engineer',
            reportReference: 'THERMAL-001',
            outcome: 'SATISFACTORY',
            targets: [],
          },
        }),
      }),
      {
        APP_ENV: 'local',
        APP_VERSION: 'test',
        RENDER_TIMEOUT_MS: '30000',
        BROWSER: browser,
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-ohmaudit-pdf-renderer')).toBe('browser-run');
    expect(response.headers.get('x-ohmaudit-browser-ms-used')).toBe('1240');
    expect(new TextDecoder().decode(await response.arrayBuffer())).toContain('managed browser');
    expect(browserOptions?.pdfOptions).toMatchObject({
      format: 'a4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    expect(
      browserOptions !== undefined && 'html' in browserOptions ? browserOptions.html : undefined,
    ).toContain('THERMAL IMAGING REPORT');
  });
  it('falls back to the native thermal renderer if Browser Run is unavailable', async () => {
    const response = await pdfWorker.fetch(
      new Request('https://pdf.test/render/thermal-imaging-report-v1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Thermal Imaging Report',
          organisationName: 'Ohm Audit Electrical Ltd',
          customerName: 'Apex Facilities Group',
          siteName: 'Apex House',
          inspectionType: 'Thermal imaging',
          effectiveDate: '2026-08-23',
          revisionNumber: 1,
          engineerName: 'A Engineer',
          outcome: 'SATISFACTORY',
          summaryLines: [],
          thermalCertificate: {
            organisationName: 'Ohm Audit Electrical Ltd',
            customerName: 'Apex Facilities Group',
            siteName: 'Apex House',
            siteAddress: [],
            reportDate: '2026-08-23',
            engineerName: 'A Engineer',
            reportReference: 'THERMAL-001',
            outcome: 'SATISFACTORY',
            targets: [],
          },
        }),
      }),
      {
        APP_ENV: 'local',
        APP_VERSION: 'test',
        RENDER_TIMEOUT_MS: '30000',
        BROWSER: {
          quickAction: () => Promise.resolve(new Response('limit reached', { status: 429 })),
        } as unknown as BrowserRun,
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-ohmaudit-pdf-renderer')).toBe('native-fallback');
    expect(new TextDecoder().decode(await response.arrayBuffer())).toContain('%PDF-1.4');
  });
  it('normalises existing PNG organisation logos for native EV certificates', async () => {
    const pngLogo = {
      mimeType: 'image/png',
      base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lm8uWQAAAABJRU5ErkJggg==',
    } as const;
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00,
      0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
    ]);
    let conversions = 0;
    const response = await pdfWorker.fetch(
      new Request('https://pdf.test/render/ev-certificate-v1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'EV Charging Inspection Certificate',
          organisationName: 'Ohm Audit Electrical Ltd',
          customerName: 'Apex Facilities Group',
          siteName: 'Apex House',
          inspectionType: 'Periodic inspection',
          effectiveDate: '2026-08-23',
          revisionNumber: 1,
          engineerName: 'A Engineer',
          outcome: 'PASS',
          summaryLines: [],
          evCertificate: {
            testingCompany: {
              name: 'Ohm Audit Electrical Ltd',
              addressLines: ['1 Test Street'],
              registrationNumber: 'REG-1',
              logoImage: pngLogo,
            },
            testingLocation: {
              name: 'Apex Facilities Group - Apex House',
              addressLines: ['1 Victoria Street'],
              logoImage: pngLogo,
            },
            charger: {
              name: 'Charger 1',
              location: 'Car park',
              make: 'Example',
              model: 'Model 1',
              serialNumber: 'SN-1',
              powerOutputKw: '22',
            },
            supplies: [],
            connectors: [],
            testDate: '2026-08-23',
            outcome: 'PASS',
            reasonForFailure: '',
            notes: '',
            engineerName: 'A Engineer',
            certificateReference: 'EV-1',
          },
        }),
      }),
      {
        APP_ENV: 'local',
        APP_VERSION: 'test',
        RENDER_TIMEOUT_MS: '30000',
        BROWSER: {
          quickAction: (action: string) => {
            expect(action).toBe('screenshot');
            conversions += 1;
            return Promise.resolve(
              new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }),
            );
          },
        } as unknown as BrowserRun,
      },
    );

    const pdf = new TextDecoder().decode(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get('x-ohmaudit-pdf-renderer')).toBe('native');
    expect(conversions).toBe(1);
    expect(pdf).toContain('/DCTDecode');
  });
});
