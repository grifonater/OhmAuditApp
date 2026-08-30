import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ApiService,
  type AssetSummary,
  type JobCategory,
  type OrganisationRamsSummary,
  type RamsSummary,
  type TimelineEvent,
  type VisitDocument,
  type VisitSummary,
  type VisitTask,
} from '../core/api.service';

type JobTab = 'overview' | 'rams' | 'inspections' | 'assets' | 'progress' | 'documents';

function isInspectionTask(
  task: VisitTask,
): task is VisitTask & { inspection: NonNullable<VisitTask['inspection']> } {
  return task.inspection !== undefined;
}

const EVENT_LABELS: Record<string, string> = {
  VisitCreated: 'Job created',
  VisitUpdated: 'Job details updated',
  VisitCertificatesIssued: 'Certificates issued',
  InspectionSubmitted: 'Inspection submitted',
  InspectionApproved: 'Inspection approved',
  InspectionRejected: 'Inspection rejected',
  InspectionSubmissionOverridden: 'Inspection submission overridden',
  CertificateIssued: 'Certificate issued',
  RamsCreated: 'RAMS created',
  RamsUpdated: 'RAMS draft updated',
  RamsSubmitted: 'RAMS submitted for review',
  RamsApproved: 'RAMS approved',
  RamsReturned: 'RAMS returned for changes',
};

@Component({
  selector: 'oa-job-overview',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './job-overview.component.html',
  styleUrls: ['./operations.css', './job-overview.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobOverviewComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly visitId = this.route.snapshot.paramMap.get('visitId') ?? '';
  protected readonly job = signal<VisitSummary | undefined>(undefined);
  protected readonly categories = signal<JobCategory[]>([]);
  protected readonly capabilities = signal<string[]>([]);
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly activeTab = signal<JobTab>('overview');
  protected readonly timelineEvents = signal<TimelineEvent[]>([]);
  protected readonly documents = signal<VisitDocument[]>([]);
  protected readonly ramsRecords = signal<RamsSummary[]>([]);
  protected readonly showRamsLinker = signal(false);
  protected readonly ramsQuery = signal('');
  protected readonly availableRams = signal<OrganisationRamsSummary[]>([]);
  protected readonly ramsSearchLoading = signal(false);
  private ramsSearchTimer?: ReturnType<typeof setTimeout>;
  protected readonly progressLoaded = signal(false);
  protected readonly documentsLoaded = signal(false);
  protected readonly progressLoading = signal(false);
  protected readonly documentsLoading = signal(false);
  protected readonly tabs: Array<{ key: JobTab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'rams', label: 'RAMS' },
    { key: 'inspections', label: 'Inspections' },
    { key: 'assets', label: 'Assets' },
    { key: 'progress', label: 'Progress' },
    { key: 'documents', label: 'Documents' },
  ];
  protected readonly canEdit = computed(() => this.capabilities().includes('visits.create'));
  protected readonly canAssign = computed(() => this.capabilities().includes('visits.assign'));
  protected readonly canIssue = computed(() => this.capabilities().includes('certificates.issue'));
  protected readonly canManageRams = computed(() => this.capabilities().includes('rams.manage'));
  protected readonly canGenerate = computed(() =>
    this.capabilities().includes('certificates.generate'),
  );
  protected readonly ramsCandidates = computed(() => {
    const linkedIds = new Set(this.ramsRecords().map(({ id }) => id));
    const siteId = this.job()?.site.id;
    return this.availableRams()
      .filter(({ id }) => !linkedIds.has(id))
      .sort(
        (left, right) =>
          Number(right.visits.some((visit) => visit.site.id === siteId)) -
          Number(left.visits.some((visit) => visit.site.id === siteId)),
      );
  });
  protected readonly linkedAssets = computed(() => {
    const assets = new Map<string, AssetSummary>();
    for (const task of this.job()?.tasks ?? []) {
      if (task.asset) assets.set(task.asset.id, task.asset);
    }
    return [...assets.values()];
  });
  protected readonly assetDetails = computed(() => {
    type JobAsset = NonNullable<VisitTask['asset']>;
    const counts = new Map<string, number>();
    const assets = new Map<string, JobAsset>();
    for (const task of this.job()?.tasks ?? []) {
      if (task.asset === undefined) continue;
      counts.set(task.asset.id, (counts.get(task.asset.id) ?? 0) + 1);
      assets.set(task.asset.id, task.asset);
    }
    return [...assets.values()].map((asset) => ({ asset, taskCount: counts.get(asset.id) ?? 0 }));
  });
  protected readonly inspectionCount = computed(
    () => this.job()?.tasks.filter((task) => task.inspection !== undefined).length ?? 0,
  );
  protected readonly completedTaskCount = computed(
    () => this.job()?.tasks.filter((task) => task.status === 'COMPLETED').length ?? 0,
  );
  protected readonly inspections = computed(() =>
    (this.job()?.tasks ?? [])
      .filter(isInspectionTask)
      .map((task) => ({ task, inspection: task.inspection })),
  );
  protected readonly progressEvents = computed(() =>
    this.timelineEvents().map((event) => ({
      event,
      label: this.eventLabel(event.eventType),
      entity: event.entityType === 'Visit' ? 'Job' : event.entityType,
      actor: event.actor?.displayName || event.actor?.email || '',
      at: this.formatDate(event.occurredAt, true),
      detail: this.eventDetail(event),
    })),
  );
  protected readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    reference: new FormControl('', { nonNullable: true }),
    externalReference: new FormControl('', { nonNullable: true }),
    jobCategoryId: new FormControl('', { nonNullable: true }),
    jobType: new FormControl('', { nonNullable: true }),
    scheduledStart: new FormControl('', { nonNullable: true, validators: Validators.required }),
    scheduledEnd: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    exclusions: new FormControl('', { nonNullable: true }),
    engineerNotes: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    void this.load();
  }

  protected switchTab(tab: JobTab): void {
    this.activeTab.set(tab);
    if (tab === 'progress' && !this.progressLoaded()) void this.loadTimeline();
    if (tab === 'documents' && !this.documentsLoaded()) void this.loadDocuments();
  }

  protected tabCount(tab: JobTab): number | null {
    switch (tab) {
      case 'rams':
        return this.ramsRecords().length;
      case 'inspections':
        return this.inspectionCount();
      case 'assets':
        return this.linkedAssets().length;
      case 'progress':
        return this.progressLoaded() ? this.timelineEvents().length : null;
      case 'documents':
        return this.documentsLoaded() ? this.documents().length : null;
      default:
        return null;
    }
  }

  protected startEditing(): void {
    const job = this.job();
    if (!job || !this.canEdit()) return;
    this.form.setValue({
      title: job.title,
      reference: job.reference ?? '',
      externalReference: job.externalReference ?? '',
      jobCategoryId: job.jobCategoryId ?? '',
      jobType: job.jobType ?? '',
      scheduledStart: this.localDateTime(job.scheduledStart),
      scheduledEnd: job.scheduledEnd ? this.localDateTime(job.scheduledEnd) : '',
      description: job.description ?? '',
      exclusions: job.exclusions ?? '',
      engineerNotes: job.engineerNotes ?? '',
    });
    this.editing.set(true);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || !this.canEdit()) return;
    const value = this.form.getRawValue();
    await this.run(async () => {
      await this.api.updateVisit(this.organisationId, this.visitId, {
        title: value.title,
        reference: value.reference || null,
        externalReference: value.externalReference || null,
        jobCategoryId: value.jobCategoryId || null,
        jobType: value.jobType || null,
        scheduledStart: new Date(value.scheduledStart).toISOString(),
        scheduledEnd: value.scheduledEnd ? new Date(value.scheduledEnd).toISOString() : null,
        description: value.description || null,
        exclusions: value.exclusions || null,
        engineerNotes: value.engineerNotes || null,
      });
      this.editing.set(false);
      await this.loadJob();
      this.notice.set('Job details updated.');
    });
  }

  protected async shareJob(): Promise<void> {
    if (!this.canAssign()) return;
    await this.run(async () => {
      const result = await this.api.createGuestLink(this.organisationId, this.visitId);
      const url = `${location.origin}${result.guestUrl}`;
      await navigator.clipboard.writeText(url);
      this.notice.set('Engineer Job link copied to the clipboard.');
    });
  }

  protected async issueCertificates(): Promise<void> {
    if (!this.canIssue()) return;
    await this.run(async () => {
      await this.api.issueVisitDocuments(this.organisationId, this.visitId);
      this.documentsLoaded.set(false);
      await this.loadDocuments();
      this.notice.set('Certificates issued for all approved inspections.');
    });
  }

  protected async openRamsLinker(): Promise<void> {
    this.showRamsLinker.set(!this.showRamsLinker());
    if (!this.showRamsLinker() || this.availableRams().length > 0) return;
    await this.loadRamsCandidates('', this.job()?.site.id);
  }

  protected searchRams(value: string): void {
    this.ramsQuery.set(value);
    if (this.ramsSearchTimer) clearTimeout(this.ramsSearchTimer);
    this.ramsSearchTimer = setTimeout(
      () =>
        void this.loadRamsCandidates(value.trim(), value.trim() ? undefined : this.job()?.site.id),
      250,
    );
  }

  protected isSameSiteRams(item: OrganisationRamsSummary): boolean {
    const siteId = this.job()?.site.id;
    return siteId !== undefined && item.visits.some((visit) => visit.site.id === siteId);
  }

  protected async linkExistingRams(item: OrganisationRamsSummary): Promise<void> {
    if (!this.canManageRams()) return;
    await this.run(async () => {
      await this.api.linkRamsVisit(this.organisationId, item.id, this.visitId);
      await this.reloadRams();
      this.availableRams.update((items) => items.filter(({ id }) => id !== item.id));
      this.notice.set('RAMS linked to this job.');
    });
  }

  protected async downloadDocument(document: VisitDocument): Promise<void> {
    if (!this.canGenerate()) return;
    await this.run(async () => {
      const blob = await this.api.downloadDocumentPdf(this.organisationId, document.id);
      this.saveBlob(blob, this.slug(document.title) + '.pdf');
    });
  }

  protected async previewDocument(document: VisitDocument): Promise<void> {
    if (!this.canGenerate()) return;
    await this.run(async () => {
      const blob = await this.api.previewDocumentHtml(this.organisationId, document.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  protected async downloadCombinedReport(): Promise<void> {
    if (!this.canGenerate()) return;
    await this.run(async () => {
      const blob = await this.api.downloadVisitReportPdf(this.organisationId, this.visitId);
      const job = this.job();
      this.saveBlob(blob, `${this.slug(job?.reference || job?.title || 'job')}-job-report.pdf`);
    });
  }

  protected formatDate(value: string | undefined, includeTime = false): string {
    if (!value) return 'Not set';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(new Date(value));
  }

  protected statusLabel(status: string): string {
    return status
      .toLocaleLowerCase('en-GB')
      .replaceAll('_', ' ')
      .replace(/^./u, (value) => value.toLocaleUpperCase('en-GB'));
  }

  protected personName(
    person: { displayName?: string | null; email: string } | null | undefined,
  ): string {
    return person?.displayName || person?.email || 'Not recorded';
  }

  protected moduleLabel(moduleKey: string): string {
    return moduleKey === 'ev-charging'
      ? 'EV charging inspection'
      : moduleKey === 'thermal-imaging'
        ? 'Thermal imaging inspection'
        : 'Inspection';
  }

  protected openDefectCount(defects: Array<{ status: string }> | undefined): number {
    return (defects ?? []).filter(
      (defect) => defect.status !== 'RESOLVED' && defect.status !== 'CLOSED',
    ).length;
  }

  protected severityCount(
    defects: Array<{ severity: string }> | undefined,
    severity: string,
  ): number {
    return (defects ?? []).filter((defect) => defect.severity === severity).length;
  }

  protected eventLabel(eventType: string): string {
    return EVENT_LABELS[eventType] ?? eventType.replace(/([A-Z])/gu, ' $1').trim();
  }

  protected eventDetail(event: TimelineEvent): string {
    const revision =
      typeof event.data['revisionNumber'] === 'number' ? event.data['revisionNumber'] : null;
    const issuedCount =
      typeof event.data['issuedCount'] === 'number' ? event.data['issuedCount'] : null;
    if (issuedCount !== null)
      return `${issuedCount} certificate${issuedCount === 1 ? '' : 's'} issued`;
    if (event.eventType.startsWith('Inspection'))
      return revision === null ? '' : `Revision ${revision}`;
    return '';
  }

  private async load(): Promise<void> {
    await this.run(async () => {
      const [account, categories, rams] = await Promise.all([
        this.api.currentUser(),
        this.api.listJobCategories(this.organisationId),
        this.api.listVisitRams(this.organisationId, this.visitId),
      ]);
      this.capabilities.set(
        account.memberships.find((item) => item.organisation.id === this.organisationId)?.role
          .capabilities ?? [],
      );
      this.categories.set(categories.categories);
      this.ramsRecords.set(rams.rams);
      await this.loadJob();
    });
  }

  private async loadJob(): Promise<void> {
    this.job.set((await this.api.getVisit(this.organisationId, this.visitId)).visit);
  }

  private async reloadRams(): Promise<void> {
    this.ramsRecords.set((await this.api.listVisitRams(this.organisationId, this.visitId)).rams);
  }

  private async loadRamsCandidates(search: string, siteId?: string): Promise<void> {
    this.ramsSearchLoading.set(true);
    try {
      this.availableRams.set(
        (
          await this.api.listRams(this.organisationId, {
            ...(search ? { search } : {}),
            ...(siteId === undefined ? {} : { siteId }),
            limit: 30,
          })
        ).rams,
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to search RAMS.');
    } finally {
      this.ramsSearchLoading.set(false);
    }
  }

  protected async loadTimeline(): Promise<void> {
    this.progressLoading.set(true);
    try {
      const { events } = await this.api.timeline(this.organisationId, 'Visit', this.visitId);
      this.timelineEvents.set(events);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load job activity.');
    } finally {
      this.progressLoading.set(false);
      this.progressLoaded.set(true);
    }
  }

  protected async loadDocuments(): Promise<void> {
    this.documentsLoading.set(true);
    try {
      const { documents } = await this.api.listVisitDocuments(this.organisationId, this.visitId);
      this.documents.set(documents);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load documents.');
    } finally {
      this.documentsLoading.set(false);
      this.documentsLoaded.set(true);
    }
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private slug(value: string): string {
    return value
      .toLocaleLowerCase('en-GB')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '');
  }

  private localDateTime(value: string): string {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update the job.');
    } finally {
      this.busy.set(false);
    }
  }
}
