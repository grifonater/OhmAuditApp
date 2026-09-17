import { renderEvCertificateHtml } from './ev-certificate-html';
import type {
  CertificatePayload,
  ReportImagePayload,
  VisitReportFinding,
  VisitReportPayload,
} from './index';
import { renderThermalReportHtml } from './thermal-report-html';

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function text(value: string | undefined, fallback = 'Not recorded'): string {
  return escapeHtml(value?.trim() || fallback);
}

function imageSource(image: ReportImagePayload | undefined): string | undefined {
  if (
    image === undefined ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) ||
    !/^[A-Za-z0-9+/\r\n]+={0,2}$/u.test(image.base64)
  )
    return undefined;
  return `data:${image.mimeType};base64,${image.base64.replaceAll(/\s/gu, '')}`;
}

function jpegSource(base64: string | undefined): string | undefined {
  return base64 === undefined ? undefined : imageSource({ base64, mimeType: 'image/jpeg' });
}

function documentParts(html: string): { styles: string; body: string } {
  return {
    styles: /<style>([\s\S]*?)<\/style>/iu.exec(html)?.[1] ?? '',
    body: /<body[^>]*>([\s\S]*?)<\/body>/iu.exec(html)?.[1] ?? '',
  };
}

function categoryClass(category: string): string {
  const value = category.toLocaleLowerCase('en-GB');
  return ['fault', 'advice', 'condition', 'note'].includes(value) ? value : 'note';
}

function findingCard(finding: VisitReportFinding, compact: boolean): string {
  const source = imageSource(finding.images[0]);
  return `<article class="visit-finding${source ? ' has-image' : ''}${compact ? ' compact' : ''}">
    ${source ? `<div class="visit-finding-image"><img src="${source}" alt="${text(finding.images[0]?.caption, finding.title)}"></div>` : ''}
    <div class="visit-finding-body">
      <div class="visit-finding-top"><span class="visit-badge ${categoryClass(finding.category)}">${text(finding.category, 'Note')}</span><span>${text(finding.status, '')}</span></div>
      <h3>${text(finding.title)}</h3>
      <p>${text(finding.description, 'No description recorded.')}</p>
      ${
        finding.assetName || finding.inspectionType
          ? `<div class="visit-finding-meta">${[
              finding.assetName,
              finding.inspectionType,
              finding.severity,
            ]
              .filter(Boolean)
              .map((value) => `<span>${text(value)}</span>`)
              .join('')}</div>`
          : ''
      }
      ${finding.images[0]?.caption ? `<div class="visit-caption">${text(finding.images[0].caption)}</div>` : ''}
    </div>
  </article>`;
}

function findingEvidencePages(
  findings: readonly VisitReportFinding[],
  payload: VisitReportPayload,
  reportReference: string,
): string {
  const evidence = findings.flatMap((finding) =>
    finding.images.slice(1).map((image, index) => ({
      finding,
      image,
      imageNumber: index + 2,
      totalImages: finding.images.length,
    })),
  );
  const pages: string[] = [];
  for (let offset = 0; offset < evidence.length; offset += 4) {
    const group = evidence.slice(offset, offset + 4);
    pages.push(`<section class="visit-page visit-evidence-page">
      <header class="visit-continuation-header"><div><div class="visit-eyebrow">Inspection report</div><h1>Observation Evidence</h1></div><div class="visit-header-meta">${text(payload.customerName)}<br>${text(payload.siteName)}<br>Report Ref: ${text(reportReference)}</div></header>
      <div class="visit-evidence-grid">${group
        .map(({ finding, image, imageNumber, totalImages }) => {
          const source = imageSource(image);
          return source === undefined
            ? ''
            : `<figure class="visit-evidence"><div class="visit-evidence-image"><img src="${source}" alt="${text(image.caption, finding.title)}"></div><figcaption><strong>${text(finding.title)}</strong><span>Image ${imageNumber} of ${totalImages}</span><p>${text(image.caption, 'Supporting inspection evidence')}</p></figcaption></figure>`;
        })
        .join('')}</div>
      <div class="visit-footer"><span>Report Ref: ${text(reportReference)}</span><span>Observation Evidence</span><span>Continuation ${Math.floor(offset / 4) + 1}</span></div>
    </section>`);
  }
  return pages.join('');
}

function genericCertificate(certificate: CertificatePayload): string {
  return `<section class="visit-page generic-certificate">
    <header class="visit-continuation-header"><div><div class="visit-eyebrow">Inspection certificate</div><h1>${text(certificate.title)}</h1></div><div class="visit-header-meta">${text(certificate.assetName, certificate.inspectionType)}<br>${text(certificate.effectiveDate)}</div></header>
    <div class="generic-result ${certificate.outcome.toLocaleUpperCase('en-GB') === 'PASS' ? 'pass' : ''}">${text(certificate.outcome.replaceAll('_', ' '))}</div>
    <div class="generic-grid">
      <div><span>Customer</span><strong>${text(certificate.customerName)}</strong></div><div><span>Site</span><strong>${text(certificate.siteName)}</strong></div>
      <div><span>Inspection</span><strong>${text(certificate.inspectionType)}</strong></div><div><span>Engineer</span><strong>${text(certificate.engineerName)}</strong></div>
      <div><span>Effective date</span><strong>${text(certificate.effectiveDate)}</strong></div><div><span>Revision</span><strong>${certificate.revisionNumber}</strong></div>
    </div>
    <section class="generic-summary"><h2>Inspection summary</h2>${certificate.summaryLines.length ? `<ul>${certificate.summaryLines.map((line) => `<li>${text(line)}</li>`).join('')}</ul>` : '<p>No additional summary information was recorded.</p>'}</section>
    <div class="visit-footer"><span>${text(certificate.organisationName)}</span><span>${text(certificate.assetName, certificate.inspectionType)}</span><span>Certificate</span></div>
  </section>`;
}

function renderedCertificates(payload: VisitReportPayload): { styles: string; body: string } {
  const styles = new Set<string>();
  const documents = payload.certificates.map((certificate) => {
    if (certificate.evCertificate !== undefined) {
      const parts = documentParts(
        renderEvCertificateHtml({
          ...certificate.evCertificate,
          ...(certificate.draft === undefined ? {} : { draft: certificate.draft }),
        }),
      );
      styles.add(parts.styles);
      return `<div class="certificate-document ev-document">${parts.body}</div>`;
    }
    if (certificate.thermalCertificate !== undefined) {
      const parts = documentParts(
        renderThermalReportHtml({
          ...certificate.thermalCertificate,
          ...(certificate.draft === undefined ? {} : { draft: certificate.draft }),
        }),
      );
      styles.add(parts.styles);
      return `<div class="certificate-document thermal-document">${parts.body}</div>`;
    }
    return `<div class="certificate-document generic-document">${genericCertificate(certificate)}</div>`;
  });
  return { styles: [...styles].join('\n'), body: documents.join('\n') };
}

export function renderVisitReportHtml(payload: VisitReportPayload): string {
  const findings = payload.findings ?? [];
  const coverFindingCount = findings.some((finding) => finding.images.length > 0) ? 2 : 3;
  const coverFindings = findings.slice(0, coverFindingCount);
  const remainingFindings = findings.slice(coverFindingCount);
  const findingGroups: VisitReportFinding[][] = [];
  for (let offset = 0; offset < remainingFindings.length; offset += 4)
    findingGroups.push(remainingFindings.slice(offset, offset + 4));

  const passed = payload.certificates.filter(
    ({ outcome }) => outcome.toLocaleUpperCase('en-GB') === 'PASS',
  ).length;
  const failed = payload.certificates.filter(({ outcome }) =>
    ['FAIL', 'FAILED', 'UNSATISFACTORY'].includes(outcome.toLocaleUpperCase('en-GB')),
  ).length;
  const incomplete = Math.max(0, payload.certificates.length - passed - failed);
  const engineers = [
    ...new Set(
      payload.certificates
        .map(({ engineerName, evCertificate, thermalCertificate }) =>
          (evCertificate?.engineerName ?? thermalCertificate?.engineerName ?? engineerName).trim(),
        )
        .filter(Boolean),
    ),
  ];
  const reportReference =
    payload.certificates
      .map(
        ({ evCertificate, thermalCertificate }) =>
          evCertificate?.certificateReference ?? thermalCertificate?.reportReference,
      )
      .find(Boolean) ?? payload.visitDate;
  const firstEv = payload.certificates.find(
    ({ evCertificate }) => evCertificate !== undefined,
  )?.evCertificate;
  const heroSource = imageSource(payload.heroImage);
  const companyLogo = imageSource(payload.logoImage);
  const customerLogo =
    imageSource(firstEv?.testingLocation.logoImage) ??
    jpegSource(firstEv?.testingLocation.logoJpegBase64);
  const certificateDocuments = renderedCertificates(payload);

  const continuationPages = findingGroups
    .map(
      (group, index) => `<section class="visit-page visit-findings-page">
        <header class="visit-continuation-header"><div><div class="visit-eyebrow">Inspection report</div><h1>General Installation Observations</h1></div><div class="visit-header-meta">${text(payload.customerName)}<br>${text(payload.siteName)}<br>Report Ref: ${text(reportReference)}</div></header>
        <div class="visit-continuation-grid">${group.map((finding) => findingCard(finding, false)).join('')}</div>
        <div class="visit-footer"><span>Report Ref: ${text(reportReference)}</span><span>General Installation Observations</span><span>Continuation ${index + 1}</span></div>
      </section>`,
    )
    .join('');
  const evidencePages = findingEvidencePages(findings, payload, reportReference);

  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${text(payload.title)}</title><style>${certificateDocuments.styles}\n${STYLES}</style></head><body>
    <section class="visit-page visit-cover">
      <header class="visit-cover-header"><div class="visit-company">${companyLogo ? `<div class="visit-logo"><img src="${companyLogo}" alt="${text(payload.organisationName)} logo"></div>` : ''}<div><div class="visit-eyebrow">Testing company</div><div class="visit-company-name">${text(payload.organisationName)}</div></div></div>${customerLogo ? `<div class="visit-customer-logo"><img src="${customerLogo}" alt="${text(payload.customerName)} logo"></div>` : ''}</header>
      <section class="visit-hero${heroSource ? ' has-image' : ''}">${heroSource ? `<img src="${heroSource}" alt="Site inspection" class="visit-hero-image"><div class="visit-hero-shade"></div>` : ''}<div class="visit-hero-content"><div class="visit-hero-kicker">EV charge point inspection</div><h1>${text(payload.title, 'Inspection Report & Certificate Pack')}</h1><div class="visit-site-name">${text(payload.customerName)}</div><div class="visit-site-address">${text(payload.siteName)}</div><div class="visit-reference">Report Ref: ${text(reportReference)}</div></div></section>
      <section class="visit-details"><div><span>Inspection date</span><strong>${text(payload.visitDate)}</strong></div><div><span>Engineer</span><strong>${text(engineers.join(', '))}</strong></div><div><span>Customer</span><strong>${text(payload.customerName)}</strong></div><div><span>Site / location</span><strong>${text(payload.siteName)}</strong></div><div><span>Certificates</span><strong>${payload.certificates.length}</strong></div><div><span>Report reference</span><strong>${text(reportReference)}</strong></div></section>
      <section class="visit-section"><div class="visit-section-title"><h2>Inspection summary</h2><span>${payload.certificates.length} individual certificate(s) included</span></div><div class="visit-metrics"><div class="total"><strong>${payload.certificates.length}</strong><span>Units inspected</span></div><div class="pass"><strong>${passed}</strong><span>Passed</span></div><div class="fail"><strong>${failed}</strong><span>Failed</span></div><div class="incomplete"><strong>${incomplete}</strong><span>Not tested / incomplete</span></div></div></section>
      <section class="visit-section visit-cover-findings"><div class="visit-section-title"><h2>General installation observations</h2><div class="visit-legend"><span class="visit-badge fault">Fault</span><span class="visit-badge advice">Advice</span><span class="visit-badge condition">Condition</span><span class="visit-badge note">Note</span></div></div><div class="visit-cover-finding-list">${coverFindings.length ? coverFindings.map((finding) => findingCard(finding, true)).join('') : '<div class="visit-empty">No general installation findings or observations were recorded.</div>'}</div>${remainingFindings.length ? `<div class="visit-more">${remainingFindings.length} additional observation(s) continue before the individual certificates.</div>` : ''}</section>
      <div class="visit-pack-note"><div><strong>Certificate pack</strong><span>This cover provides the site-level summary. Individual inspection certificates follow.</span></div><div><strong>${payload.certificates.length} certificates</strong><span>${findings.length} observations recorded</span></div></div>
      <div class="visit-footer"><span>Report Ref: ${text(reportReference)}</span><span>Inspection Report &amp; Certificate Pack</span><span>Cover</span></div>
    </section>${continuationPages}${evidencePages}${certificateDocuments.body}
  </body></html>`;
}

const STYLES = String.raw`
:root{--visit-brand:#0c2c43;--visit-accent:#ffb000;--visit-ink:#1d2733;--visit-muted:#687684;--visit-line:#d8e0e7;--visit-soft:#f5f7f9;--visit-success:#16824a;--visit-danger:#b42318;--visit-advice:#8a5b00;--visit-condition:#175cd3}
@page{size:A4;margin:0}.visit-page{box-sizing:border-box;width:210mm;height:297mm;margin:12mm auto;padding:13mm 14mm;background:#fff;color:var(--visit-ink);font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:11px;line-height:1.35;position:relative;overflow:hidden;break-after:page;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}.visit-page *{box-sizing:border-box}.visit-cover-header{display:flex;justify-content:space-between;align-items:flex-start;min-height:21mm;padding-bottom:6mm;border-bottom:2px solid var(--visit-brand)}.visit-company{display:flex;align-items:center;gap:10px}.visit-logo,.visit-customer-logo{width:35mm;height:18mm;border:1px solid var(--visit-line);border-radius:6px;background:#fff;overflow:hidden}.visit-customer-logo{width:38mm;height:21mm}.visit-logo img,.visit-customer-logo img{width:100%;height:100%;padding:2mm;object-fit:contain}.visit-eyebrow{color:var(--visit-muted);font-size:7.4px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.visit-company-name{margin-top:2px;color:var(--visit-brand);font-size:12.5px;font-weight:900}.visit-hero{height:59mm;margin-top:6mm;border-radius:10px;overflow:hidden;background:var(--visit-brand);color:#fff;position:relative}.visit-hero-image{position:absolute;inset:0 0 0 34%;width:66%;height:100%;object-fit:cover}.visit-hero-shade{position:absolute;inset:0;background:linear-gradient(100deg,rgba(12,44,67,1) 0%,rgba(12,44,67,.98) 43%,rgba(12,44,67,.78) 65%,rgba(12,44,67,.18) 100%)}.visit-hero-content{position:relative;width:69%;padding:9mm 10mm}.visit-hero-kicker{color:#d8e2e9;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.13em}.visit-hero h1{max-width:none;margin:3px 0 0;color:#fff;font-size:23px;line-height:1.04;letter-spacing:-.025em}.visit-site-name{margin-top:6px;font-size:12.5px;font-weight:800}.visit-site-address{color:#d8e2e9;font-size:9px}.visit-reference{display:inline-block;margin-top:7px;padding:4px 8px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(255,255,255,.08);font-size:8px;font-weight:800}.visit-details{display:grid;grid-template-columns:repeat(3,1fr);margin-top:4mm;border:1px solid var(--visit-line);border-radius:8px;overflow:hidden}.visit-details div{min-height:13mm;padding:6px 9px;border-right:1px solid var(--visit-line);border-bottom:1px solid var(--visit-line)}.visit-details div:nth-child(3n){border-right:0}.visit-details div:nth-last-child(-n+3){border-bottom:0}.visit-details span,.generic-grid span{display:block;color:var(--visit-muted);font-size:7px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.visit-details strong{display:block;margin-top:2px;font-size:9.5px}.visit-section{margin-top:4mm}.visit-section-title{display:flex;align-items:flex-end;justify-content:space-between;gap:5mm;margin-bottom:2mm;padding-bottom:1.5mm;border-bottom:1px solid #bdc8d2}.visit-section-title h2{margin:0;color:var(--visit-brand);font-size:10px;text-transform:uppercase;letter-spacing:.06em}.visit-section-title>span{color:var(--visit-muted);font-size:8px}.visit-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm}.visit-metrics>div{padding:6px 9px;border:1px solid var(--visit-line);border-left:4px solid var(--visit-brand);border-radius:7px}.visit-metrics .pass{border-left-color:var(--visit-success)}.visit-metrics .fail{border-left-color:var(--visit-danger)}.visit-metrics .incomplete{border-left-color:#98a2b3}.visit-metrics strong{display:block;color:var(--visit-brand);font-size:18px;line-height:1}.visit-metrics .pass strong{color:var(--visit-success)}.visit-metrics .fail strong{color:var(--visit-danger)}.visit-metrics span{color:var(--visit-muted);font-size:7px;font-weight:900;text-transform:uppercase}.visit-legend{display:flex;gap:4px}.visit-badge{display:inline-block;padding:3px 7px;border-radius:999px;font-size:7px;font-weight:900}.visit-badge.fault{background:#fef3f2;color:var(--visit-danger)}.visit-badge.advice{background:#fff7e5;color:var(--visit-advice)}.visit-badge.condition{background:#eff6ff;color:var(--visit-condition)}.visit-badge.note{background:#f2f4f7;color:#475467}.visit-cover-finding-list{display:grid;gap:2mm}.visit-finding{display:grid;grid-template-columns:1fr;border:1px solid var(--visit-line);border-radius:8px;overflow:hidden;background:#fff;break-inside:avoid}.visit-finding.has-image{grid-template-columns:31mm 1fr}.visit-finding-image{height:100%;min-height:28mm;background:#eef2f5}.visit-finding-image img{width:100%;height:100%;object-fit:cover}.visit-finding-body{padding:7px 9px}.visit-finding-top{display:flex;justify-content:space-between;align-items:center;color:var(--visit-muted);font-size:7px;font-weight:800}.visit-finding h3{margin:4px 0 2px;font-size:9.4px}.visit-finding p{margin:0;color:#44515e;font-size:8px;line-height:1.35;white-space:pre-wrap}.visit-finding.compact p{display:-webkit-box;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical}.visit-finding-meta{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}.visit-finding-meta span{padding:2px 5px;border-radius:3px;background:var(--visit-soft);color:var(--visit-muted);font-size:6.8px}.visit-caption{margin-top:4px;color:var(--visit-muted);font-size:7px;font-style:italic}.visit-empty,.visit-more{padding:8px 10px;border:1px dashed #cad4de;border-radius:7px;background:#fbfcfd;color:var(--visit-muted);font-size:8px;text-align:center}.visit-more{margin-top:2mm;border-style:solid}.visit-pack-note{position:absolute;left:14mm;right:14mm;bottom:14mm;display:flex;align-items:center;justify-content:space-between;padding:7px 9px;border:1px solid var(--visit-line);border-radius:7px;background:#f8fafb}.visit-pack-note>div:last-child{text-align:right}.visit-pack-note strong,.visit-pack-note span{display:block}.visit-pack-note strong{color:var(--visit-brand);font-size:8.5px}.visit-pack-note span{color:var(--visit-muted);font-size:7.5px}.visit-footer{position:absolute;left:14mm;right:14mm;bottom:7mm;display:flex;justify-content:space-between;padding-top:4px;border-top:1px solid var(--visit-line);color:var(--visit-muted);font-size:7px}.visit-continuation-header{display:flex;align-items:flex-end;justify-content:space-between;gap:10mm;padding-bottom:6mm;border-bottom:2px solid var(--visit-brand)}.visit-continuation-header h1{max-width:none;margin:2px 0 0;color:var(--visit-brand);font-size:18px}.visit-header-meta{text-align:right;color:var(--visit-muted);font-size:8px}.visit-continuation-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:5mm}.visit-continuation-grid .visit-finding.has-image{display:block}.visit-continuation-grid .visit-finding-image{height:48mm}.visit-continuation-grid .visit-finding p{font-size:8.5px}.generic-result{margin-top:9mm;padding:6mm;border:2px solid var(--visit-danger);border-radius:8px;background:#fef3f2;color:var(--visit-danger);font-size:23px;font-weight:900;text-align:center}.generic-result.pass{border-color:var(--visit-success);background:#eaf7ef;color:var(--visit-success)}.generic-grid{display:grid;grid-template-columns:1fr 1fr;margin-top:7mm;border:1px solid var(--visit-line);border-radius:8px;overflow:hidden}.generic-grid>div{min-height:18mm;padding:4mm;border-right:1px solid var(--visit-line);border-bottom:1px solid var(--visit-line)}.generic-grid>div:nth-child(2n){border-right:0}.generic-grid>div:nth-last-child(-n+2){border-bottom:0}.generic-grid strong{display:block;margin-top:1mm}.generic-summary{margin-top:8mm;padding:5mm;border:1px solid var(--visit-line);border-radius:8px}.generic-summary h2{margin:0 0 3mm;color:var(--visit-brand);font-size:12px}.generic-summary li{margin-bottom:2mm}.certificate-document{break-before:page;page-break-before:always}.certificate-document>.page:first-child,.certificate-document>.report-page:first-of-type{break-before:auto;page-break-before:auto}.certificate-document>.page:last-child,.certificate-document>.report-page:last-of-type{break-after:page!important;page-break-after:always!important}.certificate-document:last-child>.page:last-child,.certificate-document:last-child>.report-page:last-of-type,.certificate-document:last-child>.visit-page:last-child{break-after:auto!important;page-break-after:auto!important}.thermal-document .screen-note{display:none}
.visit-evidence-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:6mm}.visit-evidence{margin:0;border:1px solid var(--visit-line);border-radius:8px;overflow:hidden;background:#fff;break-inside:avoid}.visit-evidence-image{height:76mm;background:#eef2f5}.visit-evidence-image img{display:block;width:100%;height:100%;object-fit:contain;background:#fff}.visit-evidence figcaption{padding:7px 9px;background:#f7f9fb;color:var(--visit-ink)}.visit-evidence figcaption strong,.visit-evidence figcaption span{display:block}.visit-evidence figcaption strong{color:var(--visit-brand);font-size:9px}.visit-evidence figcaption span{color:var(--visit-muted);font-size:7px}.visit-evidence figcaption p{margin:3px 0 0;color:var(--visit-muted);font-size:7.5px}
@media print{html,body{margin:0;background:#fff}.visit-page{margin:0}.visit-page,.certificate-document>.page,.certificate-document>.report-page{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
