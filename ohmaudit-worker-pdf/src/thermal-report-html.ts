import type { ReportImagePayload, ThermalCertificatePayload } from './index';

const BRAND = {
  navy: '#071B34',
  navyRaised: '#0A2547',
  blue: '#145FC9',
  blueTint: '#E8F0FF',
  amber: '#FFB000',
  ink: '#14233A',
  muted: '#52627A',
  line: '#D6DEE9',
  canvas: '#F6F8FA',
  success: '#09845D',
  warning: '#B86F00',
  danger: '#C33D4A',
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function text(value: string | undefined, fallback = 'NOT RECORDED'): string {
  const normalised = value?.trim();
  return escapeHtml((normalised ? normalised : fallback).toLocaleUpperCase('en-GB'));
}

function imageSource(base64: string | undefined): string | undefined {
  if (base64 === undefined || !/^[A-Za-z0-9+/\r\n]+={0,2}$/u.test(base64)) return undefined;
  return `data:image/jpeg;base64,${base64.replaceAll(/\s/gu, '')}`;
}

function reportImageSource(image: ReportImagePayload | undefined): string | undefined {
  if (
    image === undefined ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) ||
    !/^[A-Za-z0-9+/\r\n]+={0,2}$/u.test(image.base64)
  )
    return undefined;
  return `data:${image.mimeType};base64,${image.base64.replaceAll(/\s/gu, '')}`;
}

function logo(payload: ThermalCertificatePayload): string {
  const source = reportImageSource(payload.logoImage) ?? imageSource(payload.logoJpegBase64);
  return source === undefined
    ? `<div class="brand-mark" aria-label="OhmAudit"><span>Ω</span><strong>OHMAUDIT</strong></div>`
    : `<img class="company-logo" src="${source}" alt="${text(payload.organisationName)} logo">`;
}

function detail(label: string, value: string | undefined, className = ''): string {
  return `<div class="detail ${className}"><dt>${escapeHtml(label)}</dt><dd>${text(value)}</dd></div>`;
}

function targetImage(
  image: ThermalCertificatePayload['targets'][number]['images'][number],
  targetName: string,
  index: number,
  total: number,
): string {
  const source = imageSource(image.jpegBase64);
  if (source === undefined) return '';
  return `<figure class="evidence-image">
    <div class="image-frame"><img src="${source}" alt="${text(targetName)} ${text(image.kind)} image ${index + 1}"></div>
    <figcaption>
      <div><span>${text(image.kind)}</span><small>IMAGE ${index + 1} OF ${total}</small></div>
      ${image.description?.trim() ? `<p>${text(image.description, '')}</p>` : ''}
    </figcaption>
  </figure>`;
}

function footer(reference: string, page: number, totalPages: number): string {
  return `<footer class="report-footer">
    <span>OHMAUDIT · THERMAL IMAGING REPORT</span>
    <span>REPORT REF: ${text(reference)}</span>
    <span>PAGE ${page} OF ${totalPages}</span>
  </footer>`;
}

function targetPage(
  target: ThermalCertificatePayload['targets'][number],
  targetIndex: number,
  payload: ThermalCertificatePayload,
  images: ThermalCertificatePayload['targets'][number]['images'],
  imageOffset: number,
  continuation: boolean,
  page: number,
  totalPages: number,
): string {
  const isFault = target.condition.toLocaleUpperCase('en-GB') === 'FAULT';
  const renderedImages = images
    .map((image, imageIndex) =>
      targetImage(image, target.name, imageOffset + imageIndex, target.images.length),
    )
    .join('');
  const evidence = renderedImages
    ? `<div class="evidence-grid">${renderedImages}</div>`
    : `<div class="empty-evidence">NO REPORT IMAGES WERE AVAILABLE FOR THIS TARGET ITEM.</div>`;
  return `<section class="report-page target-page${continuation ? ' continuation-page' : ''}">
    <header class="page-header">
      ${logo(payload)}
      <div><span>THERMAL IMAGING REPORT</span><strong>TARGET ${targetIndex + 1} OF ${payload.targets.length}${continuation ? ' · EVIDENCE CONTINUATION' : ''}</strong></div>
    </header>

    <div class="target-heading">
      <div>
        <p class="eyebrow">${continuation ? 'TARGET EVIDENCE CONTINUATION' : 'TARGET ITEM'}</p>
        <h2>${text(target.name, `TARGET ITEM ${targetIndex + 1}`)}</h2>
        <p>${
          [target.reference, target.location]
            .filter(Boolean)
            .map((value) => text(value))
            .join(' <span>·</span> ') || 'REFERENCE AND LOCATION NOT RECORDED'
        }</p>
      </div>
      <div class="status ${isFault ? 'fault' : 'clear'}">
        <span>${isFault ? '!' : '✓'}</span>
        <div><small>CONDITION</small><strong>${isFault ? 'FAULT REPORTED' : 'NO ISSUES'}</strong></div>
      </div>
    </div>

    ${evidence}

    ${
      continuation
        ? `<div class="continuation-note">EVIDENCE CONTINUATION · IMAGES ${imageOffset + 1}-${imageOffset + images.length} OF ${target.images.length}</div>`
        : isFault
          ? `<div class="fault-summary">
            <div><small>SEVERITY</small><strong>${text(target.severity)}</strong></div>
            <div><small>MAX TEMPERATURE</small><strong>${text(target.maxTemperatureC)}${target.maxTemperatureC ? ' °C' : ''}</strong></div>
            <div><small>TEMPERATURE DIFFERENCE</small><strong>${text(target.deltaTemperatureC)}${target.deltaTemperatureC ? ' °C' : ''}</strong></div>
          </div>
          <div class="narrative fault-copy">
            <article><h3>ISSUE SUMMARY</h3><p>${text(target.issueSummary)}</p></article>
            <article><h3>DETAILED OBSERVATIONS</h3><p>${text(target.observations, 'NONE RECORDED')}</p></article>
            <article class="recommendation"><h3>RECOMMENDED ACTION</h3><p>${text(target.recommendation, 'NONE RECORDED')}</p></article>
          </div>`
          : `<div class="clear-assessment">
            <span>✓</span>
            <div><h3>NO ISSUES RECORDED</h3><p>NO THERMAL ANOMALIES OR REPORTABLE ISSUES WERE IDENTIFIED FOR THIS TARGET ITEM AT THE TIME OF INSPECTION.</p></div>
          </div>
          <div class="narrative">
            <article><h3>ENGINEER OBSERVATIONS</h3><p>${text(target.observations, 'NO ADDITIONAL OBSERVATIONS RECORDED')}</p></article>
          </div>`
    }

    ${continuation ? '' : `<div class="engineer-signoff"><span>INSPECTED BY</span><strong>${text(payload.engineerName)}</strong><span>ON ${text(payload.reportDate)}</span></div>`}
    ${footer(payload.reportReference, page, totalPages)}
  </section>`;
}

function thermalImagePageGroups(images: readonly unknown[]): Array<{ offset: number; images: readonly unknown[] }> {
  if (images.length === 0) return [{ offset: 0, images: images }];
  const groups: Array<{ offset: number; images: readonly unknown[] }> = [];
  groups.push({ offset: 0, images: images.slice(0, 2) });
  let offset = 2;
  while (offset < images.length) {
    groups.push({ offset, images: images.slice(offset, offset + 4) });
    offset += 4;
  }
  return groups;
}

function targetPageCount(target: ThermalCertificatePayload['targets'][number]): number {
  return Math.max(1, thermalImagePageGroups(target.images).length);
}

/** Returns a self-contained, print-safe A4 HTML report with no external resources. */
export function renderThermalReportHtml(payload: ThermalCertificatePayload): string {
  const faultCount = payload.targets.filter(
    ({ condition }) => condition.toLocaleUpperCase('en-GB') === 'FAULT',
  ).length;
  const noIssueCount = payload.targets.length - faultCount;
  const totalPages =
    1 + payload.targets.reduce((pages, target) => pages + targetPageCount(target), 0);
  const outcomeClass = faultCount > 0 ? 'fault' : 'clear';
  const details = payload.details;
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${text(payload.siteName)} - THERMAL IMAGING REPORT</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, Helvetica, sans-serif; color: ${BRAND.ink}; background: ${BRAND.canvas}; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { background: ${BRAND.canvas}; font-size: 10pt; line-height: 1.42; }
    .screen-note { width: 210mm; margin: 18px auto 10px; padding: 10px 14px; border: 1px solid ${BRAND.line}; border-radius: 8px; background: #fff; color: ${BRAND.muted}; text-align: center; font-size: 9pt; }
    .report-page { position: relative; width: 210mm; min-height: 297mm; margin: 10mm auto; padding: 15mm 15mm 17mm; background: #fff; box-shadow: 0 10px 34px rgba(7, 27, 52, .12); break-after: page; page-break-after: always; }
    .report-page:last-of-type { break-after: auto; page-break-after: auto; }
    .cover-page::before { content: ''; position: absolute; inset: 0 0 auto; height: 8mm; background: ${BRAND.navy}; }
    .cover-page::after { content: ''; position: absolute; top: 0; right: 15mm; width: 32mm; height: 8mm; background: ${BRAND.amber}; }
    .brand-row, .page-header { display: flex; align-items: center; justify-content: space-between; gap: 12mm; }
    .brand-row { margin-top: 3mm; }
    .company-logo { display: block; max-width: 46mm; max-height: 20mm; object-fit: contain; object-position: left center; }
    .brand-mark { display: inline-flex; align-items: center; gap: 3mm; color: ${BRAND.navy}; font-size: 14pt; letter-spacing: -.02em; }
    .brand-mark span { color: ${BRAND.amber}; font-size: 28pt; line-height: 1; }
    .brand-meta { text-align: right; }
    .brand-meta small, .eyebrow, dt, .status small, .fault-summary small, .engineer-signoff span, .page-header span, .page-header strong { color: ${BRAND.muted}; font-size: 7pt; font-weight: 700; letter-spacing: .12em; }
    .brand-meta strong { display: block; margin-top: 1mm; color: ${BRAND.navy}; font-size: 9pt; }
    .cover-title { margin: 12mm 0 7mm; }
    .cover-title .eyebrow { margin: 0 0 3mm; color: ${BRAND.blue}; }
    h1 { margin: 0; max-width: 135mm; color: ${BRAND.navy}; font-size: 30pt; line-height: 1.04; letter-spacing: -.035em; }
    .cover-title > p:last-child { margin: 3mm 0 0; max-width: 130mm; color: ${BRAND.muted}; font-size: 11pt; }
    .client-panel { display: grid; grid-template-columns: 1.25fr .75fr; margin: 0 0 5mm; border: 1px solid ${BRAND.line}; border-radius: 3mm; overflow: hidden; }
    .client-panel > div { padding: 5mm; }
    .client-panel > div:first-child { background: ${BRAND.navy}; color: #fff; }
    .client-panel small { display: block; margin-bottom: 2mm; color: inherit; opacity: .7; font-size: 7pt; font-weight: 700; letter-spacing: .12em; }
    .client-panel h2 { margin: 0 0 2mm; font-size: 17pt; line-height: 1.1; }
    .client-panel p { margin: 0; white-space: pre-line; }
    .report-identifiers { display: grid; gap: 3mm; }
    .report-identifiers div { display: flex; justify-content: space-between; gap: 5mm; border-bottom: 1px solid ${BRAND.line}; padding-bottom: 2mm; }
    .report-identifiers span { color: ${BRAND.muted}; font-size: 7pt; font-weight: 700; }
    .report-identifiers strong { text-align: right; font-size: 8.5pt; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); margin-bottom: 5mm; border: 1px solid ${BRAND.line}; border-radius: 3mm; overflow: hidden; }
    .metric { padding: 3mm; border-right: 1px solid ${BRAND.line}; background: #fff; }
    .metric:last-child { border-right: 0; }
    .metric span { display: block; color: ${BRAND.muted}; font-size: 7pt; font-weight: 700; }
    .metric strong { display: block; margin-top: 1mm; color: ${BRAND.navy}; font-size: 17pt; }
    .metric.outcome strong { color: ${BRAND.success}; font-size: 11pt; }
    .metric.outcome.fault strong { color: ${BRAND.danger}; }
    .cover-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
    .report-card { border: 1px solid ${BRAND.line}; border-radius: 3mm; overflow: hidden; break-inside: avoid; }
    .report-card h2 { margin: 0; padding: 2.5mm 4mm; background: ${BRAND.blueTint}; color: ${BRAND.navy}; font-size: 10pt; }
    .details-list { display: grid; grid-template-columns: 1fr 1fr; margin: 0; padding: 1mm 4mm 3mm; }
    .detail { min-width: 0; padding: 2mm; border-bottom: 1px solid ${BRAND.line}; }
    .detail.wide { grid-column: 1 / -1; }
    .detail:nth-last-child(-n+2) { border-bottom: 0; }
    dt { margin-bottom: 1mm; }
    dd { margin: 0; overflow-wrap: anywhere; font-size: 8.2pt; font-weight: 600; white-space: pre-line; }
    .declaration { grid-column: 1 / -1; padding: 4mm; border-left: 3px solid ${BRAND.amber}; background: #fff9e8; color: ${BRAND.muted}; font-size: 8pt; }
    .declaration strong { display: block; margin-bottom: 1mm; color: ${BRAND.ink}; }
    .page-header { padding-bottom: 4mm; border-bottom: 1px solid ${BRAND.line}; }
    .page-header .company-logo { max-height: 12mm; max-width: 38mm; }
    .page-header > div:last-child { display: flex; flex-direction: column; align-items: flex-end; gap: 1mm; }
    .target-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8mm; margin: 7mm 0 5mm; }
    .target-heading h2 { margin: 1mm 0; color: ${BRAND.navy}; font-size: 18pt; line-height: 1.1; }
    .target-heading p { margin: 0; color: ${BRAND.muted}; }
    .target-heading p span { color: ${BRAND.amber}; }
    .status { display: flex; align-items: center; gap: 3mm; min-width: 46mm; padding: 3mm 4mm; border: 1px solid; border-radius: 3mm; }
    .status > span { display: grid; width: 8mm; height: 8mm; place-items: center; border-radius: 50%; color: #fff; font-weight: 900; }
    .status small, .status strong { display: block; }
    .status strong { margin-top: .5mm; font-size: 8pt; }
    .status.clear { border-color: #9bd8c2; background: #eefaf5; color: ${BRAND.success}; }
    .status.clear > span { background: ${BRAND.success}; }
    .status.fault { border-color: #edb8be; background: #fff3f4; color: ${BRAND.danger}; }
    .status.fault > span { background: ${BRAND.danger}; }
    .evidence-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 5mm; }
    .evidence-image { min-width: 0; margin: 0; overflow: hidden; border: 1px solid ${BRAND.line}; border-radius: 3mm; break-inside: avoid; }
    .image-frame { height: 49mm; background: ${BRAND.navy}; }
    .continuation-page .image-frame { height: 76mm; }
    .image-frame img { width: 100%; height: 100%; object-fit: contain; }
    figcaption { padding: 2mm 3mm 3mm; background: ${BRAND.navy}; color: #fff; font-size: 7pt; font-weight: 700; overflow-wrap: anywhere; }
    figcaption div { display: flex; justify-content: space-between; gap: 3mm; }
    figcaption span { color: ${BRAND.amber}; }
    figcaption p { margin: 2mm 0 0; color: #fff; font-size: 6.5pt; font-weight: 500; line-height: 1.3; white-space: pre-line; }
    .empty-evidence { display: grid; height: 55mm; margin-bottom: 5mm; place-items: center; border: 1px dashed ${BRAND.line}; border-radius: 3mm; background: ${BRAND.canvas}; color: ${BRAND.muted}; font-size: 8pt; }
    .fault-summary { display: grid; grid-template-columns: repeat(3, 1fr); margin-bottom: 4mm; border: 1px solid #edb8be; border-radius: 3mm; overflow: hidden; }
    .fault-summary div { padding: 3mm 4mm; border-right: 1px solid #edb8be; background: #fff7f8; }
    .fault-summary div:last-child { border-right: 0; }
    .fault-summary strong { display: block; margin-top: 1mm; color: ${BRAND.danger}; font-size: 10pt; }
    .narrative { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
    .narrative article { padding: 4mm; border: 1px solid ${BRAND.line}; border-radius: 3mm; break-inside: avoid; }
    .narrative h3 { margin: 0 0 2mm; color: ${BRAND.navy}; font-size: 8pt; letter-spacing: .06em; }
    .narrative p { margin: 0; font-size: 8pt; white-space: pre-line; }
    .fault-copy article:first-child { grid-column: 1 / -1; border-left: 3px solid ${BRAND.danger}; }
    .fault-copy .recommendation { border-left: 3px solid ${BRAND.amber}; background: #fffaf0; }
    .clear-assessment { display: flex; align-items: center; gap: 4mm; margin: 0 0 4mm; padding: 5mm; border: 1px solid #9bd8c2; border-radius: 3mm; background: #eefaf5; }
    .clear-assessment > span { display: grid; width: 11mm; height: 11mm; flex: 0 0 auto; place-items: center; border-radius: 50%; background: ${BRAND.success}; color: #fff; font-size: 15pt; }
    .clear-assessment h3 { margin: 0 0 1mm; color: ${BRAND.success}; font-size: 10pt; }
    .clear-assessment p { margin: 0; font-size: 8pt; }
    .continuation-note { padding: 3mm 4mm; border-left: 3px solid ${BRAND.blue}; background: ${BRAND.blueTint}; color: ${BRAND.navy}; font-size: 7pt; font-weight: 700; letter-spacing: .08em; }
    .engineer-signoff { position: absolute; left: 15mm; right: 15mm; bottom: 13mm; display: flex; align-items: baseline; gap: 3mm; padding-top: 3mm; border-top: 1px solid ${BRAND.line}; }
    .engineer-signoff strong { margin-right: auto; font-size: 8pt; }
    .report-footer { position: absolute; left: 15mm; right: 15mm; bottom: 5mm; display: flex; justify-content: space-between; gap: 5mm; color: ${BRAND.muted}; font-size: 6.5pt; }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      html, body { width: 210mm; background: #fff; }
      .screen-note { display: none; }
      .report-page { width: 210mm; height: 297mm; min-height: 0; max-height: 297mm; margin: 0; box-shadow: none; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
    @media screen and (max-width: 850px) {
      .screen-note, .report-page { width: 100%; margin: 0; }
      .report-page { min-height: auto; padding: 24px 20px 64px; }
      .cover-grid, .client-panel, .narrative { grid-template-columns: 1fr; }
      .declaration { grid-column: auto; }
      .report-footer, .engineer-signoff { position: static; margin-top: 24px; }
    }
  </style>
</head>
<body>
  <div class="screen-note">A4 PRINT PREVIEW · USE THE DOWNLOAD PDF ACTION IN OHMAUDIT FOR THE CLIENT COPY</div>
  <section class="report-page cover-page">
    <div class="brand-row">
      ${logo(payload)}
      <div class="brand-meta"><small>PREPARED BY</small><strong>${text(payload.organisationName)}</strong></div>
    </div>
    <div class="cover-title">
      <p class="eyebrow">ELECTRICAL COMPLIANCE REPORT</p>
      <h1>THERMAL IMAGING REPORT</h1>
      <p>A STRUCTURED RECORD OF THE THERMAL IMAGING SURVEY, OBSERVATIONS AND RECOMMENDED ACTIONS.</p>
    </div>
    <div class="client-panel">
      <div><small>PREPARED FOR</small><h2>${text(payload.customerName)}</h2><p>${text(payload.siteName)}\n${payload.siteAddress.map((line) => text(line)).join('\n')}</p></div>
      <div class="report-identifiers">
        <div><span>REPORT DATE</span><strong>${text(payload.reportDate)}</strong></div>
        <div><span>REPORT REF</span><strong>${text(payload.reportReference)}</strong></div>
        <div><span>ENGINEER</span><strong>${text(payload.engineerName)}</strong></div>
      </div>
    </div>
    <div class="metrics">
      <div class="metric"><span>TARGET ITEMS</span><strong>${payload.targets.length}</strong></div>
      <div class="metric"><span>NO ISSUES</span><strong>${noIssueCount}</strong></div>
      <div class="metric"><span>FAULTS</span><strong>${faultCount}</strong></div>
      <div class="metric outcome ${outcomeClass}"><span>OVERALL OUTCOME</span><strong>${text(payload.outcome, faultCount > 0 ? 'ACTION REQUIRED' : 'SATISFACTORY')}</strong></div>
    </div>
    <div class="cover-grid">
      <section class="report-card">
        <h2>INSPECTION DETAILS</h2>
        <dl class="details-list">
          ${detail('SCOPE', details?.scope, 'wide')}
          ${detail('PURPOSE', details?.purpose, 'wide')}
          ${detail('METHOD', details?.inspectionMethod, 'wide')}
          ${detail('AREAS INSPECTED', details?.areasInspected)}
          ${detail('AREAS EXCLUDED', details?.areasExcluded)}
          ${detail('LIMITATIONS', details?.limitations, 'wide')}
        </dl>
      </section>
      <section class="report-card">
        <h2>SURVEY CONDITIONS &amp; EQUIPMENT</h2>
        <dl class="details-list">
          ${detail('EQUIPMENT', details?.equipment, 'wide')}
          ${detail('LOAD CONDITION', details?.loadCondition)}
          ${detail('ENVIRONMENT', details?.environmentalConditions)}
          ${detail('AMBIENT TEMPERATURE', details?.ambientTemperatureC ? `${details.ambientTemperatureC} °C` : undefined)}
          ${detail('REFLECTED TEMPERATURE', details?.reflectedTemperatureC ? `${details.reflectedTemperatureC} °C` : undefined)}
          ${detail('EMISSIVITY', details?.emissivity)}
          ${detail('CLIENT REPRESENTATIVE', details?.clientRepresentative)}
          ${detail('ADDITIONAL NOTES', details?.additionalNotes, 'wide')}
        </dl>
      </section>
      <div class="declaration"><strong>REPORT INTERPRETATION</strong>THIS REPORT RECORDS CONDITIONS OBSERVED AT THE TIME OF THE SURVEY. THERMAL PATTERNS CAN CHANGE WITH LOAD, AMBIENT CONDITIONS AND EQUIPMENT OPERATION. RECOMMENDATIONS SHOULD BE REVIEWED BY A COMPETENT PERSON BEFORE REMEDIAL WORK.</div>
    </div>
    ${footer(payload.reportReference, 1, totalPages)}
  </section>
  ${(() => {
    let page = 2;
    return payload.targets
      .flatMap((target, targetIndex) =>
        thermalImagePageGroups(target.images).map(({ offset, images }, groupIndex) =>
          targetPage(
            target,
            targetIndex,
            payload,
            images as Array<ThermalCertificatePayload['targets'][number]['images'][number]>,
            offset,
            groupIndex > 0,
            page++,
            totalPages,
          ),
        ),
      )
      .join('\n');
  })()}
</body>
</html>`;
}
