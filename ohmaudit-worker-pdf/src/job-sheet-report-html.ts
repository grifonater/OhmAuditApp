import { renderRamsReportHtml, type RamsRenderPayload } from './rams-report-html';

export interface JobSheetRenderPayload {
  templateVersion: 'job-sheet-a4-v1';
  generatedAt: string;
  organisation: {
    name: string;
    addressLines: string[];
    telephone: string | null;
    email: string | null;
    website: string | null;
    logoImage?: {
      base64: string;
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    };
  };
  job: {
    id: string;
    reference: string | null;
    externalReference: string | null;
    title: string;
    description: string | null;
    exclusions: string | null;
    jobType: string | null;
    category: string | null;
    status: string;
    scheduledStart: string;
    scheduledEnd: string | null;
    engineerNotes: string | null;
  };
  customer: { name: string; reference: string | null };
  site: {
    name: string;
    reference: string | null;
    addressLines: string[];
    accessInstructions: string | null;
    parkingInformation: string | null;
    openingTimes: string | null;
    ppeRequirements: string | null;
    inductionInformation: string | null;
  };
  contacts: Array<{
    name: string;
    role: string | null;
    email: string | null;
    telephone: string | null;
    mobile: string | null;
    primary: boolean;
  }>;
  assignment: {
    name: string;
    email: string | null;
    mobile: string | null;
    kind: 'MEMBER' | 'GUEST' | 'UNASSIGNED';
  };
  tasks: Array<{
    order: number;
    title: string;
    moduleKey: string;
    status: string;
    asset: null | {
      reference: string;
      displayName: string;
      type: string;
      manufacturer: string | null;
      model: string | null;
      serialNumber: string | null;
    };
    inspection: null | { status: string; currentRevisionNumber: number };
  }>;
  attachedRams: Array<{
    reference: string;
    title: string;
    documentState: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED';
    revisionNumber: number | null;
  }>;
  rams?: RamsRenderPayload[];
}

function escapeHtml(input: string | number): string {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function value(input: string | number | null, fallback = 'Not recorded'): string {
  return input === null || String(input).trim() === '' ? escapeHtml(fallback) : escapeHtml(input);
}

function field(label: string, input: string | number | null): string {
  return `<div class="js-field"><dt>${escapeHtml(label)}</dt><dd>${value(input)}</dd></div>`;
}

function card(title: string, input: string | null, fallback = 'None recorded'): string {
  return `<section class="js-card"><h3>${escapeHtml(title)}</h3><p>${value(input, fallback)}</p></section>`;
}

function organisationLogo(payload: JobSheetRenderPayload): string {
  const logo = payload.organisation.logoImage;
  if (logo === undefined) return '<div class="js-brand-mark">OHMAUDIT</div>';
  const source = `data:${logo.mimeType};base64,${logo.base64.replaceAll(/\s/gu, '')}`;
  return `<img class="js-logo" src="${escapeHtml(source)}" alt="${escapeHtml(payload.organisation.name)} logo">`;
}

function contactRows(payload: JobSheetRenderPayload): string {
  if (payload.contacts.length === 0)
    return '<tr><td colspan="6" class="js-empty">No site contacts recorded.</td></tr>';
  return payload.contacts
    .map(
      (contact) =>
        `<tr><td><strong>${value(contact.name)}</strong></td><td>${value(contact.role)}</td><td>${value(contact.email)}</td><td>${value(contact.telephone)}</td><td>${value(contact.mobile)}</td><td>${contact.primary ? 'Yes' : 'No'}</td></tr>`,
    )
    .join('');
}

function taskRows(payload: JobSheetRenderPayload): string {
  if (payload.tasks.length === 0)
    return '<tr><td colspan="6" class="js-empty">No inspection tasks recorded.</td></tr>';
  return [...payload.tasks]
    .sort((left, right) => left.order - right.order)
    .map((task) => {
      const asset = task.asset;
      const assetDetails =
        asset === null
          ? 'No asset assigned'
          : `<strong>${value(asset.displayName)}</strong><br>${value(asset.reference, 'No reference')} · ${value(asset.type, 'No type')}<br>${value(asset.manufacturer)} · ${value(asset.model)} · S/N ${value(asset.serialNumber)}`;
      const inspection =
        task.inspection === null
          ? 'Not created'
          : `${value(task.inspection.status)} · Revision ${escapeHtml(task.inspection.currentRevisionNumber)}`;
      return `<tr><td class="js-number">${escapeHtml(task.order)}</td><td><strong>${value(task.title)}</strong></td><td>${value(task.moduleKey)}</td><td>${value(task.status)}</td><td>${assetDetails}</td><td>${inspection}</td></tr>`;
    })
    .join('');
}

function ramsRows(payload: JobSheetRenderPayload): string {
  if (payload.attachedRams.length === 0)
    return '<tr><td colspan="4" class="js-empty">No RAMS attached.</td></tr>';
  return payload.attachedRams
    .map(
      (rams) =>
        `<tr><td>${value(rams.reference)}</td><td><strong>${value(rams.title)}</strong></td><td>${escapeHtml(rams.documentState.replaceAll('_', ' '))}</td><td>${value(rams.revisionNumber, 'Draft')}</td></tr>`,
    )
    .join('');
}

function ramsPackageSections(payload: JobSheetRenderPayload): string {
  return (payload.rams ?? [])
    .map((item) => {
      const brandedItem =
        item.organisation.logoImage === undefined && payload.organisation.logoImage !== undefined
          ? {
              ...item,
              organisation: {
                ...item.organisation,
                logoImage: payload.organisation.logoImage,
              },
            }
          : item;
      const html = renderRamsReportHtml(brandedItem);
      const styles = /<style>([\s\S]*?)<\/style>/u.exec(html)?.[1] ?? '';
      const document = /(<main class="document">[\s\S]*<\/main>)/u.exec(html)?.[1] ?? '';
      return `<section class="package-rams"><style>${styles}</style>${document}</section>`;
    })
    .join('');
}

/** Returns a self-contained A4 job sheet, optionally followed by complete RAMS documents. */
export function renderJobSheetReportHtml(payload: JobSheetRenderPayload): string {
  const organisationContact = [
    payload.organisation.telephone,
    payload.organisation.email,
    payload.organisation.website,
  ]
    .filter((item): item is string => item !== null && item.trim() !== '')
    .map(escapeHtml)
    .join(' · ');

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${value(payload.job.reference, payload.job.id)} - ${value(payload.job.title)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #17243a; background: #eef2f6; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-size: 9pt; line-height: 1.4; }
    .job-sheet { width: 210mm; min-height: 297mm; margin: 10mm auto; padding: 11mm 12mm 18mm; background: #fff; box-shadow: 0 8px 32px rgba(7,27,52,.14); }
    .js-masthead { display: grid; grid-template-columns: 72mm 1fr; border: 1.5px solid #071b34; break-inside: avoid; }
    .js-brand { padding: 5mm; background: #071b34; color: #fff; }
    .js-logo { display: block; max-width: 58mm; max-height: 17mm; object-fit: contain; object-position: left center; }
    .js-brand-mark { color: #ffb000; font-size: 17pt; font-weight: 800; letter-spacing: .05em; }
    .js-brand h2 { margin: 3mm 0 1mm; font-size: 11pt; }
    .js-brand p { margin: 0; color: #bac7d8; font-size: 7pt; white-space: pre-line; }
    .js-control { display: grid; grid-template-columns: 1fr 1fr; margin: 0; }
    .js-field { min-width: 0; padding: 2.5mm 3mm; border-bottom: 1px solid #d4dce7; border-left: 1px solid #d4dce7; }
    .js-field dt { color: #53647b; font-size: 6.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .js-field dd { margin: .8mm 0 0; overflow-wrap: anywhere; font-weight: 700; white-space: pre-line; }
    .js-hero { display: grid; grid-template-columns: 1fr 45mm; gap: 6mm; padding: 8mm 0 5mm; border-bottom: 3px solid #ffb000; break-inside: avoid; }
    .js-hero h1 { margin: 0; color: #071b34; font-size: 23pt; line-height: 1.08; }
    .js-eyebrow { margin: 0 0 2mm; color: #145fc9; font-size: 7pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .js-state { align-self: center; padding: 4mm 2mm; border: 1px solid #9eb5d0; background: #e8f0ff; text-align: center; font-weight: 800; overflow-wrap: anywhere; }
    .js-section { margin-top: 6mm; }
    .js-section h2 { margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 1.5px solid #071b34; font-size: 13pt; }
    .js-details { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0; border: 1px solid #d4dce7; }
    .js-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
    .js-card { border: 1px solid #d4dce7; break-inside: avoid; }
    .js-card h3 { margin: 0; padding: 2mm 3mm; background: #e8f0ff; font-size: 8pt; text-transform: uppercase; }
    .js-card p { margin: 0; padding: 3mm; white-space: pre-line; }
    table { width: 100%; border-collapse: collapse; break-inside: auto; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th { background: #071b34; color: #fff; font-size: 6.5pt; letter-spacing: .04em; text-align: left; text-transform: uppercase; }
    th, td { padding: 2mm; border: 1px solid #bfc9d6; vertical-align: top; overflow-wrap: anywhere; }
    td { font-size: 7.5pt; }
    .js-number { width: 10mm; text-align: center; font-weight: 800; }
    .js-empty { color: #6b788a; font-style: italic; }
    .js-generated { margin: 6mm 0 0; color: #53647b; font-size: 7pt; text-align: right; }
    .package-rams { position: relative; break-before: page; page-break-before: always; }
    .package-rams .document { position: relative; }
    .package-rams .watermark { position: absolute !important; }
    @page { size: A4 portrait; margin: 11mm 0 22mm; }
    @media print {
      html, body { width: 210mm; background: #fff; }
      .job-sheet { width: auto; min-height: 0; margin: 0; padding-top: 0; padding-bottom: 0; box-shadow: none; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <main class="job-sheet">
    <header class="js-masthead">
      <div class="js-brand">${organisationLogo(payload)}<h2>${value(payload.organisation.name)}</h2><p>${value(payload.organisation.addressLines.join('\n'), 'No organisation address')}\n${organisationContact || 'No contact details recorded'}</p></div>
      <dl class="js-control">
        ${field('Job reference', payload.job.reference)}
        ${field('External reference', payload.job.externalReference)}
        ${field('Job ID', payload.job.id)}
        ${field('Template version', payload.templateVersion)}
        ${field('Scheduled start', payload.job.scheduledStart)}
        ${field('Scheduled end', payload.job.scheduledEnd)}
      </dl>
    </header>
    <section class="js-hero"><div><p class="js-eyebrow">Job sheet and engineer briefing</p><h1>${value(payload.job.title)}</h1><p>${value([payload.job.category, payload.job.jobType].filter(Boolean).join(' / '), 'Uncategorised job')}</p></div><div class="js-state">${value(payload.job.status)}</div></section>

    <section class="js-section"><h2>Customer, site and assignment</h2><dl class="js-details">
      ${field('Customer', payload.customer.name)}${field('Customer reference', payload.customer.reference)}${field('Site reference', payload.site.reference)}
      ${field('Site', payload.site.name)}${field('Full site address', payload.site.addressLines.join('\n'))}${field('Assigned resource', `${payload.assignment.name}\n${payload.assignment.kind}`)}
      ${field('Assignment email', payload.assignment.email)}${field('Assignment mobile', payload.assignment.mobile)}${field('Assignment kind', payload.assignment.kind)}
    </dl></section>

    <section class="js-section"><h2>Scope and engineer information</h2><div class="js-grid">
      ${card('Description / scope', payload.job.description, 'No description recorded')}
      ${card('Exclusions', payload.job.exclusions)}
      ${card('Engineer notes', payload.job.engineerNotes)}
      ${card('Access instructions', payload.site.accessInstructions)}
      ${card('Parking information', payload.site.parkingInformation)}
      ${card('Opening times', payload.site.openingTimes)}
      ${card('PPE requirements', payload.site.ppeRequirements)}
      ${card('Induction information', payload.site.inductionInformation)}
    </div></section>

    <section class="js-section"><h2>Site contacts</h2><table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Telephone</th><th>Mobile</th><th>Primary</th></tr></thead><tbody>${contactRows(payload)}</tbody></table></section>
    <section class="js-section"><h2>Ordered inspection and task plan</h2><table><thead><tr><th>#</th><th>Task</th><th>Module key</th><th>Task status</th><th>Associated asset</th><th>Inspection status</th></tr></thead><tbody>${taskRows(payload)}</tbody></table></section>
    <section class="js-section"><h2>Attached RAMS index</h2><table><thead><tr><th>Reference</th><th>Title</th><th>Document state</th><th>Revision</th></tr></thead><tbody>${ramsRows(payload)}</tbody></table></section>
    <p class="js-generated">Generated ${value(payload.generatedAt)}</p>
  </main>
  ${ramsPackageSections(payload)}
</body>
</html>`;
}
