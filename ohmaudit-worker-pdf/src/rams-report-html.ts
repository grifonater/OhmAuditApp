export interface RamsRenderPerson {
  id?: string;
  name?: string;
  displayName?: string | null;
  email?: string;
  role?: string;
}

export interface RamsMethodStep {
  id: string;
  title: string;
  required: boolean;
  detail?: string;
}

export interface RamsHazard {
  id: string;
  hazard: string;
  peopleAtRisk: string;
  initialLikelihood: number;
  initialSeverity: number;
  controls: string;
  residualLikelihood: number;
  residualSeverity: number;
  howHarmed?: string;
  furtherActions?: string;
  actionOwner?: string;
  actionDueDate?: string;
  actionStatus?: string;
}

export interface RamsDraftData {
  schemaVersion?: number;
  overview: {
    title: string;
    category: string;
    effectiveFrom: string;
    reviewBy?: string;
    revisionSummary?: string;
  };
  scope: {
    scopeOfWorks: string;
    exclusions: string[];
    engineerBriefing: string[];
    keyActivities?: string[];
    assumptions?: string[];
    workAreas?: string[];
    workBoundaries?: string;
    responsibilities?: Array<{
      id: string;
      name: string;
      role: string;
      organisation: string;
      responsibility: string;
      contact: string;
    }>;
  };
  methodStatement: { steps: RamsMethodStep[] };
  riskAssessment: { hazards: RamsHazard[] };
  requirements: {
    ppe: string[];
    tools: string[];
    competencies: string[];
    emergencyArrangements: string[];
    plant?: string[];
    materials?: string[];
    training?: string[];
    substances?: string[];
    welfare?: string[];
    emergencyDetails?: {
      contactName: string;
      contactNumber: string;
      nearestHospital: string;
      hospitalAddress: string;
      assemblyPoint: string;
      additionalInfo: string;
    };
  };
  supportingInformation: {
    siteAccess: string;
    permits: string;
    welfare: string;
    environmental: string;
    references: Array<{ id: string; title: string; url: string }>;
    permitReferences?: RamsNamedReference[];
    coshhReferences?: RamsNamedReference[];
    workingAtHeightReferences?: RamsNamedReference[];
    legislationReferences?: RamsNamedReference[];
    documents?: Array<{
      id: string;
      name: string;
      type: string;
      reference: string;
      status: string;
    }>;
    electricalSafety?: string[];
  };
  review: {
    approvalMode: 'AUTHOR' | 'REVIEWER';
    requireEngineerAcknowledgement: boolean;
    internalNotes?: string;
    changeImpact?: string;
    revisionReason?: string;
    changeSummary?: string;
  };
}

export interface RamsNamedReference {
  id: string;
  name: string;
  reference: string;
}

export interface RamsRevisionHistoryItem {
  revisionNumber: number;
  createdAt: string;
  createdBy: RamsRenderPerson;
  status?: string;
  summary?: string;
}

export interface RamsRenderPayload {
  templateVersion: string;
  documentState: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED';
  revisionNumber: number | null;
  reference: string;
  title: string;
  effectiveFrom: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  reviewComment: string | null;
  generatedAt: string;
  organisation: { name: string; addressLines: string[] };
  job: {
    id: string;
    reference: string | null;
    externalReference: string | null;
    title: string;
    category: string | null;
    jobType: string | null;
    plannedStart: string | null;
    targetCompletion: string | null;
  };
  customer: { name: string };
  site: { name: string; addressLines: string[] };
  people: {
    preparedBy: RamsRenderPerson;
    reviewedBy?: RamsRenderPerson | null;
    approvedBy?: RamsRenderPerson | null;
    assignedEngineer?: RamsRenderPerson | null;
  };
  data: RamsDraftData;
  revisionHistory: RamsRevisionHistoryItem[];
}

function escapeHtml(value: string | number): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function value(input: string | number | null | undefined, fallback = 'Not recorded'): string {
  if (input === null || input === undefined || String(input).trim() === '')
    return escapeHtml(fallback);
  return escapeHtml(input);
}

function person(input: RamsRenderPerson | null | undefined): string {
  if (input === null || input === undefined) return 'Not recorded';
  const name = input.displayName?.trim() || input.name?.trim() || input.email?.trim();
  return name || 'Not recorded';
}

function list(items: string[] | undefined, empty = 'None recorded'): string {
  const populated = (items ?? []).filter((item) => item.trim() !== '');
  if (populated.length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return `<ul>${populated.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function card(title: string, body: string, className = ''): string {
  return `<section class="card ${escapeHtml(className)}"><h3>${escapeHtml(title)}</h3><div class="card-body">${body}</div></section>`;
}

function field(label: string, input: string | number | null | undefined): string {
  return `<div class="field"><dt>${escapeHtml(label)}</dt><dd>${value(input)}</dd></div>`;
}

function score(likelihood: number, severity: number): number {
  return likelihood * severity;
}

function riskClass(risk: number): string {
  if (risk <= 4) return 'low';
  if (risk <= 9) return 'medium';
  if (risk <= 15) return 'high';
  return 'very-high';
}

function riskBadge(likelihood: number, severity: number): string {
  const risk = score(likelihood, severity);
  return `<span class="risk ${riskClass(risk)}">${escapeHtml(risk)} <small>(${escapeHtml(likelihood)} x ${escapeHtml(severity)})</small></span>`;
}

function riskMatrix(): string {
  const rows = [5, 4, 3, 2, 1]
    .map(
      (severity) =>
        `<tr><th>${severity}</th>${[1, 2, 3, 4, 5]
          .map((likelihood) => {
            const risk = score(likelihood, severity);
            return `<td class="${riskClass(risk)}">${risk}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  return `<table class="matrix" aria-label="Five by five risk matrix"><thead><tr><th>S / L</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function methodRows(steps: RamsMethodStep[]): string {
  if (steps.length === 0) return '<tr><td colspan="3">No method steps recorded.</td></tr>';
  return steps
    .map(
      (step, index) => `<tr>
        <td class="number">${index + 1}</td>
        <td><strong>${value(step.title)}</strong><div class="subcopy">${value(step.detail, 'No additional detail')}</div></td>
        <td>${step.required ? 'Yes' : 'No'}</td>
      </tr>`,
    )
    .join('');
}

function hazardRows(hazards: RamsHazard[]): string {
  if (hazards.length === 0) return '<tr><td colspan="9">No hazards recorded.</td></tr>';
  return hazards
    .map(
      (hazard, index) => `<tr>
        <td class="number">${index + 1}</td>
        <td><strong>${value(hazard.hazard)}</strong><div class="subcopy"><b>How harmed:</b> ${value(hazard.howHarmed)}</div></td>
        <td>${value(hazard.peopleAtRisk)}</td>
        <td>${riskBadge(hazard.initialLikelihood, hazard.initialSeverity)}</td>
        <td>${value(hazard.controls)}</td>
        <td>${riskBadge(hazard.residualLikelihood, hazard.residualSeverity)}</td>
        <td>${value(hazard.furtherActions, 'None recorded')}</td>
        <td>${value(hazard.actionOwner)}<div class="subcopy">Due: ${value(hazard.actionDueDate)}</div></td>
        <td>${value(hazard.actionStatus)}</td>
      </tr>`,
    )
    .join('');
}

function documentList(payload: RamsRenderPayload): string {
  const supporting = payload.data.supportingInformation;
  const references = supporting.references.map((item) =>
    [item.title, item.url].filter((part) => part.trim() !== '').join(' - '),
  );
  const documents = (supporting.documents ?? []).map((item) =>
    [item.name, item.type, item.reference, item.status].filter((part) => part.trim()).join(' - '),
  );
  return list([...references, ...documents]);
}

function responsibilityRows(
  items: NonNullable<RamsDraftData['scope']['responsibilities']>,
): string {
  if (items.length === 0) return '<tr><td colspan="5">No responsibilities recorded.</td></tr>';
  return items
    .map(
      (item) =>
        `<tr><td>${value(item.name)}</td><td>${value(item.role)}</td><td>${value(item.organisation)}</td><td>${value(item.responsibility)}</td><td>${value(item.contact)}</td></tr>`,
    )
    .join('');
}

function referenceRows(items: RamsNamedReference[] | undefined): string {
  if (!items?.length) return '<tr><td colspan="2">None recorded.</td></tr>';
  return items
    .map((item) => `<tr><td>${value(item.name)}</td><td>${value(item.reference)}</td></tr>`)
    .join('');
}

function emergencyDetails(details: RamsDraftData['requirements']['emergencyDetails']): string {
  if (!details) return '<p class="empty">No structured emergency details recorded.</p>';
  return `<dl class="compact-details">
    ${field('Emergency contact', details.contactName)}
    ${field('Contact number', details.contactNumber)}
    ${field('Nearest hospital', details.nearestHospital)}
    ${field('Hospital address', details.hospitalAddress)}
    ${field('Assembly point', details.assemblyPoint)}
    ${field('Additional information', details.additionalInfo)}
  </dl>`;
}

function revisionRows(items: RamsRevisionHistoryItem[]): string {
  if (items.length === 0) return '<tr><td colspan="5">No issued revisions recorded.</td></tr>';
  return items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.revisionNumber)}</td><td>${value(item.createdAt)}</td><td>${value(person(item.createdBy))}</td><td>${value(item.status)}</td><td>${value(item.summary)}</td></tr>`,
    )
    .join('');
}

/** Returns a self-contained, print-safe A4 RAMS document with no executable or external content. */
export function renderRamsReportHtml(payload: RamsRenderPayload): string {
  const data = payload.data;
  const stateLabel = payload.documentState.replaceAll('_', ' ');
  const watermark =
    payload.documentState === 'APPROVED'
      ? ''
      : `<div class="watermark">${escapeHtml(stateLabel)} - NOT APPROVED FOR USE</div>`;
  const acknowledgementName = person(payload.people.assignedEngineer);
  const acknowledgementRows = Array.from({ length: 8 }, (_, index) => {
    const name =
      index === 0 && payload.people.assignedEngineer ? value(acknowledgementName) : '&nbsp;';
    return `<tr><td>${name}</td><td></td><td></td><td></td></tr>`;
  }).join('');

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${value(payload.reference)} - ${value(payload.title)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #17243a; background: #eef2f6; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-size: 9pt; line-height: 1.42; }
    .document { width: 210mm; margin: 10mm auto; padding: 11mm 12mm 18mm; background: #fff; box-shadow: 0 8px 32px rgba(7,27,52,.14); }
    .masthead { display: grid; grid-template-columns: 1fr 1.25fr; border: 1.5px solid #071b34; break-inside: avoid; }
    .brand { padding: 5mm; background: #071b34; color: #fff; }
    .brand-mark { display: flex; align-items: center; gap: 3mm; color: #ffb000; font-size: 22pt; font-weight: 800; }
    .brand-mark span { color: #fff; font-size: 16pt; letter-spacing: .04em; }
    .brand p { margin: 2mm 0 0; color: #bac7d8; font-size: 7pt; }
    .control { display: grid; grid-template-columns: 1fr 1fr; margin: 0; }
    .control .field { padding: 2.5mm 3mm; border-bottom: 1px solid #d4dce7; border-left: 1px solid #d4dce7; }
    .control .field:nth-last-child(-n+2) { border-bottom: 0; }
    dt { color: #53647b; font-size: 6.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    dd { margin: .8mm 0 0; overflow-wrap: anywhere; font-weight: 700; white-space: pre-line; }
    .hero { display: grid; grid-template-columns: 1fr 55mm; gap: 8mm; padding: 9mm 0 6mm; border-bottom: 3px solid #ffb000; break-inside: avoid; }
    .eyebrow { margin: 0 0 2mm; color: #145fc9; font-size: 7pt; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; color: #071b34; font-size: 25pt; line-height: 1.05; letter-spacing: -.03em; }
    .hero-copy { margin: 3mm 0 0; color: #53647b; font-size: 10pt; }
    .state { align-self: center; padding: 4mm; border: 1px solid #9eb5d0; background: #e8f0ff; text-align: center; color: #071b34; }
    .state span { display: block; font-size: 7pt; letter-spacing: .1em; }
    .state strong { display: block; margin-top: 1mm; font-size: 12pt; }
    .section { margin-top: 7mm; break-inside: auto; }
    .section-title { display: flex; align-items: center; gap: 3mm; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 1.5px solid #071b34; color: #071b34; font-size: 13pt; }
    .section-title span { display: grid; width: 7mm; height: 7mm; place-items: center; background: #ffb000; font-size: 8pt; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
    .grid.three { grid-template-columns: repeat(3, 1fr); }
    .card { border: 1px solid #d4dce7; break-inside: avoid; }
    .card h3 { margin: 0; padding: 2mm 3mm; background: #e8f0ff; color: #071b34; font-size: 8pt; letter-spacing: .04em; text-transform: uppercase; }
    .card-body { padding: 3mm; }
    .card-body p { margin: 0; white-space: pre-line; }
    .wide { grid-column: 1 / -1; }
    .details { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0; border: 1px solid #d4dce7; }
    .details .field { min-width: 0; padding: 3mm; border-right: 1px solid #d4dce7; border-bottom: 1px solid #d4dce7; }
    .compact-details { display: grid; grid-template-columns: 1fr 1fr; margin: 0; }
    .compact-details .field { padding: 2mm; border-bottom: 1px solid #d4dce7; }
    ul { margin: 0; padding-left: 5mm; }
    li + li { margin-top: 1mm; }
    .empty { margin: 0; color: #6b788a; font-style: italic; }
    table { width: 100%; border-collapse: collapse; break-inside: auto; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th { background: #071b34; color: #fff; font-size: 6.5pt; letter-spacing: .04em; text-align: left; text-transform: uppercase; }
    th, td { padding: 2mm; border: 1px solid #bfc9d6; vertical-align: top; overflow-wrap: anywhere; }
    td { font-size: 7.5pt; white-space: pre-line; }
    .number { width: 7mm; text-align: center; font-weight: 800; }
    .subcopy { margin-top: 1.5mm; color: #53647b; font-size: 6.5pt; }
    .risk-table { table-layout: fixed; }
    .risk-table th:nth-child(1) { width: 5mm; }
    .risk-table th:nth-child(4), .risk-table th:nth-child(6) { width: 16mm; }
    .risk-table th:nth-child(8), .risk-table th:nth-child(9) { width: 18mm; }
    .risk { display: inline-block; min-width: 12mm; padding: 1mm; color: #071b34; text-align: center; font-weight: 800; }
    .risk small { display: block; font-size: 5.5pt; }
    .low { background: #a7e3c9 !important; color: #114f3b !important; }
    .medium { background: #ffe27a !important; color: #624b00 !important; }
    .high { background: #ffb26b !important; color: #6b3100 !important; }
    .very-high { background: #e46670 !important; color: #fff !important; }
    .risk-guide { display: grid; grid-template-columns: 72mm 1fr; gap: 5mm; margin-top: 4mm; break-inside: avoid; }
    .matrix th, .matrix td { padding: 1.5mm; text-align: center; }
    .legend { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; align-content: start; }
    .legend span { padding: 2mm; font-size: 7pt; font-weight: 700; }
    .callout { padding: 3mm; border-left: 3px solid #ffb000; background: #fff8e5; white-space: pre-line; }
    .signature-table td { height: 10mm; }
    .footer { position: fixed; right: 12mm; bottom: 5mm; left: 12mm; display: flex; justify-content: space-between; padding-top: 2mm; border-top: 1px solid #9ba9ba; color: #53647b; font-size: 6pt; }
    .watermark { position: fixed; z-index: 0; top: 128mm; left: 22mm; width: 166mm; transform: rotate(-32deg); color: rgba(166, 44, 55, .10); font-size: 52pt; font-weight: 900; letter-spacing: .08em; text-align: center; pointer-events: none; }
    .document > *:not(.watermark) { position: relative; z-index: 1; }
    @page { size: A4 portrait; margin: 11mm 0 16mm; }
    @media print {
      html, body { width: 210mm; background: #fff; }
      .document { width: auto; margin: 0; padding-top: 0; padding-bottom: 0; box-shadow: none; }
      .footer, .watermark { position: fixed; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <main class="document">
    ${watermark}
    <header class="masthead">
      <div class="brand"><div class="brand-mark">Ω <span>OHMAUDIT</span></div><p>RISK ASSESSMENT &amp; METHOD STATEMENT</p></div>
      <dl class="control">
        ${field('Document reference', payload.reference)}
        ${field('Revision', payload.revisionNumber === null ? 'Draft' : payload.revisionNumber)}
        ${field('Template version', payload.templateVersion)}
        ${field('Generated', payload.generatedAt)}
      </dl>
    </header>

    <section class="hero">
      <div><p class="eyebrow">Controlled health &amp; safety document</p><h1>${value(payload.title)}</h1><p class="hero-copy">${value(payload.organisation.name)} · ${value(payload.customer.name)} · ${value(payload.site.name)}</p></div>
      <div class="state"><span>DOCUMENT STATE</span><strong>${escapeHtml(stateLabel)}</strong></div>
    </section>

    <section class="section">
      <h2 class="section-title"><span>1</span> Document overview</h2>
      <dl class="details">
        ${field('Organisation', `${payload.organisation.name}\n${payload.organisation.addressLines.join('\n')}`)}
        ${field('Customer', payload.customer.name)}
        ${field('Site', `${payload.site.name}\n${payload.site.addressLines.join('\n')}`)}
        ${field('Job', payload.job.title)}
        ${field('Job reference', payload.job.reference)}
        ${field('External reference', payload.job.externalReference)}
        ${field('Category / type', [payload.job.category, payload.job.jobType].filter(Boolean).join(' / '))}
        ${field('Planned start', payload.job.plannedStart)}
        ${field('Target completion', payload.job.targetCompletion)}
        ${field('Effective from', payload.effectiveFrom ?? data.overview.effectiveFrom)}
        ${field('Review by', data.overview.reviewBy)}
        ${field('Schema version', data.schemaVersion)}
      </dl>
      <div class="grid" style="margin-top:3mm">
        ${card('Overview', value(data.overview.title))}
        ${card('Revision summary', value(data.overview.revisionSummary, 'No revision summary recorded'))}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title"><span>2</span> Scope, boundaries &amp; responsibilities</h2>
      <div class="grid">
        ${card('Scope of works', value(data.scope.scopeOfWorks), 'wide')}
        ${card('Exclusions', list(data.scope.exclusions))}
        ${card('Engineer briefing', list(data.scope.engineerBriefing))}
        ${card('Key activities', list(data.scope.keyActivities))}
        ${card('Assumptions', list(data.scope.assumptions))}
        ${card('Work areas', list(data.scope.workAreas))}
        ${card('Work boundaries', value(data.scope.workBoundaries))}
      </div>
      <table style="margin-top:3mm"><thead><tr><th>Person</th><th>Role</th><th>Organisation</th><th>Responsibility</th><th>Contact</th></tr></thead><tbody>${responsibilityRows(data.scope.responsibilities ?? [])}</tbody></table>
    </section>

    <section class="section">
      <h2 class="section-title"><span>3</span> Resources, competence &amp; substances</h2>
      <div class="grid three">
        ${card('PPE', list(data.requirements.ppe))}
        ${card('Tools & equipment', list(data.requirements.tools))}
        ${card('Plant', list(data.requirements.plant))}
        ${card('Materials', list(data.requirements.materials))}
        ${card('Competencies', list(data.requirements.competencies))}
        ${card('Training', list(data.requirements.training))}
        ${card('Substances', list(data.requirements.substances), 'wide')}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title"><span>4</span> Method statement</h2>
      <table><thead><tr><th>#</th><th>Safe work sequence</th><th>Mandatory</th></tr></thead><tbody>${methodRows(data.methodStatement.steps)}</tbody></table>
    </section>

    <section class="section">
      <h2 class="section-title"><span>5</span> Risk assessment</h2>
      <table class="risk-table"><thead><tr><th>#</th><th>Hazard / harm</th><th>People at risk</th><th>Initial</th><th>Control measures</th><th>Residual</th><th>Further actions</th><th>Owner / due</th><th>Status</th></tr></thead><tbody>${hazardRows(data.riskAssessment.hazards)}</tbody></table>
      <div class="risk-guide">
        ${riskMatrix()}
        <div><h3>Risk scoring guide</h3><p>Risk score = likelihood x severity. Work must not start where residual risk is unacceptable. Escalate high and very high residual risks for further control and approval.</p><div class="legend"><span class="low">1-4 Low</span><span class="medium">5-9 Medium</span><span class="high">10-15 High</span><span class="very-high">16-25 Very high</span></div></div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title"><span>6</span> Site arrangements</h2>
      <div class="grid">
        ${card('Emergency arrangements', list(data.requirements.emergencyArrangements))}
        ${card('Emergency details', emergencyDetails(data.requirements.emergencyDetails))}
        ${card('Welfare requirements', list(data.requirements.welfare))}
        ${card('Welfare arrangements', value(data.supportingInformation.welfare))}
        ${card('Environmental controls', value(data.supportingInformation.environmental))}
        ${card('Site access & parking', value(data.supportingInformation.siteAccess))}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title"><span>7</span> Permits &amp; supporting information</h2>
      <div class="grid">
        ${card('Permits & induction', value(data.supportingInformation.permits))}
        ${card('Permit references', `<table><tbody>${referenceRows(data.supportingInformation.permitReferences)}</tbody></table>`)}
        ${card('COSHH references', `<table><tbody>${referenceRows(data.supportingInformation.coshhReferences)}</tbody></table>`)}
        ${card('Working at height', `<table><tbody>${referenceRows(data.supportingInformation.workingAtHeightReferences)}</tbody></table>`)}
        ${card('Legislation & standards', `<table><tbody>${referenceRows(data.supportingInformation.legislationReferences)}</tbody></table>`)}
        ${card('Electrical safety', list(data.supportingInformation.electricalSafety))}
        ${card('Supporting documents', documentList(payload), 'wide')}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title"><span>8</span> Review &amp; approval</h2>
      <dl class="details">
        ${field('Prepared by', person(payload.people.preparedBy))}
        ${field('Reviewed by', person(payload.people.reviewedBy))}
        ${field('Approved by', person(payload.people.approvedBy))}
        ${field('Submitted at', payload.submittedAt)}
        ${field('Approved at', payload.approvedAt)}
        ${field('Approval mode', data.review.approvalMode)}
      </dl>
      <div class="grid" style="margin-top:3mm">
        ${card('Review comment', value(payload.reviewComment, 'No review comment recorded'))}
        ${card('Revision reason', value(data.review.revisionReason))}
        ${card('Change summary', value(data.review.changeSummary))}
        ${card('Change impact', value(data.review.changeImpact))}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title"><span>9</span> Engineer acknowledgement</h2>
      <p class="callout">I confirm that I have read and understood this RAMS, received the required briefing, will follow the stated controls and method, and will stop work and report any change in conditions or scope. Re-acknowledgement required: ${data.review.requireEngineerAcknowledgement ? 'YES' : 'NO'}.</p>
      <table class="signature-table" style="margin-top:3mm"><thead><tr><th>Print name</th><th>Signature</th><th>Date / time</th><th>Briefed by</th></tr></thead><tbody>${acknowledgementRows}</tbody></table>
    </section>

    <section class="section">
      <h2 class="section-title"><span>10</span> Revision history</h2>
      <table><thead><tr><th>Revision</th><th>Date</th><th>Created by</th><th>Status</th><th>Summary</th></tr></thead><tbody>${revisionRows(payload.revisionHistory)}</tbody></table>
    </section>

    <footer class="footer"><span>CONTROLLED DOCUMENT · VERIFY CURRENT REVISION BEFORE USE</span><span>${value(payload.reference)} · REV ${value(payload.revisionNumber, 'DRAFT')}</span><span>OHMAUDIT RAMS</span></footer>
  </main>
</body>
</html>`;
}
