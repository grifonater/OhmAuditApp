import { renderThermalReportHtml } from './thermal-report-html';
import { renderRamsReportHtml, type RamsRenderPayload } from './rams-report-html';
import { renderJobSheetReportHtml, type JobSheetRenderPayload } from './job-sheet-report-html';

export { renderThermalReportHtml } from './thermal-report-html';
export { renderRamsReportHtml, type RamsRenderPayload } from './rams-report-html';
export { renderJobSheetReportHtml, type JobSheetRenderPayload } from './job-sheet-report-html';

export interface PdfBindings {
  APP_ENV: 'local' | 'development' | 'staging' | 'production';
  APP_VERSION: string;
  RENDER_TIMEOUT_MS: string;
  BROWSER?: BrowserRun;
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ramsFooterTemplate(payload: RamsRenderPayload): string {
  const reference = escapeHtml(payload.reference);
  const revision = escapeHtml(payload.revisionNumber ?? 'DRAFT');

  return `<div style="box-sizing:border-box;width:100%;height:14mm;padding:0 12mm 2mm;color:#53647b;font-family:Arial,Helvetica,sans-serif;font-size:6pt;line-height:1.2;overflow:hidden">
    <div style="box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr) minmax(0,1.2fr);column-gap:4mm;width:100%;height:100%;padding-top:2mm;border-top:1px solid #9ba9ba;overflow:hidden">
      <div style="min-width:0;max-height:100%;overflow:hidden;overflow-wrap:anywhere;word-break:break-word">CONTROLLED DOCUMENT &middot; VERIFY CURRENT REVISION BEFORE USE</div>
      <div style="min-width:0;overflow:hidden;text-align:center;white-space:nowrap;text-overflow:ellipsis">${reference} &middot; REV ${revision}</div>
      <div style="min-width:0;max-height:100%;overflow:hidden;overflow-wrap:anywhere;text-align:right;word-break:break-word">Powered by OhmAudit management platform<br>Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
    </div>
  </div>`;
}

export interface ReportImagePayload {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface CertificatePayload {
  title: string;
  organisationName: string;
  customerName: string;
  siteName: string;
  assetName?: string;
  inspectionType: string;
  effectiveDate: string;
  revisionNumber: number;
  engineerName: string;
  outcome: string;
  summaryLines: string[];
  logoJpegBase64?: string;
  logoImage?: ReportImagePayload;
  evCertificate?: EvCertificatePayload;
  thermalCertificate?: ThermalCertificatePayload;
}

export interface ThermalCertificatePayload {
  organisationName: string;
  customerName: string;
  siteName: string;
  siteAddress: string[];
  reportDate: string;
  engineerName: string;
  reportReference: string;
  outcome: string;
  details?: {
    scope: string;
    purpose: string;
    inspectionMethod: string;
    areasInspected: string;
    areasExcluded: string;
    limitations: string;
    environmentalConditions: string;
    loadCondition: string;
    ambientTemperatureC: string;
    emissivity: string;
    reflectedTemperatureC: string;
    clientRepresentative: string;
    additionalNotes: string;
    equipment: string;
  };
  logoJpegBase64?: string;
  logoImage?: ReportImagePayload;
  targets: Array<{
    name: string;
    reference: string;
    location: string;
    condition: string;
    issueSummary: string;
    severity: string;
    maxTemperatureC: string;
    deltaTemperatureC: string;
    observations: string;
    recommendation: string;
    images: Array<{ kind: string; jpegBase64: string; description?: string }>;
  }>;
  buildReference?: string;
}

export interface EvCertificatePayload {
  testingCompany: {
    name: string;
    addressLines: string[];
    registrationNumber: string;
    logoJpegBase64?: string;
    logoImage?: ReportImagePayload;
  };
  testingLocation: {
    name: string;
    addressLines: string[];
    logoJpegBase64?: string;
    logoImage?: ReportImagePayload;
  };
  charger: {
    name: string;
    location: string;
    make: string;
    model: string;
    serialNumber: string;
    powerOutputKw: string;
    photoJpegBase64?: string;
  };
  supplies: Array<{
    label: string;
    phaseCount: string;
    breaker: string;
    earthingArrangement: string;
    zsOhms: string;
    maximumPfcKa: string;
  }>;
  connectors: Array<{
    label: string;
    connectorType: string;
    supplyNumbers: string;
    pePreTest: string;
    cpError: string;
    peError: string;
    cpStates: string;
    rcd1x0Ms: string;
    rcd1x180Ms: string;
    rcd5x0Ms: string;
    rcd5x180Ms: string;
    dcRcdType: string;
    dcRamp0Ma: string;
    dcRamp180Ma: string;
  }>;
  testDate: string;
  outcome: string;
  reasonForFailure: string;
  notes: string;
  engineerName: string;
  certificateReference: string;
}

export interface VisitReportPayload {
  title: string;
  organisationName: string;
  customerName: string;
  siteName: string;
  visitDate: string;
  certificates: CertificatePayload[];
  logoJpegBase64?: string;
  logoImage?: ReportImagePayload;
}

function upperUserText(value: string): string {
  return value.toLocaleUpperCase('en-GB');
}

function uppercaseEvCertificate(payload: EvCertificatePayload): EvCertificatePayload {
  return {
    testingCompany: {
      name: upperUserText(payload.testingCompany.name),
      addressLines: payload.testingCompany.addressLines.map(upperUserText),
      registrationNumber: upperUserText(payload.testingCompany.registrationNumber),
      ...(payload.testingCompany.logoJpegBase64 === undefined
        ? {}
        : { logoJpegBase64: payload.testingCompany.logoJpegBase64 }),
      ...(payload.testingCompany.logoImage === undefined
        ? {}
        : { logoImage: payload.testingCompany.logoImage }),
    },
    testingLocation: {
      name: upperUserText(payload.testingLocation.name),
      addressLines: payload.testingLocation.addressLines.map(upperUserText),
      ...(payload.testingLocation.logoJpegBase64 === undefined
        ? {}
        : { logoJpegBase64: payload.testingLocation.logoJpegBase64 }),
      ...(payload.testingLocation.logoImage === undefined
        ? {}
        : { logoImage: payload.testingLocation.logoImage }),
    },
    charger: {
      name: upperUserText(payload.charger.name),
      location: upperUserText(payload.charger.location),
      make: upperUserText(payload.charger.make),
      model: upperUserText(payload.charger.model),
      serialNumber: upperUserText(payload.charger.serialNumber),
      powerOutputKw: upperUserText(payload.charger.powerOutputKw),
      ...(payload.charger.photoJpegBase64 === undefined
        ? {}
        : { photoJpegBase64: payload.charger.photoJpegBase64 }),
    },
    supplies: payload.supplies.map((supply) => ({
      label: upperUserText(supply.label),
      phaseCount: upperUserText(supply.phaseCount),
      breaker: upperUserText(supply.breaker),
      earthingArrangement: upperUserText(supply.earthingArrangement),
      zsOhms: upperUserText(supply.zsOhms),
      maximumPfcKa: upperUserText(supply.maximumPfcKa),
    })),
    connectors: payload.connectors.map((connector) => ({
      label: upperUserText(connector.label),
      connectorType: upperUserText(connector.connectorType),
      supplyNumbers: upperUserText(connector.supplyNumbers),
      pePreTest: upperUserText(connector.pePreTest),
      cpError: upperUserText(connector.cpError),
      peError: upperUserText(connector.peError),
      cpStates: upperUserText(connector.cpStates),
      rcd1x0Ms: upperUserText(connector.rcd1x0Ms),
      rcd1x180Ms: upperUserText(connector.rcd1x180Ms),
      rcd5x0Ms: upperUserText(connector.rcd5x0Ms),
      rcd5x180Ms: upperUserText(connector.rcd5x180Ms),
      dcRcdType: upperUserText(connector.dcRcdType),
      dcRamp0Ma: upperUserText(connector.dcRamp0Ma),
      dcRamp180Ma: upperUserText(connector.dcRamp180Ma),
    })),
    testDate: upperUserText(payload.testDate),
    outcome: upperUserText(payload.outcome),
    reasonForFailure: upperUserText(payload.reasonForFailure),
    notes: upperUserText(payload.notes),
    engineerName: upperUserText(payload.engineerName),
    certificateReference: upperUserText(payload.certificateReference),
  };
}

function uppercaseThermalCertificate(
  payload: ThermalCertificatePayload,
): ThermalCertificatePayload {
  return {
    organisationName: upperUserText(payload.organisationName),
    customerName: upperUserText(payload.customerName),
    siteName: upperUserText(payload.siteName),
    siteAddress: payload.siteAddress.map(upperUserText),
    reportDate: upperUserText(payload.reportDate),
    engineerName: upperUserText(payload.engineerName),
    reportReference: upperUserText(payload.reportReference),
    outcome: upperUserText(payload.outcome),
    ...(payload.details === undefined
      ? {}
      : {
          details: Object.fromEntries(
            Object.entries(payload.details).map(([key, value]) => [key, upperUserText(value)]),
          ) as NonNullable<ThermalCertificatePayload['details']>,
        }),
    ...(payload.logoJpegBase64 === undefined ? {} : { logoJpegBase64: payload.logoJpegBase64 }),
    ...(payload.logoImage === undefined ? {} : { logoImage: payload.logoImage }),
    targets: payload.targets.map((target) => ({
      name: upperUserText(target.name),
      reference: upperUserText(target.reference),
      location: upperUserText(target.location),
      condition: upperUserText(target.condition),
      issueSummary: upperUserText(target.issueSummary),
      severity: upperUserText(target.severity),
      maxTemperatureC: upperUserText(target.maxTemperatureC),
      deltaTemperatureC: upperUserText(target.deltaTemperatureC),
      observations: upperUserText(target.observations),
      recommendation: upperUserText(target.recommendation),
      images: target.images.map((image) => ({
        kind: upperUserText(image.kind),
        jpegBase64: image.jpegBase64,
        ...(image.description === undefined
          ? {}
          : { description: upperUserText(image.description).slice(0, 500) }),
      })),
    })),
  };
}

function uppercaseCertificate(payload: CertificatePayload): CertificatePayload {
  return {
    title: upperUserText(payload.title),
    organisationName: upperUserText(payload.organisationName),
    customerName: upperUserText(payload.customerName),
    siteName: upperUserText(payload.siteName),
    ...(payload.assetName === undefined ? {} : { assetName: upperUserText(payload.assetName) }),
    inspectionType: upperUserText(payload.inspectionType),
    effectiveDate: upperUserText(payload.effectiveDate),
    revisionNumber: payload.revisionNumber,
    engineerName: upperUserText(payload.engineerName),
    outcome: upperUserText(payload.outcome),
    summaryLines: payload.summaryLines.map(upperUserText),
    ...(payload.logoJpegBase64 === undefined ? {} : { logoJpegBase64: payload.logoJpegBase64 }),
    ...(payload.logoImage === undefined ? {} : { logoImage: payload.logoImage }),
    ...(payload.evCertificate === undefined
      ? {}
      : { evCertificate: uppercaseEvCertificate(payload.evCertificate) }),
    ...(payload.thermalCertificate === undefined
      ? {}
      : { thermalCertificate: uppercaseThermalCertificate(payload.thermalCertificate) }),
  };
}

function uppercaseVisitReport(payload: VisitReportPayload): VisitReportPayload {
  return {
    title: upperUserText(payload.title),
    organisationName: upperUserText(payload.organisationName),
    customerName: upperUserText(payload.customerName),
    siteName: upperUserText(payload.siteName),
    visitDate: upperUserText(payload.visitDate),
    certificates: payload.certificates.map(uppercaseCertificate),
    ...(payload.logoJpegBase64 === undefined ? {} : { logoJpegBase64: payload.logoJpegBase64 }),
    ...(payload.logoImage === undefined ? {} : { logoImage: payload.logoImage }),
  };
}

export function normaliseDocumentPath(url: URL): string | undefined {
  const match = /^\/render\/([a-z0-9-]{1,80})$/u.exec(url.pathname);
  return match?.[1];
}

function pdfEscape(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
    .replaceAll(/[^\x20-\x7e]/gu, '?');
}

function readingAbove(value: string, threshold: number): boolean {
  const reading = Number(value);
  return Number.isFinite(reading) && reading > threshold;
}

function certificateLines(payload: CertificatePayload): string[] {
  return [
    payload.title,
    `Issued by: ${payload.organisationName}`,
    `Customer: ${payload.customerName}`,
    `Site: ${payload.siteName}`,
    ...(payload.assetName === undefined ? [] : [`Asset: ${payload.assetName}`]),
    `Inspection: ${payload.inspectionType}`,
    `Effective date: ${payload.effectiveDate}`,
    `Revision: ${payload.revisionNumber}`,
    `Engineer: ${payload.engineerName}`,
    `Outcome: ${payload.outcome.replaceAll('_', ' ')}`,
    '',
    ...payload.summaryLines,
  ].slice(0, 38);
}

function jpegDetails(
  base64: string | undefined,
): { hex: string; width: number; height: number } | undefined {
  if (!base64) return undefined;
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] ?? 0) * 256 + (bytes[offset + 3] ?? 0);
    if (
      marker !== undefined &&
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      const height = (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0);
      const width = (bytes[offset + 7] ?? 0) * 256 + (bytes[offset + 8] ?? 0);
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('') + '>';
      return { hex, width, height };
    }
    if (length < 2) break;
    offset += length + 2;
  }
  return undefined;
}

interface PdfImage {
  name: string;
  base64: string | undefined;
}

function renderPageContents(contents: string[], requestedImages: PdfImage[] = []): Uint8Array {
  const fontObjectNumber = 3 + contents.length * 2;
  const images = requestedImages.flatMap(({ name, base64 }) => {
    const details = jpegDetails(base64);
    return details === undefined ? [] : [{ name, ...details }];
  });
  const pageObjectNumbers = contents.map((_, index) => 3 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${contents.length} >>`,
  ];
  const imageResources = images
    .map(({ name }, index) => `/${name} ${fontObjectNumber + index + 1} 0 R`)
    .join(' ');
  for (const [index, content] of contents.entries()) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >>${images.length === 0 ? '' : ` /XObject << ${imageResources} >>`} >> /Contents ${4 + index * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const image of images)
    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${image.hex.length} >>\nstream\n${image.hex}\nendstream`,
    );
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function renderPages(pages: string[][], logoJpegBase64?: string): Uint8Array {
  const contents = pages.map((lines) =>
    [
      ...(logoJpegBase64 === undefined ? [] : ['q 96 0 0 48 445 772 cm /Logo Do Q']),
      ...lines.map(
        (line, index) =>
          `BT /F1 ${index === 0 ? 18 : 10} Tf 54 ${780 - index * 18} Td (${pdfEscape(line)}) Tj ET`,
      ),
    ].join('\n'),
  );
  return renderPageContents(contents, [{ name: 'Logo', base64: logoJpegBase64 }]);
}

const accent = '0.078 0.373 0.788';
const muted = '0.322 0.384 0.478';
const lineColour = '0.839 0.871 0.914';
const OUTCOME_LINES_PER_PAGE = 38;

function textAt(value: string, x: number, y: number, size = 9, colour = '0.1 0.1 0.1'): string {
  return `BT /F1 ${size} Tf ${colour} rg ${x} ${y} Td (${pdfEscape(value)}) Tj ET`;
}

function fitted(value: string, characters: number): string {
  return value.length <= characters ? value : `${value.slice(0, Math.max(0, characters - 3))}...`;
}

function wrapped(value: string, characters: number): string[] {
  const words = value
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .flatMap((word) =>
      word.length <= characters
        ? [word]
        : Array.from({ length: Math.ceil(word.length / characters) }, (_, index) =>
            word.slice(index * characters, (index + 1) * characters),
          ),
    );
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (`${current} ${word}`.trim().length > characters && current) {
      lines.push(current);
      current = word;
    } else current = `${current} ${word}`.trim();
  }
  if (current) lines.push(current);
  return lines.length === 0 ? [''] : lines;
}

function wrappedParagraphs(value: string, characters: number): string[] {
  const paragraphs = value.replaceAll('\r\n', '\n').split('\n');
  return paragraphs.flatMap((paragraph, index) => [
    ...(paragraph.trim() ? wrapped(paragraph, characters) : ['']),
    ...(index < paragraphs.length - 1 ? [''] : []),
  ]);
}

function evCertificateContents(
  payload: EvCertificatePayload,
  imagePrefix: string,
): { contents: string[]; images: PdfImage[] } {
  const pages: string[][] = [[]];
  let page = pages[0]!;
  let y = 790;
  const companyLogoName = `${imagePrefix}Company`;
  const locationLogoName = `${imagePrefix}Location`;
  const chargerPhotoName = `${imagePrefix}Charger`;
  const images: PdfImage[] = [
    { name: companyLogoName, base64: payload.testingCompany.logoJpegBase64 },
    { name: locationLogoName, base64: payload.testingLocation.logoJpegBase64 },
    { name: chargerPhotoName, base64: payload.charger.photoJpegBase64 },
  ];
  const availableImageNames = new Set(
    images.flatMap(({ name, base64 }) => (jpegDetails(base64) === undefined ? [] : [name])),
  );
  const add = (...commands: string[]) => page.push(...commands);
  const newPage = () => {
    page = [];
    pages.push(page);
    y = 790;
    add(
      textAt('EV Charge Point Test Certificate - continued', 42, 805, 11, accent),
      `${accent} RG 42 798 m 553 798 l S`,
    );
  };
  const ensure = (height: number) => {
    if (y - height < 55) newPage();
  };
  const section = (title: string, requiredHeight: number) => {
    ensure(requiredHeight + 28);
    add(
      `${accent} rg 42 ${y - 17} 511 17 re f`,
      textAt(title.toUpperCase(), 49, y - 12, 9, '1 1 1'),
    );
    y -= 25;
  };
  const field = (label: string, value: string, x: number, width: number, top: number) => {
    add(
      textAt(label.toUpperCase(), x, top, 6.5, muted),
      textAt(fitted(value || 'Not recorded', Math.max(10, Math.floor(width / 5))), x, top - 13, 9),
      `${lineColour} RG ${x} ${top - 16} m ${x + width} ${top - 16} l S`,
    );
  };

  if (availableImageNames.has(companyLogoName))
    add(`q 54 0 0 54 42 744 cm /${companyLogoName} Do Q`);
  else add(`${lineColour} RG 42 744 54 54 re S`, textAt('LOGO', 59, 770, 7, muted));
  if (availableImageNames.has(locationLogoName))
    add(`q 54 0 0 54 499 744 cm /${locationLogoName} Do Q`);
  else add(`${lineColour} RG 499 744 54 54 re S`, textAt('LOGO', 516, 770, 7, muted));
  add(
    textAt('TESTING COMPANY', 105, 791, 6.5, muted),
    textAt(fitted(payload.testingCompany.name, 34), 105, 777, 11, accent),
    ...payload.testingCompany.addressLines
      .slice(0, 2)
      .map((value, index) => textAt(fitted(value, 42), 105, 764 - index * 11, 7.5, muted)),
    textAt(
      `Registration No: ${payload.testingCompany.registrationNumber || 'Not recorded'}`,
      105,
      741,
      7.5,
      muted,
    ),
    textAt('TESTING LOCATION', 322, 791, 6.5, muted),
    textAt(fitted(payload.testingLocation.name, 30), 322, 777, 11, accent),
    ...payload.testingLocation.addressLines
      .slice(0, 2)
      .map((value, index) => textAt(fitted(value, 42), 322, 764 - index * 11, 7.5, muted)),
    `${accent} RG 42 730 m 553 730 l S`,
    textAt('EV Charge Point Test Certificate', 150, 704, 18, accent),
    textAt('Electrical verification and RCD/DC RCD performance record', 174, 687, 8, muted),
  );
  y = 666;

  section('Charger Details', 112);
  if (availableImageNames.has(chargerPhotoName))
    add(`q 125 0 0 88 42 ${y - 92} cm /${chargerPhotoName} Do Q`);
  else
    add(`${lineColour} RG 42 ${y - 92} 125 88 re S`, textAt('CHARGER PHOTO', 70, y - 49, 7, muted));
  const factX = 181;
  const factWidth = 174;
  field('Charger Name / ID', payload.charger.name, factX, factWidth, y - 3);
  field('Location on Site', payload.charger.location, 369, 184, y - 3);
  field('Make', payload.charger.make, factX, factWidth, y - 37);
  field('Model', payload.charger.model, 369, 184, y - 37);
  field('Serial Number', payload.charger.serialNumber, factX, factWidth, y - 71);
  field('Power Output', payload.charger.powerOutputKw, 369, 88, y - 71);
  field('Date of Testing', payload.testDate, 465, 88, y - 71);
  y -= 104;

  const supplyHeight = 35 + Math.max(1, payload.supplies.length) * 21;
  section('Supplies', supplyHeight);
  const supplyColumns = [42, 70, 190, 238, 311, 377, 445, 553];
  const supplyHeaders = [
    'No.',
    'Supply name',
    'Phase',
    'Breaker',
    'Earthing',
    'Zs (ohm)',
    'PFC (kA)',
  ];
  add(`0.96 0.96 0.96 rg 42 ${y - 20} 511 20 re f`);
  supplyHeaders.forEach((header, index) =>
    add(textAt(header, supplyColumns[index]! + 3, y - 14, 6.5, muted)),
  );
  for (const [index, supply] of (payload.supplies.length
    ? payload.supplies
    : [
        {
          label: 'No supplies recorded',
          phaseCount: '',
          breaker: '',
          earthingArrangement: '',
          zsOhms: '',
          maximumPfcKa: '',
        },
      ]
  ).entries()) {
    const rowTop = y - 20 - index * 21;
    const values = [
      String(index + 1),
      supply.label,
      supply.phaseCount,
      supply.breaker,
      supply.earthingArrangement,
      supply.zsOhms,
      supply.maximumPfcKa,
    ];
    add(`${lineColour} RG 42 ${rowTop - 21} 511 21 re S`);
    values.forEach((value, column) =>
      add(
        textAt(
          fitted(
            value || '-',
            Math.max(
              4,
              Math.floor((supplyColumns[column + 1]! - supplyColumns[column]! - 6) / 4.8),
            ),
          ),
          supplyColumns[column]! + 3,
          rowTop - 14,
          7.2,
        ),
      ),
    );
  }
  y -= supplyHeight;

  section('Connectors', 130);
  for (const [index, connector] of payload.connectors.entries()) {
    ensure(137);
    const top = y;
    add(
      `${lineColour} RG 42 ${top - 126} 511 126 re S`,
      `0.933 0.965 0.945 rg 42 ${top - 20} 511 20 re f`,
      textAt(
        `${connector.label || `Connector ${index + 1}`} (${connector.connectorType || 'Type not recorded'})`,
        49,
        top - 14,
        9,
        accent,
      ),
      textAt(`Fed from supply no.: ${connector.supplyNumbers || '-'}`, 392, top - 14, 7.5, accent),
      textAt('RCD TRIP TIMES (ms)', 49, top - 34, 6.5, muted),
    );
    const rcdLabels = ['1x at 0 deg', '1x at 180 deg', '5x at 0 deg', '5x at 180 deg'];
    const rcdValues = [
      connector.rcd1x0Ms,
      connector.rcd1x180Ms,
      connector.rcd5x0Ms,
      connector.rcd5x180Ms,
    ];
    rcdLabels.forEach((label, column) => {
      const x = 49 + column * 124;
      const value = rcdValues[column] || '-';
      const failed = column < 2 ? readingAbove(value, 300) : readingAbove(value, 40);
      add(
        ...(failed
          ? [
              `0.98 0.88 0.88 rg ${x - 3} ${top - 68} 116 22 re f`,
              `0.77 0.13 0.12 RG ${x - 3} ${top - 68} 116 22 re S`,
            ]
          : []),
        textAt(label, x, top - 49, 6.5, failed ? '0.77 0.13 0.12' : muted),
        textAt(
          failed ? `${value} - FAIL` : value,
          x,
          top - 63,
          9,
          failed ? '0.77 0.13 0.12' : '0.1 0.1 0.1',
        ),
      );
    });
    const rdcDd = connector.dcRcdType.toUpperCase() === 'RDC-DD';
    const ramp0Failed = rdcDd && readingAbove(connector.dcRamp0Ma, 6);
    const ramp180Failed = rdcDd && readingAbove(connector.dcRamp180Ma, 6);
    add(
      `${lineColour} RG 49 ${top - 69} m 546 ${top - 69} l S`,
      textAt('FUNCTIONAL CHECKS', 49, top - 82, 6.5, muted),
      textAt(`PE pre-test: ${connector.pePreTest}`, 49, top - 97, 7.5),
      textAt(`CP error: ${connector.cpError}`, 169, top - 97, 7.5),
      textAt(`PE error: ${connector.peError}`, 279, top - 97, 7.5),
      textAt(`CP states: ${connector.cpStates}`, 389, top - 97, 7.5),
      textAt(`DC protection: ${connector.dcRcdType}`, 49, top - 116, 7.5),
      ...(ramp0Failed
        ? [
            `0.98 0.88 0.88 rg 245 ${top - 122} 135 16 re f`,
            `0.77 0.13 0.12 RG 245 ${top - 122} 135 16 re S`,
          ]
        : []),
      textAt(
        `Ramp 0 deg: ${connector.dcRamp0Ma || '-'} mA${ramp0Failed ? ' - FAIL' : ''}`,
        249,
        top - 116,
        7.5,
        ramp0Failed ? '0.77 0.13 0.12' : '0.1 0.1 0.1',
      ),
      ...(ramp180Failed
        ? [
            `0.98 0.88 0.88 rg 385 ${top - 122} 161 16 re f`,
            `0.77 0.13 0.12 RG 385 ${top - 122} 161 16 re S`,
          ]
        : []),
      textAt(
        `Ramp 180 deg: ${connector.dcRamp180Ma || '-'} mA${ramp180Failed ? ' - FAIL' : ''}`,
        389,
        top - 116,
        7.5,
        ramp180Failed ? '0.77 0.13 0.12' : '0.1 0.1 0.1',
      ),
    );
    y -= 137;
  }
  if (payload.connectors.length === 0) {
    add(textAt('No connector results were recorded.', 49, y - 18, 8, muted));
    y -= 36;
  }

  section('Overall Test Result', 78);
  const passed = payload.outcome.toUpperCase() === 'PASS';
  add(
    `${passed ? '0.9 0.96 0.92' : '0.98 0.92 0.92'} rg 42 ${y - 48} 92 48 re f`,
    `${passed ? '0.12 0.56 0.24' : '0.77 0.13 0.12'} RG 42 ${y - 48} 92 48 re S`,
    textAt(passed ? 'PASS' : 'FAIL', 68, y - 30, 15, passed ? '0.12 0.56 0.24' : '0.77 0.13 0.12'),
    textAt('REASON FOR FAILURE (IF APPLICABLE)', 149, y - 10, 6.5, '0.77 0.13 0.12'),
    ...wrapped(payload.reasonForFailure || 'Not applicable', 72)
      .slice(0, 3)
      .map((value, index) => textAt(value, 149, y - 25 - index * 11, 7.5)),
  );
  y -= 64;

  section('Notes', 72);
  add(
    `${lineColour} RG 42 ${y - 54} 511 54 re S`,
    ...wrapped(payload.notes || 'No additional comments recorded.', 105)
      .slice(0, 4)
      .map((value, index) => textAt(value, 49, y - 15 - index * 11, 7.5)),
  );
  y -= 70;

  section('Engineer Sign-Off', 84);
  field('Engineer Name', payload.engineerName, 42, 220, y - 3);
  field('Signature', 'Typed electronic signature', 275, 170, y - 3);
  field('Date of Testing', payload.testDate, 458, 95, y - 3);
  add(
    ...wrapped(
      "I certify that the electric vehicle charging equipment described above has been inspected and tested in accordance with the relevant requirements of BS 7671 and the equipment manufacturer's guidance, and that the results recorded are accurate at the time of testing.",
      115,
    )
      .slice(0, 3)
      .map((value, index) => textAt(value, 42, y - 42 - index * 10, 6.5, muted)),
  );
  pages.forEach((commands, index) =>
    commands.push(
      textAt(`Certificate Ref: ${payload.certificateReference}`, 42, 25, 6.5, muted),
      textAt(`Page ${index + 1} of ${pages.length}`, 507, 25, 6.5, muted),
    ),
  );
  return { contents: pages.map((commands) => commands.join('\n')), images };
}

export function renderEvCertificatePdf(payload: EvCertificatePayload): Uint8Array {
  const built = evCertificateContents(uppercaseEvCertificate(payload), 'Ev');
  return renderPageContents(built.contents, built.images);
}

function thermalImagePageGroups<T>(
  images: readonly T[],
): Array<{ offset: number; images: readonly T[] }> {
  if (images.length === 0) return [{ offset: 0, images: images }];
  const groups: Array<{ offset: number; images: readonly T[] }> = [];
  groups.push({ offset: 0, images: images.slice(0, 2) });
  let offset = 2;
  while (offset < images.length) {
    groups.push({ offset, images: images.slice(offset, offset + 4) });
    offset += 4;
  }
  return groups;
}

function thermalCertificateContents(
  payload: ThermalCertificatePayload,
  imagePrefix: string,
): { contents: string[]; images: PdfImage[] } {
  const faultCount = payload.targets.filter(({ condition }) => condition === 'FAULT').length;
  const targetPageCounts = payload.targets.map((target) =>
    Math.max(1, thermalImagePageGroups(target.images).length),
  );
  const outcomeText = payload.outcome.replaceAll('_', ' ').trim() || 'NOT RECORDED';
  const outcomeLines = wrappedParagraphs(outcomeText, 92);
  const outcomeOverflowLines = outcomeLines.length > 14 ? outcomeLines.slice(14) : [];
  const outcomeOverflowPages =
    outcomeOverflowLines.length === 0
      ? 0
      : Math.ceil(outcomeOverflowLines.length / OUTCOME_LINES_PER_PAGE);
  const targetTotal = targetPageCounts.reduce((total, count) => total + count, 0);
  const totalPages = 3 + outcomeOverflowPages + targetTotal;
  const detailsPageNumber = 2 + outcomeOverflowPages;
  const surveyPageNumber = 3 + outcomeOverflowPages;
  const logoName = `${imagePrefix}Logo`;
  const images: PdfImage[] = [{ name: logoName, base64: payload.logoJpegBase64 }];
  const cover = [
    ...(jpegDetails(payload.logoJpegBase64) === undefined
      ? []
      : [`q 110 0 0 55 430 748 cm /${logoName} Do Q`]),
    textAt('THERMAL IMAGING REPORT', 42, 770, 22, accent),
    textAt(payload.organisationName, 42, 741, 11),
    '0.85 0.85 0.85 RG 42 722 m 553 722 l S',
    textAt('CUSTOMER', 42, 690, 7, muted),
    textAt(payload.customerName, 42, 675, 12),
    textAt('SITE', 42, 643, 7, muted),
    textAt(payload.siteName, 42, 628, 12),
    ...payload.siteAddress.slice(0, 3).map((line, index) => textAt(line, 42, 612 - index * 14, 8)),
    textAt('REPORT DATE', 315, 690, 7, muted),
    textAt(payload.reportDate, 315, 675, 11),
    textAt('ENGINEER', 315, 643, 7, muted),
    textAt(payload.engineerName, 315, 628, 11),
    textAt('REPORT REFERENCE', 315, 596, 7, muted),
    textAt(payload.reportReference, 315, 581, 8),
    '0.94 0.96 0.98 rg 42 485 511 72 re f',
    textAt(String(payload.targets.length), 82, 525, 20, accent),
    textAt('TARGET ITEMS', 65, 503, 7, muted),
    textAt(String(payload.targets.length - faultCount), 255, 525, 20, accent),
    textAt('NO ISSUES', 236, 503, 7, muted),
    textAt(String(faultCount), 435, 525, 20, faultCount > 0 ? '0.78 0.12 0.09' : accent),
    textAt('FAULTS', 421, 503, 7, muted),
    textAt('OVERALL OUTCOME', 42, 452, 7, muted),
    ...outcomeLines
      .slice(0, 14)
      .map((line, index) =>
        textAt(line, 42, 430 - index * 14, 9, faultCount > 0 ? '0.78 0.12 0.09' : accent),
      ),
    ...(outcomeOverflowLines.length > 0
      ? [
          textAt(
            'CONTINUED ON THE FOLLOWING PAGE',
            42,
            430 - outcomeLines.slice(0, 14).length * 14,
            8,
            muted,
          ),
        ]
      : []),
    textAt('REPORT CONTENTS', 42, 205, 7, muted),
    ...wrapped(
      'THE FOLLOWING PAGES RECORD THE INSPECTION SCOPE, SURVEY CONDITIONS, EQUIPMENT, TARGET EVIDENCE, OBSERVATIONS AND RECOMMENDED ACTIONS.',
      92,
    ).map((line, index) => textAt(line, 42, 188 - index * 13, 8)),
    textAt(`PAGE 1 OF ${totalPages}`, 475, 25, 7, muted),
  ].join('\n');
  const detailLines = (
    title: string,
    value: string | undefined,
    x: number,
    y: number,
    width: number,
    maxLines: number,
  ): string[] => [
    textAt(title, x, y, 7, muted),
    ...wrappedParagraphs(value || 'NOT RECORDED', width)
      .slice(0, maxLines)
      .map((line, index) => textAt(line, x, y - 17 - index * 12, 8)),
  ];
  const inspectionDetailsPage = [
    textAt('THERMAL IMAGING REPORT', 42, 805, 11, accent),
    textAt('INSPECTION DETAILS', 455, 805, 7, muted),
    textAt('INSPECTION SCOPE', 42, 772, 18),
    `${accent} RG 42 758 m 553 758 l S`,
    ...detailLines('SCOPE OF INSPECTION', payload.details?.scope, 42, 730, 44, 12),
    ...detailLines('PURPOSE', payload.details?.purpose, 315, 730, 42, 12),
    ...detailLines('INSPECTION METHOD', payload.details?.inspectionMethod, 42, 530, 44, 10),
    ...detailLines('AREAS INSPECTED', payload.details?.areasInspected, 315, 530, 42, 10),
    ...detailLines('AREAS EXCLUDED', payload.details?.areasExcluded, 42, 360, 44, 10),
    ...detailLines('LIMITATIONS', payload.details?.limitations, 315, 360, 42, 10),
    textAt(`ENGINEER: ${payload.engineerName}`, 42, 45, 7, muted),
    textAt(`REPORT REF: ${payload.reportReference}`, 210, 45, 7, muted),
    textAt(`PAGE ${detailsPageNumber} OF ${totalPages}`, 475, 25, 7, muted),
  ].join('\n');
  const surveyConditionsPage = [
    textAt('THERMAL IMAGING REPORT', 42, 805, 11, accent),
    textAt('SURVEY CONDITIONS', 455, 805, 7, muted),
    textAt('SURVEY CONDITIONS AND EQUIPMENT', 42, 772, 18),
    `${accent} RG 42 758 m 553 758 l S`,
    ...detailLines(
      'ENVIRONMENTAL CONDITIONS',
      payload.details?.environmentalConditions,
      42,
      730,
      44,
      8,
    ),
    ...detailLines('LOAD / OPERATING CONDITION', payload.details?.loadCondition, 315, 730, 42, 8),
    textAt('AMBIENT TEMPERATURE', 42, 600, 7, muted),
    textAt(
      payload.details?.ambientTemperatureC
        ? `${payload.details.ambientTemperatureC} C`
        : 'NOT RECORDED',
      42,
      583,
      8,
    ),
    textAt('REFLECTED TEMPERATURE', 200, 600, 7, muted),
    textAt(
      payload.details?.reflectedTemperatureC
        ? `${payload.details.reflectedTemperatureC} C`
        : 'NOT RECORDED',
      200,
      583,
      8,
    ),
    textAt('EMISSIVITY', 395, 600, 7, muted),
    textAt(payload.details?.emissivity || 'NOT RECORDED', 395, 583, 8),
    ...detailLines('INSPECTION EQUIPMENT', payload.details?.equipment, 42, 535, 92, 8),
    ...detailLines('CLIENT REPRESENTATIVE', payload.details?.clientRepresentative, 42, 405, 92, 5),
    ...detailLines('ADDITIONAL NOTES', payload.details?.additionalNotes, 42, 315, 92, 10),
    textAt('REPORT INTERPRETATION', 42, 155, 8, accent),
    ...wrapped(
      'THIS REPORT RECORDS CONDITIONS OBSERVED AT THE TIME OF THE SURVEY. THERMAL PATTERNS CAN CHANGE WITH LOAD, AMBIENT CONDITIONS AND EQUIPMENT OPERATION. RECOMMENDATIONS SHOULD BE REVIEWED BY A COMPETENT PERSON BEFORE REMEDIAL WORK.',
      92,
    ).map((line, index) => textAt(line, 42, 136 - index * 12, 7, muted)),
    textAt(`ENGINEER: ${payload.engineerName}`, 42, 45, 7, muted),
    textAt(`REPORT REF: ${payload.reportReference}`, 210, 45, 7, muted),
    textAt(`PAGE ${surveyPageNumber} OF ${totalPages}`, 475, 25, 7, muted),
    ...(payload.buildReference
      ? [textAt(`BUILD ${payload.buildReference}`, 475, 45, 6, muted)]
      : []),
  ].join('\n');
  const outcomeOverflowPagesArray: string[] = [];
  for (let pageIndex = 0; pageIndex < outcomeOverflowPages; pageIndex += 1) {
    const start = pageIndex * OUTCOME_LINES_PER_PAGE;
    const slice = outcomeOverflowLines.slice(start, start + OUTCOME_LINES_PER_PAGE);
    const pageNumber = 2 + pageIndex;
    outcomeOverflowPagesArray.push(
      [
        textAt('THERMAL IMAGING REPORT', 42, 805, 11, accent),
        textAt(
          pageIndex === 0 ? 'OVERALL OUTCOME' : 'OVERALL OUTCOME (CONTINUED)',
          455,
          805,
          7,
          muted,
        ),
        textAt('OVERALL OUTCOME (CONTINUED)', 42, 772, 18),
        `${accent} RG 42 758 m 553 758 l S`,
        ...slice.map((line, index) =>
          textAt(line, 42, 730 - index * 14, 9, faultCount > 0 ? '0.78 0.12 0.09' : accent),
        ),
        textAt(`ENGINEER: ${payload.engineerName}`, 42, 45, 7, muted),
        textAt(`REPORT REF: ${payload.reportReference}`, 210, 45, 7, muted),
        textAt(`PAGE ${pageNumber} OF ${totalPages}`, 475, 25, 7, muted),
        ...(payload.buildReference
          ? [textAt(`BUILD ${payload.buildReference}`, 475, 45, 6, muted)]
          : []),
      ].join('\n'),
    );
  }
  const contents = [
    cover,
    ...outcomeOverflowPagesArray,
    inspectionDetailsPage,
    surveyConditionsPage,
  ];
  let pageNumber = 4 + outcomeOverflowPages;
  for (const [targetIndex, target] of payload.targets.entries()) {
    for (const [
      groupIndex,
      { offset: imageOffset, images: displayedImages },
    ] of thermalImagePageGroups(target.images).entries()) {
      const continuation = groupIndex > 0;
      const commands: string[] = [
        textAt('THERMAL IMAGING REPORT', 42, 805, 11, accent),
        textAt(
          `TARGET ${targetIndex + 1} OF ${payload.targets.length}${continuation ? ' - EVIDENCE CONTINUATION' : ''}`,
          continuation ? 350 : 475,
          805,
          7,
          muted,
        ),
        textAt(target.name, 42, 773, 18),
        textAt(
          [target.reference, target.location].filter(Boolean).join('  |  '),
          42,
          752,
          8,
          muted,
        ),
      ];
      displayedImages.forEach((image, groupImageIndex) => {
        const imageIndex = imageOffset + groupImageIndex;
        const name = `${imagePrefix}Target${targetIndex}Image${imageIndex}`;
        images.push({ name, base64: image.jpegBase64 });
        const column = groupImageIndex % 2;
        const secondRow = continuation && groupImageIndex >= 2;
        const x = column === 0 ? 42 : 303;
        const imageHeight = continuation ? 108 : 80;
        const imageY = secondRow ? 470 : 615;
        if (jpegDetails(image.jpegBase64) !== undefined)
          commands.push(`q 250 0 0 ${imageHeight} ${x} ${imageY} cm /${name} Do Q`);
        else commands.push(`${lineColour} RG ${x} ${imageY} 250 ${imageHeight} re S`);
        commands.push(
          textAt(image.kind, x, imageY - 14, 7, accent),
          textAt(
            `IMAGE ${imageIndex + 1} OF ${target.images.length}`,
            x + 165,
            imageY - 14,
            7,
            muted,
          ),
        );
        if (image.description) {
          const lines = wrapped(image.description, 60);
          lines.forEach((line, lineIndex) =>
            commands.push(textAt(line, x, imageY - 32 - lineIndex * 10, 6.5)),
          );
        }
      });
      if (displayedImages.length === 0)
        commands.push(
          '0.95 0.96 0.97 rg 42 535 511 190 re f',
          textAt('NO JPEG IMAGES AVAILABLE IN THIS REPORT', 170, 625, 9, muted),
        );

      if (continuation) {
        commands.push(
          textAt(
            `EVIDENCE CONTINUATION - IMAGES ${imageOffset + 1}-${imageOffset + displayedImages.length} OF ${target.images.length}`,
            42,
            410,
            8,
            accent,
          ),
        );
      } else {
        const isFault = target.condition === 'FAULT';
        commands.push(
          textAt('CONDITION', 42, 420, 7, muted),
          textAt(
            isFault ? 'FAULT REPORTED' : 'NO ISSUES',
            42,
            400,
            13,
            isFault ? '0.78 0.12 0.09' : accent,
          ),
        );
        if (isFault) {
          commands.push(
            textAt('SEVERITY', 315, 420, 7, muted),
            textAt(target.severity || 'NOT RECORDED', 315, 400, 11),
            textAt('MAX TEMPERATURE', 42, 370, 7, muted),
            textAt(
              target.maxTemperatureC ? `${target.maxTemperatureC} C` : 'NOT RECORDED',
              42,
              353,
              10,
            ),
            textAt('TEMPERATURE DIFFERENCE', 200, 370, 7, muted),
            textAt(
              target.deltaTemperatureC ? `${target.deltaTemperatureC} C` : 'NOT RECORDED',
              200,
              353,
              10,
            ),
            textAt('ISSUE SUMMARY', 42, 320, 7, muted),
          );
          wrapped(target.issueSummary || 'NOT RECORDED', 92)
            .slice(0, 3)
            .forEach((line, index) => commands.push(textAt(line, 42, 303 - index * 12, 8)));
          commands.push(textAt('OBSERVATIONS', 42, 255, 7, muted));
          wrapped(target.observations || 'NONE RECORDED', 92)
            .slice(0, 4)
            .forEach((line, index) => commands.push(textAt(line, 42, 238 - index * 12, 8)));
          commands.push(textAt('RECOMMENDATION', 42, 175, 7, muted));
          wrapped(target.recommendation || 'NONE RECORDED', 92)
            .slice(0, 5)
            .forEach((line, index) => commands.push(textAt(line, 42, 158 - index * 12, 8)));
        } else {
          commands.push(
            textAt('ENGINEER ASSESSMENT', 42, 350, 7, muted),
            ...wrapped(
              'NO THERMAL ANOMALIES OR REPORTABLE ISSUES WERE RECORDED FOR THIS TARGET ITEM.',
              92,
            ).map((line, index) => textAt(line, 42, 330 - index * 13, 9)),
            textAt('ENGINEER OBSERVATIONS', 42, 285, 7, muted),
            ...wrapped(target.observations || 'NO ADDITIONAL OBSERVATIONS RECORDED', 92)
              .slice(0, 5)
              .map((line, index) => textAt(line, 42, 268 - index * 12, 8)),
          );
        }
      }
      commands.push(
        textAt(`ENGINEER: ${payload.engineerName}`, 42, 45, 7, muted),
        textAt(`REPORT REF: ${payload.reportReference}`, 210, 45, 7, muted),
        textAt(`PAGE ${pageNumber++} OF ${totalPages}`, 475, 25, 7, muted),
        ...(payload.buildReference
          ? [textAt(`BUILD ${payload.buildReference}`, 475, 45, 6, muted)]
          : []),
      );
      contents.push(commands.join('\n'));
    }
  }
  return { contents, images };
}

export function renderThermalCertificatePdf(payload: ThermalCertificatePayload): Uint8Array {
  const built = thermalCertificateContents(uppercaseThermalCertificate(payload), 'Thermal');
  return renderPageContents(built.contents, built.images);
}

export function renderCertificatePdf(payload: CertificatePayload): Uint8Array {
  if (payload.evCertificate !== undefined) return renderEvCertificatePdf(payload.evCertificate);
  if (payload.thermalCertificate !== undefined)
    return renderThermalCertificatePdf(payload.thermalCertificate);
  const uppercasePayload = uppercaseCertificate(payload);
  return renderPages([certificateLines(uppercasePayload)], uppercasePayload.logoJpegBase64);
}

export function renderVisitReportPdf(payload: VisitReportPayload): Uint8Array {
  payload = uppercaseVisitReport(payload);
  const cover = [
    payload.title,
    `Issued by: ${payload.organisationName}`,
    `Customer: ${payload.customerName}`,
    `Site: ${payload.siteName}`,
    `Job date: ${payload.visitDate}`,
    `Certificates included: ${payload.certificates.length}`,
    '',
    ...payload.certificates.map(
      (certificate, index) =>
        `${index + 1}. ${certificate.assetName ?? certificate.inspectionType} - ${certificate.outcome}`,
    ),
  ].slice(0, 38);
  const coverContent = cover
    .map(
      (line, index) =>
        `BT /F1 ${index === 0 ? 18 : 10} Tf 54 ${780 - index * 18} Td (${pdfEscape(line)}) Tj ET`,
    )
    .join('\n');
  const contents = [coverContent];
  const images: PdfImage[] = [{ name: 'Logo', base64: payload.logoJpegBase64 }];
  for (const [index, certificate] of payload.certificates.entries()) {
    if (certificate.thermalCertificate !== undefined) {
      const thermal = uppercaseThermalCertificate(certificate.thermalCertificate);
      const rendered = thermalCertificateContents(thermal, `VisitThermal${index}`);
      contents.push(...rendered.contents);
      images.push(...rendered.images);
      continue;
    }
    if (certificate.evCertificate === undefined) {
      contents.push(
        certificateLines(certificate)
          .map(
            (line, lineIndex) =>
              `BT /F1 ${lineIndex === 0 ? 18 : 10} Tf 54 ${780 - lineIndex * 18} Td (${pdfEscape(line)}) Tj ET`,
          )
          .join('\n'),
      );
      continue;
    }
    const built = evCertificateContents(certificate.evCertificate, `Ev${index}`);
    contents.push(...built.contents);
    images.push(...built.images);
  }
  return renderPageContents(contents, images);
}

function isPayload(value: unknown): value is CertificatePayload {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item['title'] === 'string' &&
    typeof item['organisationName'] === 'string' &&
    Array.isArray(item['summaryLines']) &&
    (item['evCertificate'] === undefined || isEvCertificatePayload(item['evCertificate'])) &&
    (item['thermalCertificate'] === undefined ||
      isThermalCertificatePayload(item['thermalCertificate']))
  );
}

function isThermalCertificatePayload(value: unknown): value is ThermalCertificatePayload {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  const targets = item['targets'];
  if (
    typeof item['organisationName'] !== 'string' ||
    typeof item['customerName'] !== 'string' ||
    typeof item['siteName'] !== 'string' ||
    typeof item['reportReference'] !== 'string' ||
    typeof item['outcome'] !== 'string' ||
    !isStringArray(item['siteAddress']) ||
    !Array.isArray(targets)
  )
    return false;
  const valid = targets.every((target) => {
    if (!isRecord(target)) return false;
    if (
      typeof target['name'] !== 'string' ||
      typeof target['reference'] !== 'string' ||
      typeof target['location'] !== 'string' ||
      typeof target['condition'] !== 'string' ||
      typeof target['issueSummary'] !== 'string' ||
      typeof target['severity'] !== 'string' ||
      typeof target['maxTemperatureC'] !== 'string' ||
      typeof target['deltaTemperatureC'] !== 'string' ||
      typeof target['observations'] !== 'string' ||
      typeof target['recommendation'] !== 'string' ||
      !Array.isArray(target['images'])
    )
      return false;
    return target['images'].every(
      (image) =>
        isRecord(image) &&
        isString(image['kind']) &&
        isString(image['jpegBase64']) &&
        image['jpegBase64'].length > 0 &&
        (image['description'] === undefined ||
          (isString(image['description']) && image['description'].length <= 500)),
    );
  });
  return valid;
}

function isEvCertificatePayload(value: unknown): value is EvCertificatePayload {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item['testingCompany'] === 'object' &&
    item['testingCompany'] !== null &&
    typeof item['testingLocation'] === 'object' &&
    item['testingLocation'] !== null &&
    typeof item['charger'] === 'object' &&
    item['charger'] !== null &&
    Array.isArray(item['supplies']) &&
    Array.isArray(item['connectors']) &&
    typeof item['certificateReference'] === 'string'
  );
}

function isVisitReportPayload(value: unknown): value is VisitReportPayload {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item['title'] === 'string' &&
    typeof item['organisationName'] === 'string' &&
    Array.isArray(item['certificates']) &&
    item['certificates'].length > 0 &&
    item['certificates'].every(isPayload)
  );
}

const RAMS_MAX_REQUEST_BYTES = 1024 * 1024;
const RAMS_MAX_SIGNATURE_BYTES = 256 * 1024;
const DOCUMENT_MAX_REQUEST_BYTES = 40 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isString(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || isStringArray(value);
}

function isRamsPerson(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isOptionalString(value['id']) &&
    isOptionalString(value['name']) &&
    isOptionalNullableString(value['displayName']) &&
    isOptionalString(value['email']) &&
    isOptionalString(value['role']) &&
    [value['name'], value['displayName'], value['email']].some(
      (candidate) => typeof candidate === 'string' && candidate.trim() !== '',
    )
  );
}

function isRamsMethodStep(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isString(value['id']) && isString(value['title']) && isOptionalString(value['detail']);
}

function isRamsJob(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value['id']) &&
    isNullableString(value['reference']) &&
    isNullableString(value['externalReference']) &&
    isString(value['title']) &&
    isNullableString(value['category']) &&
    isNullableString(value['jobType']) &&
    isNullableString(value['plannedStart']) &&
    isNullableString(value['targetCompletion'])
  );
}

function isRamsCustomer(value: unknown): boolean {
  return isRecord(value) && isString(value['name']);
}

function isRamsSite(value: unknown): boolean {
  return isRecord(value) && isString(value['name']) && isStringArray(value['addressLines']);
}

function isPngSignatureDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/u.exec(value);
  if (match === null) return false;
  const encoded = match[1];
  if (encoded === undefined || encoded.length % 4 !== 0) return false;
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedBytes = (encoded.length / 4) * 3 - padding;
  if (decodedBytes <= 8 || decodedBytes > RAMS_MAX_SIGNATURE_BYTES) return false;
  try {
    const header = atob(encoded.slice(0, 12));
    return (
      header.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header.charCodeAt(index) === byte)
    );
  } catch {
    return false;
  }
}

function isRamsAcknowledgement(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    value['id'].trim() !== '' &&
    isString(value['signerName']) &&
    value['signerName'].trim() !== '' &&
    isNullableString(value['signerEmail']) &&
    isString(value['signerRole']) &&
    value['signerRole'].trim() !== '' &&
    isString(value['statement']) &&
    value['statement'].trim() !== '' &&
    isString(value['signedAt']) &&
    value['signedAt'].trim() !== '' &&
    isPngSignatureDataUrl(value['signatureData'])
  );
}

function isRiskRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

function isRamsHazard(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value['id']) &&
    isString(value['hazard']) &&
    isString(value['peopleAtRisk']) &&
    isRiskRating(value['initialLikelihood']) &&
    isRiskRating(value['initialSeverity']) &&
    isString(value['controls']) &&
    isRiskRating(value['residualLikelihood']) &&
    isRiskRating(value['residualSeverity']) &&
    ['howHarmed', 'furtherActions', 'actionOwner', 'actionDueDate', 'actionStatus'].every((key) =>
      isOptionalString(value[key]),
    )
  );
}

function isRamsDraftData(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const overview = value['overview'];
  const scope = value['scope'];
  const method = value['methodStatement'];
  const risk = value['riskAssessment'];
  const requirements = value['requirements'];
  const supporting = value['supportingInformation'];
  const review = value['review'];
  if (
    !isRecord(overview) ||
    !isRecord(scope) ||
    !isRecord(method) ||
    !isRecord(risk) ||
    !isRecord(requirements) ||
    !isRecord(supporting) ||
    !isRecord(review)
  )
    return false;
  const references = supporting['references'];
  const documents = supporting['documents'];
  const responsibilities = scope['responsibilities'];
  const emergencyDetails = requirements['emergencyDetails'];
  const namedReference = (item: unknown): boolean =>
    isRecord(item) && isString(item['id']) && isString(item['name']) && isString(item['reference']);
  return (
    (value['schemaVersion'] === undefined || value['schemaVersion'] === 2) &&
    ['title', 'category', 'effectiveFrom'].every((key) => isString(overview[key])) &&
    ['reviewBy', 'revisionSummary'].every((key) => isOptionalString(overview[key])) &&
    isString(scope['scopeOfWorks']) &&
    ['exclusions', 'engineerBriefing'].every((key) => isStringArray(scope[key])) &&
    ['keyActivities', 'assumptions', 'workAreas'].every((key) =>
      isOptionalStringArray(scope[key]),
    ) &&
    isOptionalString(scope['workBoundaries']) &&
    (responsibilities === undefined ||
      (Array.isArray(responsibilities) &&
        responsibilities.every(
          (item) =>
            isRecord(item) &&
            isString(item['id']) &&
            ['name', 'role', 'responsibility'].every((key) => isString(item[key])) &&
            ['organisation', 'contact'].every((key) => isOptionalString(item[key])),
        ))) &&
    Array.isArray(method['steps']) &&
    method['steps'].every(isRamsMethodStep) &&
    Array.isArray(risk['hazards']) &&
    risk['hazards'].every(isRamsHazard) &&
    ['ppe', 'tools', 'competencies', 'emergencyArrangements'].every((key) =>
      isStringArray(requirements[key]),
    ) &&
    ['plant', 'materials', 'training', 'substances', 'welfare'].every((key) =>
      isOptionalStringArray(requirements[key]),
    ) &&
    (emergencyDetails === undefined ||
      (isRecord(emergencyDetails) &&
        [
          'contactName',
          'contactNumber',
          'nearestHospital',
          'hospitalAddress',
          'assemblyPoint',
          'additionalInfo',
        ].every((key) => isString(emergencyDetails[key])))) &&
    ['siteAccess', 'permits', 'welfare', 'environmental'].every((key) =>
      isString(supporting[key]),
    ) &&
    Array.isArray(references) &&
    references.every(
      (reference) =>
        isRecord(reference) &&
        isString(reference['id']) &&
        isString(reference['title']) &&
        isString(reference['url']),
    ) &&
    [
      'permitReferences',
      'coshhReferences',
      'workingAtHeightReferences',
      'legislationReferences',
    ].every(
      (key) =>
        supporting[key] === undefined ||
        (Array.isArray(supporting[key]) && supporting[key].every(namedReference)),
    ) &&
    isOptionalStringArray(supporting['electricalSafety']) &&
    (documents === undefined ||
      (Array.isArray(documents) &&
        documents.every(
          (document) =>
            isRecord(document) &&
            ['id', 'name', 'type', 'reference', 'status'].every((key) => isString(document[key])),
        ))) &&
    (review['approvalMode'] === 'AUTHOR' || review['approvalMode'] === 'REVIEWER') &&
    typeof review['requireEngineerAcknowledgement'] === 'boolean' &&
    ['internalNotes', 'changeImpact', 'revisionReason', 'changeSummary'].every((key) =>
      isOptionalString(review[key]),
    )
  );
}

function isRamsRenderPayload(value: unknown): value is RamsRenderPayload {
  if (!isRecord(value)) return false;
  const organisation = value['organisation'];
  const job = value['job'];
  const customer = value['customer'];
  const site = value['site'];
  const people = value['people'];
  const history = value['revisionHistory'];
  const jobs = value['jobs'];
  const acknowledgements = value['acknowledgements'];
  if (
    !isRecord(organisation) ||
    !isRecord(job) ||
    !isRecord(customer) ||
    !isRecord(site) ||
    !isRecord(people) ||
    !Array.isArray(history)
  )
    return false;
  return (
    isString(value['templateVersion']) &&
    ['DRAFT', 'UNDER_REVIEW', 'APPROVED'].includes(String(value['documentState'])) &&
    (value['revisionNumber'] === null ||
      (typeof value['revisionNumber'] === 'number' &&
        Number.isInteger(value['revisionNumber']) &&
        value['revisionNumber'] >= 0)) &&
    isString(value['reference']) &&
    isString(value['title']) &&
    ['effectiveFrom', 'submittedAt', 'approvedAt', 'reviewComment'].every((key) =>
      isNullableString(value[key]),
    ) &&
    isString(value['generatedAt']) &&
    isString(organisation['name']) &&
    isStringArray(organisation['addressLines']) &&
    (organisation['logoImage'] === undefined ||
      (isRecord(organisation['logoImage']) &&
        isString(organisation['logoImage']['base64']) &&
        ['image/jpeg', 'image/png', 'image/webp'].includes(
          String(organisation['logoImage']['mimeType']),
        ))) &&
    isRamsJob(job) &&
    isRamsCustomer(customer) &&
    isRamsSite(site) &&
    Array.isArray(jobs) &&
    jobs.length > 0 &&
    jobs.every(
      (context) =>
        isRecord(context) &&
        isRamsJob(context['job']) &&
        isRamsCustomer(context['customer']) &&
        isRamsSite(context['site']) &&
        (context['assignedEngineer'] === undefined || isRamsPerson(context['assignedEngineer'])),
    ) &&
    isRamsPerson(people['preparedBy']) &&
    (people['reviewedBy'] === undefined ||
      people['reviewedBy'] === null ||
      isRamsPerson(people['reviewedBy'])) &&
    (people['approvedBy'] === undefined ||
      people['approvedBy'] === null ||
      isRamsPerson(people['approvedBy'])) &&
    (people['assignedEngineer'] === undefined ||
      people['assignedEngineer'] === null ||
      isRamsPerson(people['assignedEngineer'])) &&
    isRamsDraftData(value['data']) &&
    Array.isArray(acknowledgements) &&
    acknowledgements.every(isRamsAcknowledgement) &&
    history.every(
      (item) =>
        isRecord(item) &&
        typeof item['revisionNumber'] === 'number' &&
        Number.isInteger(item['revisionNumber']) &&
        item['revisionNumber'] >= 0 &&
        isString(item['createdAt']) &&
        isRamsPerson(item['createdBy']) &&
        isOptionalString(item['status']) &&
        isOptionalString(item['summary']),
    )
  );
}

function isJobSheetImage(value: unknown): boolean {
  const base64 = isRecord(value) && isString(value['base64']) ? value['base64'] : '';
  const encoded = base64.replaceAll(/\s/gu, '');
  return (
    isRecord(value) &&
    encoded.length > 0 &&
    encoded.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/u.test(encoded) &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(String(value['mimeType']))
  );
}

function isJobSheetContact(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['name']) &&
    ['role', 'email', 'telephone', 'mobile'].every((key) => isNullableString(value[key])) &&
    typeof value['primary'] === 'boolean'
  );
}

function isJobSheetTask(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const asset = value['asset'];
  const inspection = value['inspection'];
  return (
    typeof value['order'] === 'number' &&
    Number.isInteger(value['order']) &&
    isString(value['title']) &&
    isString(value['moduleKey']) &&
    isString(value['status']) &&
    (asset === null ||
      (isRecord(asset) &&
        ['reference', 'displayName', 'type'].every((key) => isString(asset[key])) &&
        ['manufacturer', 'model', 'serialNumber'].every((key) => isNullableString(asset[key])))) &&
    (inspection === null ||
      (isRecord(inspection) &&
        isString(inspection['status']) &&
        typeof inspection['currentRevisionNumber'] === 'number' &&
        Number.isInteger(inspection['currentRevisionNumber']) &&
        inspection['currentRevisionNumber'] >= 0))
  );
}

function isAttachedRams(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['reference']) &&
    isString(value['title']) &&
    ['DRAFT', 'UNDER_REVIEW', 'APPROVED'].includes(String(value['documentState'])) &&
    (value['revisionNumber'] === null ||
      (typeof value['revisionNumber'] === 'number' &&
        Number.isInteger(value['revisionNumber']) &&
        value['revisionNumber'] >= 0))
  );
}

function isJobSheetRenderPayload(
  value: unknown,
  requireRams: boolean,
): value is JobSheetRenderPayload {
  if (!isRecord(value) || value['templateVersion'] !== 'job-sheet-a4-v1') return false;
  const organisation = value['organisation'];
  const job = value['job'];
  const customer = value['customer'];
  const site = value['site'];
  const assignment = value['assignment'];
  const contacts = value['contacts'];
  const tasks = value['tasks'];
  const attachedRams = value['attachedRams'];
  const rams = value['rams'];
  if (
    !isRecord(organisation) ||
    !isRecord(job) ||
    !isRecord(customer) ||
    !isRecord(site) ||
    !isRecord(assignment) ||
    !Array.isArray(contacts) ||
    !Array.isArray(tasks) ||
    !Array.isArray(attachedRams)
  )
    return false;
  return (
    isString(value['generatedAt']) &&
    isString(organisation['name']) &&
    isStringArray(organisation['addressLines']) &&
    ['telephone', 'email', 'website'].every((key) => isNullableString(organisation[key])) &&
    (organisation['logoImage'] === undefined || isJobSheetImage(organisation['logoImage'])) &&
    isString(job['id']) &&
    [
      'reference',
      'externalReference',
      'description',
      'exclusions',
      'jobType',
      'category',
      'scheduledEnd',
      'engineerNotes',
    ].every((key) => isNullableString(job[key])) &&
    ['title', 'status', 'scheduledStart'].every((key) => isString(job[key])) &&
    isString(customer['name']) &&
    isNullableString(customer['reference']) &&
    isString(site['name']) &&
    isNullableString(site['reference']) &&
    isStringArray(site['addressLines']) &&
    [
      'accessInstructions',
      'parkingInformation',
      'openingTimes',
      'ppeRequirements',
      'inductionInformation',
    ].every((key) => isNullableString(site[key])) &&
    isString(assignment['name']) &&
    isNullableString(assignment['email']) &&
    isNullableString(assignment['mobile']) &&
    ['MEMBER', 'GUEST', 'UNASSIGNED'].includes(String(assignment['kind'])) &&
    contacts.every(isJobSheetContact) &&
    tasks.every(isJobSheetTask) &&
    attachedRams.every(isAttachedRams) &&
    (rams === undefined ? !requireRams : Array.isArray(rams) && rams.every(isRamsRenderPayload))
  );
}

function ramsJsonError(status: 413 | 422 | 502 | 503, code: string, message: string): Response {
  return Response.json(
    { code, message },
    {
      status,
      headers: {
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    },
  );
}

async function readRamsPayload(request: Request): Promise<RamsRenderPayload | Response> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > RAMS_MAX_REQUEST_BYTES)
      return ramsJsonError(
        413,
        'RAMS_PAYLOAD_TOO_LARGE',
        'The RAMS render payload must not exceed 1 MB.',
      );
  }
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json'))
    return ramsJsonError(422, 'INVALID_RAMS_PAYLOAD', 'A JSON RAMS render payload is required.');

  const body = await request.arrayBuffer();
  if (body.byteLength > RAMS_MAX_REQUEST_BYTES)
    return ramsJsonError(
      413,
      'RAMS_PAYLOAD_TOO_LARGE',
      'The RAMS render payload must not exceed 1 MB.',
    );
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return ramsJsonError(422, 'INVALID_RAMS_PAYLOAD', 'The RAMS render payload is not valid JSON.');
  }
  if (!isRamsRenderPayload(payload))
    return ramsJsonError(
      422,
      'INVALID_RAMS_PAYLOAD',
      'The RAMS render payload is incomplete or invalid.',
    );
  return payload;
}

async function readDocumentPayload(
  request: Request,
): Promise<{ payload: unknown } | { response: Response }> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > DOCUMENT_MAX_REQUEST_BYTES)
      return {
        response: Response.json(
          {
            code: 'DOCUMENT_PAYLOAD_TOO_LARGE',
            message: 'The document render payload must not exceed 40 MiB.',
          },
          { status: 413 },
        ),
      };
  }

  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let json = '';
  if (reader !== undefined) {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytesRead += result.value.byteLength;
      if (bytesRead > DOCUMENT_MAX_REQUEST_BYTES) {
        await reader.cancel();
        return {
          response: Response.json(
            {
              code: 'DOCUMENT_PAYLOAD_TOO_LARGE',
              message: 'The document render payload must not exceed 40 MiB.',
            },
            { status: 413 },
          ),
        };
      }
      json += decoder.decode(result.value, { stream: true });
    }
    json += decoder.decode();
  }
  try {
    return { payload: JSON.parse(json) as unknown };
  } catch {
    return {
      response: Response.json(
        { code: 'INVALID_DOCUMENT_PAYLOAD', message: 'The document payload is not valid JSON.' },
        { status: 422 },
      ),
    };
  }
}

function jobSheetJsonError(status: 413 | 422 | 502 | 503, code: string, message: string): Response {
  return Response.json(
    { code, message },
    {
      status,
      headers: {
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    },
  );
}

function jobSheetFooterTemplate(payload: JobSheetRenderPayload): string {
  return `<div style="box-sizing:border-box;width:100%;height:14mm;padding:0 12mm 2mm;color:#53647b;font-family:Arial,Helvetica,sans-serif;font-size:7pt;line-height:1.2;overflow:hidden">
    <div style="box-sizing:border-box;display:grid;grid-template-columns:1fr auto;width:100%;height:100%;gap:5mm;padding-top:2mm;border-top:1px solid #9ba9ba;overflow:hidden">
      <div style="min-width:0;overflow:hidden;overflow-wrap:anywhere">Job ${escapeHtml(payload.job.reference ?? payload.job.id)}</div>
      <div style="white-space:nowrap">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
    </div>
  </div>`;
}

async function renderJobSheetWithBrowser(
  environment: PdfBindings,
  payload: JobSheetRenderPayload,
): Promise<Response> {
  if (environment.BROWSER === undefined)
    return jobSheetJsonError(
      503,
      'JOB_SHEET_RENDERER_UNAVAILABLE',
      'The browser PDF renderer is unavailable.',
    );
  const configuredTimeout = Number.parseInt(environment.RENDER_TIMEOUT_MS, 10);
  const timeout = Number.isFinite(configuredTimeout)
    ? Math.min(Math.max(configuredTimeout, 5_000), 120_000)
    : 30_000;
  try {
    const rendered = await environment.BROWSER.quickAction('pdf', {
      html: renderJobSheetReportHtml(payload),
      emulateMediaType: 'print',
      setJavaScriptEnabled: false,
      actionTimeout: timeout,
      pdfOptions: {
        format: 'a4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: jobSheetFooterTemplate(payload),
        tagged: true,
        outline: true,
        timeout,
      },
    });
    if (!rendered.ok) {
      console.error(
        JSON.stringify({ event: 'pdf.job_sheet_browser_run_failed', status: rendered.status }),
      );
      return jobSheetJsonError(
        502,
        'JOB_SHEET_RENDER_FAILED',
        'The job sheet PDF could not be rendered.',
      );
    }
    const headers = new Headers({
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="job-sheet.pdf"',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-ohmaudit-pdf-renderer': 'browser-run',
    });
    const browserTime = rendered.headers.get('x-browser-ms-used');
    if (browserTime !== null) headers.set('x-ohmaudit-browser-ms-used', browserTime);
    return new Response(rendered.body, { headers });
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: 'pdf.job_sheet_browser_run_unavailable',
        errorType: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : 'Unknown Browser Run error',
      }),
    );
    return jobSheetJsonError(
      503,
      'JOB_SHEET_RENDERER_UNAVAILABLE',
      'The browser PDF renderer is unavailable.',
    );
  }
}

async function renderRamsReportWithBrowser(
  environment: PdfBindings,
  payload: RamsRenderPayload,
): Promise<Response> {
  if (environment.BROWSER === undefined)
    return ramsJsonError(
      503,
      'RAMS_RENDERER_UNAVAILABLE',
      'The browser PDF renderer is unavailable.',
    );
  const configuredTimeout = Number.parseInt(environment.RENDER_TIMEOUT_MS, 10);
  const timeout = Number.isFinite(configuredTimeout)
    ? Math.min(Math.max(configuredTimeout, 5_000), 120_000)
    : 30_000;
  try {
    const rendered = await environment.BROWSER.quickAction('pdf', {
      html: renderRamsReportHtml(payload),
      emulateMediaType: 'print',
      setJavaScriptEnabled: false,
      actionTimeout: timeout,
      pdfOptions: {
        format: 'a4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: ramsFooterTemplate(payload),
        tagged: true,
        outline: true,
        timeout,
      },
    });
    if (!rendered.ok) {
      console.error(
        JSON.stringify({ event: 'pdf.rams_browser_run_failed', status: rendered.status }),
      );
      return ramsJsonError(502, 'RAMS_RENDER_FAILED', 'The RAMS PDF could not be rendered.');
    }
    const headers = new Headers({
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="rams.pdf"',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-ohmaudit-pdf-renderer': 'browser-run',
    });
    const browserTime = rendered.headers.get('x-browser-ms-used');
    if (browserTime !== null) headers.set('x-ohmaudit-browser-ms-used', browserTime);
    return new Response(rendered.body, { headers });
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: 'pdf.rams_browser_run_unavailable',
        errorType: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : 'Unknown Browser Run error',
      }),
    );
    return ramsJsonError(
      503,
      'RAMS_RENDERER_UNAVAILABLE',
      'The browser PDF renderer is unavailable.',
    );
  }
}

function thermalCertificateForBrowser(
  payload: CertificatePayload | VisitReportPayload,
): ThermalCertificatePayload | undefined {
  if ('certificates' in payload) {
    if (payload.certificates.length !== 1) return undefined;
    return payload.certificates[0]?.thermalCertificate;
  }
  return payload.thermalCertificate;
}

async function renderThermalReportWithBrowser(
  environment: PdfBindings,
  payload: CertificatePayload | VisitReportPayload,
  filename: string,
): Promise<Response | undefined> {
  const thermalCertificate = thermalCertificateForBrowser(payload);
  if (environment.BROWSER === undefined || thermalCertificate === undefined) return undefined;

  const configuredTimeout = Number.parseInt(environment.RENDER_TIMEOUT_MS, 10);
  const timeout = Number.isFinite(configuredTimeout)
    ? Math.min(Math.max(configuredTimeout, 5_000), 120_000)
    : 30_000;

  try {
    const rendered = await environment.BROWSER.quickAction('pdf', {
      html: renderThermalReportHtml(thermalCertificate),
      emulateMediaType: 'print',
      setJavaScriptEnabled: false,
      actionTimeout: timeout,
      pdfOptions: {
        format: 'a4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        tagged: true,
        outline: true,
        timeout,
      },
    });
    if (!rendered.ok) {
      console.error(
        JSON.stringify({
          event: 'pdf.browser_run_failed',
          status: rendered.status,
        }),
      );
      return undefined;
    }

    const headers = new Headers({
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
      'x-ohmaudit-pdf-renderer': 'browser-run',
    });
    const browserTime = rendered.headers.get('x-browser-ms-used');
    if (browserTime !== null) headers.set('x-ohmaudit-browser-ms-used', browserTime);
    return new Response(rendered.body, { headers });
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: 'pdf.browser_run_unavailable',
        errorType: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : 'Unknown Browser Run error',
      }),
    );
    return undefined;
  }
}

function reportImageDataUri(image: ReportImagePayload): string | undefined {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) ||
    !/^[A-Za-z0-9+/\r\n]+={0,2}$/u.test(image.base64)
  )
    return undefined;
  return `data:${image.mimeType};base64,${image.base64.replaceAll(/\s/gu, '')}`;
}

async function logoJpegForNativeRenderer(
  environment: PdfBindings,
  image: ReportImagePayload | undefined,
  conversions: Map<string, Promise<string | undefined>>,
): Promise<string | undefined> {
  if (image === undefined) return undefined;
  if (image.mimeType === 'image/jpeg') return image.base64;
  if (environment.BROWSER === undefined || reportImageDataUri(image) === undefined)
    return undefined;
  const cacheKey = `${image.mimeType}:${image.base64}`;
  const existing = conversions.get(cacheKey);
  if (existing !== undefined) return existing;

  const conversion = (async () => {
    try {
      const source = reportImageDataUri(image);
      if (source === undefined) return undefined;
      const rendered = await environment.BROWSER!.quickAction('screenshot', {
        html: `<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0;background:#fff}#logo{width:400px;height:180px;display:grid;place-items:center;background:#fff}img{display:block;max-width:380px;max-height:160px;object-fit:contain}</style></head><body><div id="logo"><img src="${source}" alt=""></div></body></html>`,
        selector: '#logo',
        viewport: { width: 400, height: 180, deviceScaleFactor: 1 },
        waitForSelector: { selector: '#logo img', visible: true, timeout: 10_000 },
        setJavaScriptEnabled: false,
        cacheTTL: 0,
        actionTimeout: 30_000,
        screenshotOptions: {
          type: 'jpeg',
          encoding: 'binary',
          quality: 90,
          omitBackground: false,
        },
      });
      if (!rendered.ok || !rendered.headers.get('content-type')?.includes('image/jpeg')) {
        console.error(
          JSON.stringify({ event: 'pdf.logo_conversion_failed', status: rendered.status }),
        );
        return undefined;
      }
      const bytes = new Uint8Array(await rendered.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return btoa(binary);
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          event: 'pdf.logo_conversion_unavailable',
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
      return undefined;
    }
  })();
  conversions.set(cacheKey, conversion);
  return conversion;
}

async function prepareCertificateLogos(
  environment: PdfBindings,
  payload: CertificatePayload,
  conversions: Map<string, Promise<string | undefined>>,
): Promise<void> {
  if (payload.logoJpegBase64 === undefined) {
    const logo = await logoJpegForNativeRenderer(environment, payload.logoImage, conversions);
    if (logo !== undefined) payload.logoJpegBase64 = logo;
  }
  if (
    payload.thermalCertificate !== undefined &&
    payload.thermalCertificate.logoJpegBase64 === undefined
  ) {
    const logo = await logoJpegForNativeRenderer(
      environment,
      payload.thermalCertificate.logoImage,
      conversions,
    );
    if (logo !== undefined) payload.thermalCertificate.logoJpegBase64 = logo;
  }
  if (payload.evCertificate !== undefined) {
    if (payload.evCertificate.testingCompany.logoJpegBase64 === undefined) {
      const logo = await logoJpegForNativeRenderer(
        environment,
        payload.evCertificate.testingCompany.logoImage,
        conversions,
      );
      if (logo !== undefined) payload.evCertificate.testingCompany.logoJpegBase64 = logo;
    }
    if (payload.evCertificate.testingLocation.logoJpegBase64 === undefined) {
      const logo = await logoJpegForNativeRenderer(
        environment,
        payload.evCertificate.testingLocation.logoImage,
        conversions,
      );
      if (logo !== undefined) payload.evCertificate.testingLocation.logoJpegBase64 = logo;
    }
  }
}

async function prepareNativeReportLogos(
  environment: PdfBindings,
  payload: CertificatePayload | VisitReportPayload,
): Promise<void> {
  const conversions = new Map<string, Promise<string | undefined>>();
  if ('certificates' in payload) {
    if (payload.logoJpegBase64 === undefined) {
      const logo = await logoJpegForNativeRenderer(environment, payload.logoImage, conversions);
      if (logo !== undefined) payload.logoJpegBase64 = logo;
    }
    await Promise.all(
      payload.certificates.map((certificate) =>
        prepareCertificateLogos(environment, certificate, conversions),
      ),
    );
    return;
  }
  await prepareCertificateLogos(environment, payload, conversions);
}

export default {
  async fetch(request: Request, env: PdfBindings): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health')
      return Response.json({
        service: 'ohmaudit-worker-pdf',
        status: 'ok',
        version: env.APP_VERSION,
      });
    const templateId = normaliseDocumentPath(url);
    if (request.method !== 'POST' || templateId === undefined)
      return Response.json(
        { code: 'ROUTE_NOT_FOUND', message: 'Render route not found.' },
        { status: 404 },
      );
    if (templateId === 'rams-a4-v1') {
      const ramsPayload = await readRamsPayload(request);
      if (ramsPayload instanceof Response) return ramsPayload;
      return renderRamsReportWithBrowser(env, ramsPayload);
    }
    if (templateId === 'job-sheet-a4-v1' || templateId === 'job-sheet-with-rams-a4-v1') {
      if (!request.headers.get('content-type')?.toLowerCase().includes('application/json'))
        return jobSheetJsonError(
          422,
          'INVALID_JOB_SHEET_PAYLOAD',
          'A JSON job sheet render payload is required.',
        );
      const documentPayload = await readDocumentPayload(request);
      if ('response' in documentPayload) {
        const status = documentPayload.response.status;
        return status === 413
          ? jobSheetJsonError(
              413,
              'JOB_SHEET_PAYLOAD_TOO_LARGE',
              'The job sheet render payload must not exceed 40 MiB.',
            )
          : jobSheetJsonError(
              422,
              'INVALID_JOB_SHEET_PAYLOAD',
              'The job sheet render payload is not valid JSON.',
            );
      }
      if (
        !isJobSheetRenderPayload(
          documentPayload.payload,
          templateId === 'job-sheet-with-rams-a4-v1',
        )
      )
        return jobSheetJsonError(
          422,
          'INVALID_JOB_SHEET_PAYLOAD',
          'The job sheet render payload is incomplete or invalid.',
        );
      return renderJobSheetWithBrowser(env, documentPayload.payload);
    }
    const documentPayload = await readDocumentPayload(request);
    if ('response' in documentPayload) return documentPayload.response;
    const { payload } = documentPayload;
    const visitReport = templateId === 'visit-report';
    if (visitReport ? !isVisitReportPayload(payload) : !isPayload(payload))
      return Response.json(
        { code: 'INVALID_DOCUMENT_PAYLOAD', message: 'The certificate payload is invalid.' },
        { status: 422 },
      );
    if (templateId === 'thermal-report-html') {
      const certificate = payload as CertificatePayload;
      if (certificate.thermalCertificate === undefined)
        return Response.json(
          { code: 'INVALID_DOCUMENT_PAYLOAD', message: 'A thermal report is required.' },
          { status: 422 },
        );
      return new Response(renderThermalReportHtml(certificate.thermalCertificate), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-disposition': 'inline; filename="thermal-imaging-report.html"',
          'cache-control': 'private, no-store',
          'content-security-policy':
            "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        },
      });
    }
    const checkedPayload = payload as CertificatePayload | VisitReportPayload;
    const browserPdf = await renderThermalReportWithBrowser(
      env,
      checkedPayload,
      `${templateId}.pdf`,
    );
    if (browserPdf !== undefined) return browserPdf;

    await prepareNativeReportLogos(env, checkedPayload);

    const pdf = visitReport
      ? renderVisitReportPdf(checkedPayload as VisitReportPayload)
      : renderCertificatePdf(checkedPayload as CertificatePayload);
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${templateId}.pdf"`,
        'cache-control': 'private, no-store',
        'x-ohmaudit-pdf-renderer':
          thermalCertificateForBrowser(checkedPayload) === undefined ? 'native' : 'native-fallback',
      },
    });
  },
} satisfies ExportedHandler<PdfBindings>;
