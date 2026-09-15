import type { EvCertificatePayload, ReportImagePayload } from './index';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function text(value: string | undefined, fallback = 'Not recorded'): string {
  const normalised = value?.trim();
  return escapeHtml(normalised || fallback);
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

function logo(
  image: ReportImagePayload | undefined,
  jpegBase64: string | undefined,
  name: string,
  className: string,
): string {
  const source = imageSource(image) ?? jpegSource(jpegBase64);
  return source === undefined
    ? `<div class="${className} is-empty">${escapeHtml(name)}<br>LOGO</div>`
    : `<div class="${className}"><img src="${source}" alt="${escapeHtml(name)} logo"></div>`;
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? text(value)
    : new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
}

function badgeClass(category: string): string {
  const categoryKey = category.toLocaleLowerCase('en-GB');
  return ['fault', 'advice', 'condition', 'note'].includes(categoryKey) ? categoryKey : 'note';
}

function statusClass(value: string): string {
  return value.toLocaleUpperCase('en-GB') === 'PASS' ? 'pass' : 'fail';
}

function status(value: string): string {
  const label = text(value.replaceAll('_', ' '));
  return `<span class="status ${statusClass(value)}">${label}</span>`;
}

function footer(reference: string, label: string, page: number, pages: number): string {
  return `<div class="footer"><span>Certificate Ref: ${text(reference)}</span><span>${escapeHtml(label)}</span><span>Page ${page} of ${pages}</span></div>`;
}

function continuedHeader(payload: EvCertificatePayload, eyebrow: string, title: string): string {
  return `<header class="header compact">
    <div><div class="eyebrow">${escapeHtml(eyebrow)}</div><div class="company-name">${escapeHtml(title)}</div><div class="small-lines">Certificate Ref: ${text(payload.certificateReference)}</div></div>
    <div class="align-right"><div class="eyebrow">Charge point</div><div class="site-name">${text(payload.charger.name)}</div><div class="small-lines">${text(payload.testingLocation.name)}</div></div>
  </header>`;
}

function connectorCard(
  connector: EvCertificatePayload['connectors'][number],
  index: number,
): string {
  const checks = [
    ['PE pre-test', connector.pePreTest],
    ['CP error', connector.cpError],
    ['PE error', connector.peError],
    ['CP states', connector.cpStates],
  ];
  return `<div class="connector-card">
    <div class="connector-head"><strong>${text(connector.label, `Connector ${index + 1}`)} · ${text(connector.connectorType)}</strong><span>Fed from supply no. ${text(connector.supplyNumbers, '-')}</span></div>
    <div class="connector-body">
      <div class="label result-label">RCD trip times</div>
      <div class="test-grid">
        <div class="test-item"><div class="label">1× at 0°</div><div class="value">${text(connector.rcd1x0Ms, '-')} ms</div></div>
        <div class="test-item"><div class="label">1× at 180°</div><div class="value">${text(connector.rcd1x180Ms, '-')} ms</div></div>
        <div class="test-item"><div class="label">5× at 0°</div><div class="value">${text(connector.rcd5x0Ms, '-')} ms</div></div>
        <div class="test-item"><div class="label">5× at 180°</div><div class="value">${text(connector.rcd5x180Ms, '-')} ms</div></div>
      </div>
      <div class="label result-label">Functional checks</div>
      <div class="checks">${checks.map(([label, value]) => `<div class="check"><div class="label">${label}</div>${status(value!)}</div>`).join('')}</div>
      <div class="label result-label">DC protection</div>
      <div class="dc-box">
        <div><div class="label">Protection type</div><div class="value">${text(connector.dcRcdType)}</div></div>
        <div><div class="label">Ramp 0°</div><div class="value">${text(connector.dcRamp0Ma, '-')} mA</div></div>
        <div><div class="label">Ramp 180°</div><div class="value">${text(connector.dcRamp180Ma, '-')} mA</div></div>
      </div>
    </div>
  </div>`;
}

function observationCard(observation: EvCertificatePayload['observations'][number]): string {
  const category = observation.category || 'NOTE';
  const className = badgeClass(category);
  return `<div class="observation-card">
    <div class="observation-type"><div class="label">Type</div><span class="badge ${className}">${text(category)}</span></div>
    <div><div class="heading">${text(observation.title)}</div><div class="text">${text(observation.description, 'No description recorded.')}</div>
    ${observation.severity ? `<div class="observation-meta"><div><div class="label">Severity</div><strong>${text(observation.severity)}</strong></div><div><div class="label">Status</div><strong>${text(observation.status)}</strong></div></div>` : ''}</div>
  </div>`;
}

function photoCard(photo: EvCertificatePayload['photos'][number], index: number): string {
  const source = imageSource(photo);
  if (source === undefined) return '';
  return `<figure class="photo-card">
    <div class="photo-title">${text(photo.title, `Inspection image ${index + 1}`)}</div>
    <div class="gallery-frame"><img src="${source}" alt="${text(photo.title, `Inspection image ${index + 1}`)}"></div>
    <figcaption class="photo-caption">${text(photo.caption, 'Supporting inspection evidence')}</figcaption>
  </figure>`;
}

export function renderEvCertificateHtml(payload: EvCertificatePayload): string {
  const firstConnector = payload.connectors[0];
  const connectorContinuationGroups: EvCertificatePayload['connectors'][] = [];
  for (let offset = 1; offset < payload.connectors.length; offset += 2)
    connectorContinuationGroups.push(payload.connectors.slice(offset, offset + 2));

  const observations = payload.observations ?? [];
  const observationGroups: EvCertificatePayload['observations'][] = [];
  for (let offset = 0; offset < Math.max(1, observations.length); offset += 4)
    observationGroups.push(observations.slice(offset, offset + 4));

  const photos = (payload.photos ?? []).filter((photo) => imageSource(photo) !== undefined);
  const photoGroups: EvCertificatePayload['photos'][] = [];
  for (let offset = 0; offset < Math.max(1, photos.length); offset += 4)
    photoGroups.push(photos.slice(offset, offset + 4));

  const totalPages =
    1 + connectorContinuationGroups.length + observationGroups.length + photoGroups.length;
  let page = 1;
  const draft = payload.draft ? '<div class="draft-ribbon">Draft · Not Issued</div>' : '';
  const companyLogo = logo(
    payload.testingCompany.logoImage,
    payload.testingCompany.logoJpegBase64,
    'Testing company',
    'logo-box',
  );
  const customerLogo = logo(
    payload.testingLocation.logoImage,
    payload.testingLocation.logoJpegBase64,
    'Customer',
    'customer-logo',
  );
  const chargerPhoto = jpegSource(payload.charger.photoJpegBase64);
  const supplyRows = payload.supplies.length
    ? payload.supplies
        .map(
          (supply, index) =>
            `<tr><td>${index + 1}</td><td><strong>${text(supply.label)}</strong></td><td>${text(supply.phaseCount, '-')}</td><td>${text(supply.breaker, '-')}</td><td>${text(supply.earthingArrangement, '-')}</td><td>${text(supply.zsOhms, '-')}</td><td>${text(supply.maximumPfcKa, '-')}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="7" class="muted align-center">No supplies recorded</td></tr>';

  const pages: string[] = [];
  pages.push(`<section class="page">${draft}
    <header class="header">
      <div class="company">${companyLogo}<div><div class="eyebrow">Testing company</div><div class="company-name">${text(payload.testingCompany.name)}</div><div class="small-lines">${payload.testingCompany.addressLines.map((line) => text(line)).join('<br>')}${payload.testingCompany.addressLines.length ? '<br>' : ''}Registration No: ${text(payload.testingCompany.registrationNumber)}</div></div></div>
      <div><div class="eyebrow">Testing location</div><div class="site-name">${text(payload.testingLocation.name)}</div><div class="small-lines">${payload.testingLocation.addressLines.map((line) => text(line)).join('<br>')}</div></div>
      ${customerLogo}
    </header>
    <div class="certificate-title"><div><h1>EV Charge Point Test Certificate</h1><div class="subtitle">Electrical verification and RCD / DC protection performance record</div></div><div class="certificate-ref">Certificate reference<strong>${text(payload.certificateReference)}</strong></div></div>
    <div class="summary-strip"><div class="summary-cell"><div class="label">Charge point</div><div class="value">${text(payload.charger.name)}</div></div><div class="summary-cell"><div class="label">Manufacturer</div><div class="value">${text(payload.charger.make)}</div></div><div class="summary-cell"><div class="label">Rated output</div><div class="value">${text(payload.charger.powerOutputKw)}</div></div><div class="summary-cell"><div class="label">Date tested</div><div class="value">${dateLabel(payload.testDate)}</div></div></div>
    <section class="section"><div class="section-title"><h2><span class="section-index">1</span>Charge point details</h2><span class="pill">Location: ${text(payload.charger.location)}</span></div><div class="charger-grid">
      <figure class="primary-photo"><div class="photo-frame">${chargerPhoto ? `<img src="${chargerPhoto}" alt="${text(payload.charger.name)}">` : 'PRIMARY UNIT PHOTOGRAPH NOT PROVIDED'}</div><figcaption>${text(payload.charger.name)} · Main unit photograph</figcaption></figure>
      <div class="details-grid"><div class="field"><div class="label">Charge point name / ID</div><div class="value">${text(payload.charger.name)}</div></div><div class="field"><div class="label">Location on site</div><div class="value">${text(payload.charger.location)}</div></div><div class="field"><div class="label">Make</div><div class="value">${text(payload.charger.make)}</div></div><div class="field"><div class="label">Model</div><div class="value">${text(payload.charger.model)}</div></div><div class="field"><div class="label">Serial number</div><div class="value">${text(payload.charger.serialNumber)}</div></div><div class="field"><div class="label">Power output</div><div class="value">${text(payload.charger.powerOutputKw)}</div></div><div class="field full"><div class="label">Date of testing</div><div class="value">${text(payload.testDate)}</div></div></div>
    </div></section>
    <section class="section"><div class="section-title"><h2><span class="section-index">2</span>Supply details</h2></div><div class="table-wrap"><table><colgroup><col class="c-no"><col class="c-name"><col class="c-phase"><col class="c-protection"><col class="c-earthing"><col class="c-reading"><col class="c-reading"></colgroup><thead><tr><th>No.</th><th>Supply name</th><th>Phase</th><th>Protection</th><th>Earthing</th><th>Zs (Ω)</th><th>PFC (kA)</th></tr></thead><tbody>${supplyRows}</tbody></table></div></section>
    <section class="section"><div class="section-title"><h2><span class="section-index">3</span>Connector test results</h2></div>${firstConnector ? connectorCard(firstConnector, 0) : '<div class="empty-state">No connector test results recorded.</div>'}</section>
    ${footer(payload.certificateReference, 'EV Charge Point Test Certificate', page++, totalPages)}
  </section>`);

  let connectorOffset = 1;
  for (const group of connectorContinuationGroups) {
    pages.push(`<section class="page">${draft}${continuedHeader(payload, 'Test results continued', 'Connector Test Results')}
      <section class="section top-section"><div class="section-title"><h2><span class="section-index">3</span>Connector test results continued</h2></div>${group.map((connector, index) => connectorCard(connector, connectorOffset + index)).join('')}</section>
      ${footer(payload.certificateReference, 'Connector test results', page++, totalPages)}
    </section>`);
    connectorOffset += group.length;
  }

  for (const [groupIndex, group] of observationGroups.entries()) {
    const lastObservationPage = groupIndex === observationGroups.length - 1;
    pages.push(`<section class="page">${draft}${continuedHeader(payload, 'Certificate continued', 'EV Charge Point Test Certificate')}
      <section class="section top-section"><div class="section-title"><h2><span class="section-index">4</span>Overall result</h2></div><div class="result-box"><div class="result-pass ${statusClass(payload.outcome)}">${text(payload.outcome.replaceAll('_', ' '))}</div><div class="result-notes"><div class="label">Reason for failure</div><div class="value">${text(payload.reasonForFailure, 'Not applicable')}</div><div class="result-gap"></div><div class="label">Certificate status</div><div class="value">${payload.draft ? 'Draft · not issued' : 'Issued certificate'}</div></div></div></section>
      <section class="section observations"><div class="section-title"><h2><span class="section-index">5</span>Observations, faults, advice &amp; unit condition</h2><div class="observation-legend"><span class="badge fault">Fault</span><span class="badge advice">Advice</span><span class="badge condition">Condition</span><span class="badge note">Note</span></div></div><div class="observation-list">${group.length ? group.map(observationCard).join('') : '<div class="empty-state">No advice, faults, notes or unit conditions recorded.</div>'}</div></section>
      ${lastObservationPage ? `<section class="section signoff-section"><div class="section-title"><h2><span class="section-index">6</span>Engineer sign-off</h2></div><div class="signoff-grid"><div class="signature-box"><div class="label">Engineer name</div><div class="value signature-name">${text(payload.engineerName)}</div><div class="signature-space"></div><div class="label">Signature</div><div class="value">Typed electronic signature</div></div><div class="signature-box"><div class="label">Date of testing</div><div class="value signature-name">${text(payload.testDate)}</div><div class="signature-space"></div><div class="label">Overall result</div>${status(payload.outcome)}</div></div><div class="declaration">I certify that the electric vehicle charging equipment described in this certificate has been inspected and tested in accordance with the relevant requirements of BS 7671 and the equipment manufacturer's guidance, and that the results recorded are accurate at the time of testing.</div></section><section class="section notes-section"><div class="section-title"><h2>Additional certificate notes</h2></div><div class="notes-box">${text(payload.notes, 'No additional comments recorded.')}</div></section>` : ''}
      ${footer(payload.certificateReference, 'Observations & engineer sign-off', page++, totalPages)}
    </section>`);
  }

  let photoOffset = 0;
  for (const group of photoGroups) {
    pages.push(`<section class="page">${draft}${continuedHeader(payload, 'Supporting evidence', 'Inspection Photographs')}
      <div class="photo-intro"><div><h1>Unit photographs</h1><p>Supporting inspection images supplied with this certificate.</p></div><span class="pill">Photo evidence</span></div>
      ${group.length ? `<div class="photo-gallery">${group.map((photo, index) => photoCard(photo, photoOffset + index)).join('')}</div>` : '<div class="empty-state photo-empty">No supporting photographs were available for this inspection.</div>'}
      ${footer(payload.certificateReference, 'Inspection photographs', page++, totalPages)}
    </section>`);
    photoOffset += group.length;
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>EV Charge Point Test Certificate</title><style>${STYLES}</style></head><body>${pages.join('')}</body></html>`;
}

const STYLES = String.raw`
:root{--brand:#0c2c43;--accent:#ffb000;--ink:#1d2733;--muted:#697684;--line:#d8e0e7;--soft:#f5f7f9;--success:#16824a;--success-bg:#eaf7ef;--danger:#b42318;--danger-bg:#fef3f2;--advice:#8a5b00;--advice-bg:#fff7e5;--condition:#175cd3;--condition-bg:#eff6ff;--note:#475467;--note-bg:#f2f4f7}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#edf1f4;color:var(--ink)}body{font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:11px;line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:0}
.page{width:210mm;height:297mm;margin:12mm auto;background:#fff;padding:13mm 14mm;box-shadow:0 8px 28px rgba(20,35,50,.1);position:relative;overflow:hidden;page-break-after:always}.page:last-child{page-break-after:auto}.draft-ribbon{position:absolute;top:0;right:14mm;padding:4px 11px 5px;background:var(--danger-bg);color:var(--danger);border:1px solid #f3c7c4;border-top:none;border-radius:0 0 5px 5px;font-size:8px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}
.header{display:grid;grid-template-columns:1.1fr .95fr 38mm;gap:7mm;align-items:start;padding-bottom:7mm;border-bottom:2px solid var(--brand)}.header.compact{grid-template-columns:1fr 1fr;padding-bottom:6mm}.company{display:flex;gap:9px;align-items:flex-start}.logo-box,.customer-logo{border:1px solid var(--line);border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--muted);font-size:8px;font-weight:800;overflow:hidden}.logo-box{width:35mm;height:18mm;flex:0 0 auto}.customer-logo{width:38mm;height:21mm;justify-self:end}.logo-box img,.customer-logo img{width:100%;height:100%;object-fit:contain;padding:2mm}.is-empty{border-style:dashed!important;background:#fbfcfd!important}.eyebrow{color:var(--muted);font-size:7.5px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;margin-bottom:2px}.company-name,.site-name{color:var(--brand);font-weight:900;font-size:12.5px;line-height:1.2;margin-bottom:2px}.small-lines{color:#3d4a58;font-size:8.8px;line-height:1.45}.align-right{text-align:right}.align-center{text-align:center}
.certificate-title{display:flex;justify-content:space-between;gap:10mm;align-items:flex-end;margin:7mm 0 5mm}.certificate-title h1{margin:0;font-size:21px;line-height:1.08;color:var(--brand);letter-spacing:-.02em}.subtitle{margin-top:4px;color:var(--muted);font-size:9.5px}.certificate-ref{text-align:right;font-size:8px;color:var(--muted)}.certificate-ref strong{display:block;color:var(--ink);font-size:10.5px;margin-top:2px}.summary-strip{display:grid;grid-template-columns:1.2fr .8fr .8fr .8fr;border:1px solid var(--line);border-radius:7px;overflow:hidden;margin-bottom:5mm}.summary-cell{padding:7px 9px;background:#fbfcfd;border-right:1px solid var(--line)}.summary-cell:last-child{border-right:none}.label{color:var(--muted);font-size:7.2px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px}.value{color:var(--ink);font-weight:750;font-size:10.3px}
.section{margin-top:5mm}.top-section{margin-top:8mm}.section-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:2.8mm;padding-bottom:2mm;border-bottom:1px solid #bdc8d2}.section-title h2{margin:0;font-size:10.5px;color:var(--brand);text-transform:uppercase;letter-spacing:.06em}.section-index{width:19px;height:19px;border-radius:50%;background:var(--brand);color:#fff;display:inline-flex;align-items:center;justify-content:center;margin-right:7px;font-size:8.5px;font-weight:900;vertical-align:middle}.charger-grid{display:grid;grid-template-columns:50mm 1fr;gap:7mm}.primary-photo{margin:0;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:#fff}.primary-photo .photo-frame{height:46mm;background:linear-gradient(135deg,rgba(12,44,67,.03),rgba(255,176,0,.05));display:flex;align-items:center;justify-content:center;text-align:center;color:var(--muted);padding:9px}.primary-photo img{width:100%;height:100%;object-fit:contain}.primary-photo figcaption{padding:6px 8px;background:#fbfcfd;border-top:1px solid var(--line);font-size:8.5px;font-weight:750;color:#41505f}.details-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3.5mm 7mm}.field{border-bottom:1px solid var(--line);padding-bottom:4px;min-height:12mm}.field.full{grid-column:1/-1}.field .value{font-size:10.8px}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9.2px}th{background:var(--soft);color:#51606f;text-transform:uppercase;letter-spacing:.04em;font-size:7.2px;text-align:left;padding:6px;border-bottom:1px solid var(--line)}td{padding:6px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:none}.table-wrap{border:1px solid var(--line);border-radius:6px;overflow:hidden}.c-no{width:6%}.c-name{width:30%}.c-phase{width:10%}.c-protection{width:18%}.c-earthing,.c-reading{width:12%}
.connector-card{border:1px solid var(--line);border-radius:7px;overflow:hidden;margin-top:3mm;break-inside:avoid}.connector-head{display:flex;justify-content:space-between;align-items:center;padding:7px 9px;background:#f2f7f5;border-bottom:1px solid #d8e6de}.connector-head strong{color:var(--brand);font-size:10.5px}.connector-head span{color:#496455;font-size:8.7px}.connector-body{padding:9px}.result-label{margin-bottom:5px}.test-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:6px;overflow:hidden;margin-bottom:3.5mm}.test-item{padding:7px;border-right:1px solid var(--line);background:#fff}.test-item:last-child{border-right:none}.test-item .value{font-size:12.5px;color:var(--brand)}.checks{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:3.5mm}.check{border:1px solid var(--line);border-radius:5px;padding:6px 7px;background:#fff}.status{display:inline-block;margin-top:3px;padding:2px 6px;border-radius:999px;font-weight:900;font-size:7.8px}.status.pass{color:var(--success);background:var(--success-bg)}.status.fail{color:var(--danger);background:var(--danger-bg)}.dc-box{display:grid;grid-template-columns:1.1fr .7fr .7fr;border:1px solid var(--line);border-radius:6px;overflow:hidden}.dc-box>div{padding:7px;border-right:1px solid var(--line)}.dc-box>div:last-child{border-right:none}
.result-box{display:grid;grid-template-columns:48mm 1fr;gap:6mm;align-items:stretch}.result-pass{border:2px solid var(--success);border-radius:7px;background:var(--success-bg);color:var(--success);display:flex;align-items:center;justify-content:center;min-height:27mm;font-size:23px;font-weight:950;letter-spacing:.05em}.result-pass.fail{border-color:var(--danger);background:var(--danger-bg);color:var(--danger)}.result-notes{border:1px solid var(--line);border-radius:7px;padding:9px 11px}.result-gap{height:7px}.observation-legend{display:flex;gap:5px;flex-wrap:wrap}.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:999px;font-size:7.8px;font-weight:900;letter-spacing:.02em}.badge.fault{background:var(--danger-bg);color:var(--danger)}.badge.advice{background:var(--advice-bg);color:var(--advice)}.badge.condition{background:var(--condition-bg);color:var(--condition)}.badge.note{background:var(--note-bg);color:var(--note)}.observation-list{display:grid;gap:3mm}.observation-card{display:grid;grid-template-columns:24mm 1fr;gap:4mm;border:1px solid var(--line);border-radius:7px;padding:9px 10px;break-inside:avoid}.observation-type{padding-right:4mm;border-right:1px solid var(--line)}.observation-card .heading{font-size:10px;font-weight:850;color:var(--ink);margin-bottom:3px}.observation-card .text{font-size:9px;color:#44515e;white-space:pre-wrap}.observation-meta{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:6px;padding-top:6px;border-top:1px dashed var(--line)}.empty-state{border:1px dashed #cfd8e1;border-radius:7px;background:#fbfcfd;padding:12px;color:var(--muted);text-align:center;font-size:9px}.signoff-section{margin-top:6mm}.notes-section{margin-top:5mm}.notes-box{min-height:18mm;border:1px solid var(--line);border-radius:7px;padding:9px 11px;background:#fff;white-space:pre-wrap}.signoff-grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:4mm}.signature-box{border:1px solid var(--line);border-radius:7px;padding:11px;min-height:31mm}.signature-name{font-size:13px}.signature-space{height:7mm}.declaration{margin-top:5mm;padding:9px 11px;border-left:4px solid var(--accent);background:#fffaf0;color:#3f4852;font-size:9px}
.photo-intro{display:flex;justify-content:space-between;align-items:flex-end;gap:10mm;margin:7mm 0 5mm}.photo-intro h1{margin:0;font-size:19px;color:var(--brand)}.photo-intro p{margin:3px 0 0;color:var(--muted);font-size:9px}.photo-gallery{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.photo-card{margin:0;border:1px solid var(--line);border-radius:7px;overflow:hidden;background:#fff;break-inside:avoid}.photo-card .photo-title{padding:7px 9px;background:#f7f9fb;border-bottom:1px solid var(--line);font-size:9.5px;font-weight:850;color:var(--brand)}.gallery-frame{width:100%;height:82mm;background:#f3f5f7;display:flex;align-items:center;justify-content:center;overflow:hidden}.gallery-frame img{width:100%;height:100%;object-fit:contain;background:#fff}.photo-caption{padding:6px 9px;border-top:1px solid var(--line);color:var(--muted);font-size:8px;min-height:9mm}.photo-empty{margin-top:30mm;padding:20mm}.pill{display:inline-block;padding:3px 7px;border-radius:999px;background:#eef2f5;color:#44515e;font-size:7.8px;font-weight:800}.muted{color:var(--muted)}.footer{position:absolute;left:14mm;right:14mm;bottom:8mm;display:flex;justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:4px;color:var(--muted);font-size:7.8px}
@media print{html,body{background:#fff}.page{margin:0;box-shadow:none}}
`;
