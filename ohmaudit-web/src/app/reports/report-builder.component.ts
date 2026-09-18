import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService, type InspectionSummary } from '../core/api.service';

type BuilderStep = 1 | 2 | 3 | 4 | 5;
type ReportStatus = 'Published' | 'Template' | 'Draft';
type ReportFormat = 'PDF' | 'Excel' | 'CSV' | 'Web view';
type ReportModule = 'Inspections' | 'Assets' | 'RAMS' | 'Jobs' | 'Clients & Sites';

interface ReportField {
  key: string;
  label: string;
  category: string;
  required?: boolean;
}

interface PreviewRow {
  [key: string]: string | number;
  client: string;
  site: string;
  asset: string;
  inspectionDate: string;
  engineer: string;
  result: string;
  defects: number;
}

interface ReportDraft {
  name: string;
  description: string;
  module: ReportModule;
  reportType: 'Table report' | 'Summary dashboard' | 'Certificate pack' | 'Compliance report';
  audience: 'Private' | 'Organisation' | 'Template';
  formats: ReportFormat[];
  siteFiltering: boolean;
  fields: string[];
  groupedFields: string[];
  moduleFilter: string;
  resultFilter: 'All results' | 'Compliant' | 'Non-compliant';
  overdueOnly: boolean;
  includeArchived: boolean;
  sortField: string;
  sortDirection: 'Ascending' | 'Descending';
  pageSize: 'A4' | 'Letter';
  orientation: 'Portrait' | 'Landscape';
  margins: 'Normal' | 'Narrow' | 'Wide';
  pageNumbers: boolean;
  customerLogo: boolean;
  organisationLogo: boolean;
  accent: string;
  sections: string[];
  charts: string[];
  subtitle: string;
  footer: string;
  disclaimer: string;
  scheduleEnabled: boolean;
  frequency: 'Weekly' | 'Monthly' | 'Quarterly';
  scheduleDay: string;
  scheduleTime: string;
  recipients: string;
  emailSubject: string;
  attachAs: 'PDF' | 'Excel' | 'Both';
  visibility: 'Private' | 'Organisation users' | 'Internal and client contacts';
  guestLinks: boolean;
  linkExpiry: string;
  watermark: boolean;
  versionHistory: boolean;
}

interface ReportItem {
  id: string;
  name: string;
  description: string;
  module: Exclude<ReportModule, 'Clients & Sites'>;
  lastRun: string;
  timestamp: number;
  format: ReportFormat;
  status: ReportStatus;
  owner: string;
  initials: string;
  draft: ReportDraft;
  documentId?: string;
  placeholder?: boolean;
}

const REPORT_FIELDS: ReportField[] = [
  { key: 'client', label: 'Client', category: 'Client details', required: true },
  { key: 'site', label: 'Site name', category: 'Site details', required: true },
  { key: 'asset', label: 'Asset name', category: 'Asset details' },
  { key: 'inspectionDate', label: 'Inspection date', category: 'Dates' },
  { key: 'engineer', label: 'Engineer', category: 'Engineer' },
  { key: 'result', label: 'Result', category: 'Inspection result' },
  { key: 'defects', label: 'Outstanding defects', category: 'Inspection result' },
];

const DEFAULT_SECTIONS = [
  'Executive summary',
  'KPI cards',
  'Charts and visualisations',
  'Data table',
  'Site photos',
  'Faults and advice notes',
  'Signatures',
];

function createDefaultDraft(): ReportDraft {
  return {
    name: 'Inspection compliance summary',
    description: 'Summary of inspection completion rates, compliance status and outstanding items.',
    module: 'Inspections',
    reportType: 'Table report',
    audience: 'Private',
    formats: ['PDF', 'Excel', 'Web view'],
    siteFiltering: true,
    fields: REPORT_FIELDS.map(({ key }) => key),
    groupedFields: ['client', 'site'],
    moduleFilter: 'All modules',
    resultFilter: 'All results',
    overdueOnly: false,
    includeArchived: false,
    sortField: 'inspectionDate',
    sortDirection: 'Descending',
    pageSize: 'A4',
    orientation: 'Portrait',
    margins: 'Normal',
    pageNumbers: true,
    customerLogo: true,
    organisationLogo: true,
    accent: '#1473e6',
    sections: [...DEFAULT_SECTIONS],
    charts: ['Bar chart', 'Trend line', 'Pie / donut', 'Pass / fail widget'],
    subtitle: 'Survey of inspections, pass rates and outstanding items',
    footer: 'Confidential - for authorised use only',
    disclaimer: 'This report is generated from OhmAudit inspection data.',
    scheduleEnabled: false,
    frequency: 'Weekly',
    scheduleDay: 'Monday',
    scheduleTime: '09:00',
    recipients: '',
    emailSubject: 'Inspection compliance summary - {{date}}',
    attachAs: 'PDF',
    visibility: 'Private',
    guestLinks: false,
    linkExpiry: '30 days',
    watermark: true,
    versionHistory: true,
  };
}

@Component({
  selector: 'oa-report-builder',
  templateUrl: './report-builder.component.html',
  styleUrl: './report-builder.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportBuilderComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  private readonly storageKey = `ohmaudit.report-definitions.${this.organisationId}`;

  protected readonly fields = REPORT_FIELDS;
  protected readonly categories = [...new Set(REPORT_FIELDS.map(({ category }) => category))];
  protected readonly steps: Array<{ number: BuilderStep; label: string; detail: string }> = [
    { number: 1, label: 'Setup', detail: 'Basic details' },
    { number: 2, label: 'Data & fields', detail: 'Select and configure' },
    { number: 3, label: 'Layout', detail: 'Design your report' },
    { number: 4, label: 'Share & export', detail: 'Set permissions' },
    { number: 5, label: 'Review', detail: 'Check and create' },
  ];
  protected readonly modules: ReportModule[] = [
    'Jobs',
    'Inspections',
    'RAMS',
    'Assets',
    'Clients & Sites',
  ];
  protected readonly reportTypes: ReportDraft['reportType'][] = [
    'Table report',
    'Summary dashboard',
    'Certificate pack',
    'Compliance report',
  ];
  protected readonly outputs: ReportFormat[] = ['PDF', 'Excel', 'CSV', 'Web view'];
  protected readonly sectionOptions = [...DEFAULT_SECTIONS, 'Appendices'];
  protected readonly chartOptions = [
    'Bar chart',
    'Trend line',
    'Pie / donut',
    'Pass / fail widget',
  ];

  protected readonly view = signal<'directory' | 'builder'>('directory');
  protected readonly activeStep = signal<BuilderStep>(1);
  protected readonly furthestStep = signal<BuilderStep>(1);
  protected readonly editingId = signal<string | null>(null);
  protected readonly draft = signal<ReportDraft>(createDefaultDraft());
  protected readonly inspections = signal<InspectionSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly ownerName = signal('Current user');
  protected readonly ownerInitials = signal('CU');
  protected readonly organisationName = signal('Your organisation');
  protected readonly search = signal('');
  protected readonly moduleFilter = signal('All modules');
  protected readonly statusFilter = signal('All statuses');
  protected readonly sortOrder = signal('newest');
  protected readonly openMenu = signal<string | null>(null);
  protected readonly reports = signal<ReportItem[]>([]);

  protected readonly dataRows = computed<PreviewRow[]>(() =>
    this.inspections().map((inspection) => {
      const latestRevision = inspection.revisions.at(-1);
      const signature =
        latestRevision?.signatures?.[0] ?? latestRevision?.signatureSourceRevision?.signatures[0];
      return {
        client: inspection.customer.name,
        site: inspection.site.name,
        asset: inspection.asset?.displayName ?? inspection.inspectionType,
        inspectionDate: this.formatDate(
          inspection.approvedAt ?? inspection.submittedAt ?? inspection.visit?.scheduledStart,
        ),
        engineer: signature?.signerName ?? 'Assigned engineer',
        result: inspection.status === 'APPROVED' ? 'Compliant' : 'Non-compliant',
        defects: inspection.defects.filter(({ status }) => status !== 'CLOSED').length,
      };
    }),
  );

  protected readonly filteredRows = computed(() => {
    const draft = this.draft();
    return this.dataRows().filter(
      (row) =>
        (draft.resultFilter === 'All results' || row.result === draft.resultFilter) &&
        (!draft.overdueOnly || row.defects > 0),
    );
  });

  protected readonly previewRows = computed(() => this.filteredRows().slice(0, 6));
  protected readonly selectedFields = computed(() =>
    this.draft().fields.flatMap((key) => {
      const field = REPORT_FIELDS.find((candidate) => candidate.key === key);
      return field ? [field] : [];
    }),
  );
  protected readonly complianceRate = computed(() => {
    const rows = this.filteredRows();
    if (rows.length === 0) return 0;
    return Math.round(
      (rows.filter(({ result }) => result === 'Compliant').length / rows.length) * 100,
    );
  });
  protected readonly outstandingDefects = computed(() =>
    this.filteredRows().reduce((total, row) => total + row.defects, 0),
  );
  protected readonly filteredReports = computed(() => {
    const query = this.search().trim().toLowerCase();
    const moduleName = this.moduleFilter();
    const status = this.statusFilter();
    const direction = this.sortOrder() === 'oldest' ? 1 : -1;
    return this.reports()
      .filter(
        (report) =>
          (!query ||
            `${report.name} ${report.description} ${report.module} ${report.owner}`
              .toLowerCase()
              .includes(query)) &&
          (moduleName === 'All modules' || report.module === moduleName) &&
          (status === 'All statuses' || report.status === status),
      )
      .sort((first, second) => (first.timestamp - second.timestamp) * direction);
  });
  protected readonly scheduledCount = computed(
    () => this.reports().filter(({ draft }) => draft.scheduleEnabled).length,
  );
  protected readonly scheduledReports = computed(() =>
    this.reports().filter(({ draft }) => draft.scheduleEnabled),
  );
  protected readonly recentRunCount = computed(
    () =>
      this.inspections().filter(({ revisions }) =>
        revisions.some(({ documents }) => documents?.length),
      ).length,
  );

  constructor() {
    this.reports.set(this.readReports());
    void this.load();
  }

  protected startReport(template?: Partial<ReportDraft>): void {
    this.draft.set({ ...createDefaultDraft(), ...template });
    this.editingId.set(null);
    this.activeStep.set(1);
    this.furthestStep.set(1);
    this.notice.set('');
    this.view.set('builder');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected editReport(report: ReportItem): void {
    this.draft.set(structuredClone(report.draft));
    this.editingId.set(report.id);
    this.activeStep.set(1);
    this.furthestStep.set(5);
    this.openMenu.set(null);
    this.view.set('builder');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected duplicateReport(report: ReportItem): void {
    this.startReport({ ...structuredClone(report.draft), name: `${report.name} copy` });
  }

  protected closeBuilder(): void {
    this.view.set('directory');
    this.openMenu.set(null);
    this.notice.set('');
  }

  protected goToStep(step: BuilderStep): void {
    if (step > this.furthestStep()) return;
    this.activeStep.set(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected nextStep(): void {
    if (!this.stepValid()) {
      this.notice.set('Add a report name before continuing.');
      return;
    }
    const next = Math.min(5, this.activeStep() + 1) as BuilderStep;
    this.furthestStep.update((current) => Math.max(current, next) as BuilderStep);
    this.activeStep.set(next);
    this.notice.set('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected previousStep(): void {
    this.activeStep.set(Math.max(1, this.activeStep() - 1) as BuilderStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected setText(key: keyof ReportDraft, event: Event): void {
    this.patchDraft({ [key]: (event.target as HTMLInputElement | HTMLTextAreaElement).value });
  }

  protected setSelect(key: keyof ReportDraft, event: Event): void {
    this.patchDraft({ [key]: (event.target as HTMLSelectElement).value });
  }

  protected setBoolean(key: keyof ReportDraft, event: Event): void {
    this.patchDraft({ [key]: (event.target as HTMLInputElement).checked });
  }

  protected chooseModule(module: ReportModule): void {
    this.patchDraft({ module });
  }

  protected chooseReportType(reportType: ReportDraft['reportType']): void {
    this.patchDraft({ reportType });
  }

  protected chooseAudience(audience: ReportDraft['audience']): void {
    this.patchDraft({ audience });
  }

  protected prioritizeFormat(format: ReportFormat): void {
    this.patchDraft({
      formats: [format, ...this.draft().formats.filter((item) => item !== format)],
    });
  }

  protected toggleList(
    key: 'formats' | 'fields' | 'groupedFields' | 'sections' | 'charts',
    value: string,
  ): void {
    const current = this.draft()[key] as string[];
    if (key === 'fields' && REPORT_FIELDS.find((field) => field.key === value)?.required) return;
    this.patchDraft({
      [key]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  }

  protected fieldEnabled(key: string): boolean {
    return this.draft().fields.includes(key);
  }

  protected categoryFields(category: string): ReportField[] {
    return REPORT_FIELDS.filter((field) => field.category === category);
  }

  protected moveField(index: number, direction: -1 | 1): void {
    const fields = [...this.draft().fields];
    const destination = index + direction;
    if (destination < 0 || destination >= fields.length) return;
    [fields[index], fields[destination]] = [fields[destination]!, fields[index]!];
    this.patchDraft({ fields });
  }

  protected applyTemplate(kind: 'compliance' | 'assets' | 'rams' | 'clients'): void {
    const templates: Record<string, Partial<ReportDraft>> = {
      compliance: createDefaultDraft(),
      assets: {
        name: 'Asset service due report',
        description: 'Assets due for service in the next 30 days.',
        module: 'Assets',
        reportType: 'Table report',
      },
      rams: {
        name: 'RAMS issue register',
        description: 'Open and closed RAMS issues across all sites.',
        module: 'RAMS',
        reportType: 'Compliance report',
      },
      clients: {
        name: 'Client inspection trends',
        description: 'Inspection activity and trends grouped by client.',
        module: 'Clients & Sites',
        reportType: 'Summary dashboard',
      },
    };
    this.draft.update((draft) => ({ ...draft, ...templates[kind] }));
  }

  protected saveReport(status: ReportStatus = 'Draft', close = false): void {
    if (!this.stepValid()) {
      this.notice.set('A report name is required before saving.');
      return;
    }
    const draft = structuredClone(this.draft());
    const existingId = this.editingId();
    const id = existingId ?? crypto.randomUUID();
    const now = Date.now();
    const item: ReportItem = {
      id,
      name: draft.name.trim(),
      description: draft.description.trim() || 'Custom organisation report.',
      module: draft.module === 'Clients & Sites' ? 'Inspections' : draft.module,
      lastRun: existingId
        ? (this.reports().find((report) => report.id === existingId)?.lastRun ?? 'Not run yet')
        : 'Not run yet',
      timestamp: now,
      format: draft.formats[0] ?? 'PDF',
      status,
      owner: this.ownerName(),
      initials: this.ownerInitials(),
      draft,
    };
    this.reports.update((reports) => [item, ...reports.filter((report) => report.id !== id)]);
    this.editingId.set(id);
    this.persistReports();
    this.notice.set(status === 'Published' ? 'Report published.' : 'Draft saved locally.');
    if (close) this.closeBuilder();
  }

  protected async runReport(report: ReportItem): Promise<void> {
    this.openMenu.set(null);
    if (report.documentId) {
      try {
        const blob = await this.api.downloadDocumentPdf(this.organisationId, report.documentId);
        this.openBlob(blob);
        this.markRun(report.id);
      } catch (error) {
        this.notice.set(error instanceof Error ? error.message : 'The report could not be opened.');
      }
      return;
    }
    this.draft.set(structuredClone(report.draft));
    this.exportCsv(report.name);
    this.markRun(report.id);
  }

  protected exportCurrent(format: ReportFormat): void {
    if (format === 'CSV' || format === 'Excel') {
      this.exportCsv(this.draft().name);
      if (format === 'Excel') {
        this.notice.set(
          'Excel generation is not available yet, so CSV-compatible data was downloaded.',
        );
      }
      return;
    }
    if (format === 'PDF') {
      window.print();
      return;
    }
    this.activeStep.set(3);
    this.furthestStep.update((current) => Math.max(current, 3) as BuilderStep);
  }

  protected async copyShareLink(): Promise<void> {
    const link = `${location.origin}${location.pathname}?report=${encodeURIComponent(this.editingId() ?? 'draft')}`;
    try {
      await navigator.clipboard.writeText(link);
      this.notice.set(
        'Share link copied. Report access remains local until sharing APIs are available.',
      );
    } catch {
      this.notice.set(link);
    }
  }

  protected importTemplate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void file
      .text()
      .then((contents) => {
        const imported = JSON.parse(contents) as Partial<ReportDraft>;
        this.startReport(imported);
        this.notice.set('Template imported. Review the settings before saving.');
      })
      .catch(() => this.notice.set('The selected template could not be read.'))
      .finally(() => (input.value = ''));
  }

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected updateModule(event: Event): void {
    this.moduleFilter.set((event.target as HTMLSelectElement).value);
  }

  protected updateStatus(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
  }

  protected updateSort(event: Event): void {
    this.sortOrder.set((event.target as HTMLSelectElement).value);
  }

  protected toggleMenu(id: string): void {
    this.openMenu.update((current) => (current === id ? null : id));
  }

  protected stepValid(): boolean {
    return this.draft().name.trim().length > 0;
  }

  protected fieldLabel(key: string): string {
    return REPORT_FIELDS.find((field) => field.key === key)?.label ?? key;
  }

  protected nextStepLabel(): string {
    return this.steps[this.activeStep()]?.label.toLowerCase() ?? 'next step';
  }

  protected valueFor(row: PreviewRow, field: string): string | number {
    return row[field] ?? '-';
  }

  protected patchDraft(patch: Partial<ReportDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...patch }));
  }

  private async load(): Promise<void> {
    try {
      const [account, inspectionResult] = await Promise.all([
        this.api.currentUser(),
        this.api.listInspections(this.organisationId),
      ]);
      const membership = account.memberships.find(
        ({ organisation }) => organisation.id === this.organisationId,
      );
      const displayName = account.user.displayName?.trim() || account.user.email;
      this.ownerName.set(displayName);
      this.ownerInitials.set(this.initials(displayName));
      this.organisationName.set(membership?.organisation.name ?? 'Your organisation');
      this.inspections.set(inspectionResult.inspections);
      const systemReports = this.systemReports(inspectionResult.inspections, displayName);
      this.reports.update((reports) => [
        ...systemReports,
        ...reports.filter((report) => !systemReports.some(({ id }) => id === report.id)),
      ]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Report data could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  private readReports(): ReportItem[] {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null');
      if (Array.isArray(value) && value.length > 0) return value as ReportItem[];
    } catch {
      // Seed examples remain available if browser storage is blocked or invalid.
    }
    const examples: Array<{
      name: string;
      description: string;
      module: ReportItem['module'];
      format: ReportFormat;
      status: ReportStatus;
    }> = [
      {
        name: 'EV inspection compliance summary',
        description: 'Summary of EV inspections, pass rates and outstanding items.',
        module: 'Inspections',
        format: 'PDF',
        status: 'Published',
      },
      {
        name: 'Asset service due report',
        description: 'Assets due for service in the next 30 days.',
        module: 'Assets',
        format: 'Excel',
        status: 'Published',
      },
      {
        name: 'RAMS issue register',
        description: 'Open and closed RAMS issues across all sites.',
        module: 'RAMS',
        format: 'PDF',
        status: 'Template',
      },
      {
        name: 'Open remedials by client',
        description: 'All open remedial actions grouped by client.',
        module: 'Jobs',
        format: 'PDF',
        status: 'Draft',
      },
    ];
    return examples.map((example, index) => ({
      id: `example-${index}`,
      ...example,
      lastRun: 'Example data',
      timestamp: Date.now() - index * 86_400_000,
      owner: 'OhmAudit example',
      initials: 'OA',
      placeholder: true,
      draft: {
        ...createDefaultDraft(),
        name: example.name,
        description: example.description,
        module: example.module,
        formats: [example.format],
      },
    }));
  }

  private persistReports(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.reports()));
    } catch {
      this.notice.set('The report is available for this session but could not be stored locally.');
    }
  }

  private markRun(id: string): void {
    const now = Date.now();
    this.reports.update((reports) =>
      reports.map((report) =>
        report.id === id
          ? { ...report, timestamp: now, lastRun: new Date(now).toLocaleString('en-GB') }
          : report,
      ),
    );
    this.persistReports();
  }

  private exportCsv(name: string): void {
    const fields = this.selectedFields();
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [
      fields.map(({ label }) => escape(label)).join(','),
      ...this.filteredRows().map((row) =>
        fields.map(({ key }) => escape(this.valueFor(row, key))).join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${
      name
        .trim()
        .replaceAll(/[^a-z0-9]+/giu, '-')
        .replaceAll(/^-|-$/gu, '') || 'report'
    }.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  private systemReports(inspections: InspectionSummary[], owner: string): ReportItem[] {
    const reports = new Map<string, ReportItem>();
    for (const inspection of inspections) {
      for (const revision of inspection.revisions) {
        for (const document of revision.documents ?? []) {
          if (reports.has(document.id)) continue;
          const createdAt = Date.parse(document.issuedAt ?? document.createdAt);
          const draft = {
            ...createDefaultDraft(),
            name: document.title,
            description: `${inspection.customer.name} · ${inspection.site.name} · ${document.category}`,
            module: 'Inspections' as const,
            formats: ['PDF' as const],
          };
          reports.set(document.id, {
            id: `document-${document.id}`,
            documentId: document.id,
            name: document.title,
            description: draft.description,
            module: 'Inspections',
            lastRun: Number.isNaN(createdAt)
              ? 'Issued report'
              : new Date(createdAt).toLocaleString('en-GB'),
            timestamp: Number.isNaN(createdAt) ? 0 : createdAt,
            format: 'PDF',
            status: 'Published',
            owner,
            initials: this.initials(owner),
            draft,
          });
        }
      }
    }
    return [...reports.values()];
  }

  private openBlob(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  private formatDate(value?: string): string {
    if (!value) return 'Not recorded';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }

  private initials(value: string): string {
    return value
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }
}
