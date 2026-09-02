import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, type InspectionSummary } from '../core/api.service';

type ProposedChange = NonNullable<InspectionSummary['proposedAssetChanges']>[number];
type ReviewSection = 'overview' | 'tests' | 'evidence' | 'updates' | 'history';
type FieldType = 'text' | 'number' | 'select' | 'supply';

interface ChangeField {
  path: string;
  section: string;
  label: string;
  current: unknown;
  proposed: unknown;
  type: FieldType;
  options?: Array<{ value: string; label: string }>;
}

interface ChangeDecision {
  selected: Record<string, boolean>;
  values: Record<string, unknown>;
}

interface DefectDraft {
  id: string;
  title: string;
  description: string;
  severity: 'ADVISORY' | 'MINOR' | 'MAJOR' | 'DANGEROUS';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
  photoMediaIds: string[];
}

interface OverrideDraft {
  reason: string;
  data: Record<string, unknown>;
  evData?: {
    stableDetails: Record<string, unknown>;
    supplyTests: unknown[];
    connectorTests: unknown[];
    functionalChecks: Record<string, unknown>;
    engineerObservations?: string;
  };
  defects: DefectDraft[];
}

@Component({
  selector: 'oa-inspection-review',
  imports: [RouterLink],
  templateUrl: './inspection-review.component.html',
  styleUrls: ['./operations.css', './inspection-review.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectionReviewComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  private readonly reviewId = this.route.snapshot.paramMap.get('reviewId') ?? '';
  protected readonly capabilities = signal<string[]>([]);
  protected readonly canApprove = computed(() =>
    this.capabilities().includes('inspections.approve'),
  );
  protected readonly canIssueCertificates = computed(() =>
    this.capabilities().includes('certificates.issue'),
  );
  protected readonly canIssueThermalReports = computed(() =>
    this.capabilities().includes('thermal.reports.issue'),
  );
  protected readonly canManageAssets = computed(() =>
    this.capabilities().includes('assets.manage'),
  );
  protected readonly inspections = signal<InspectionSummary[]>([]);
  protected readonly selectedId = signal('');
  protected readonly inspection = signal<InspectionSummary | undefined>(undefined);
  protected readonly activeSection = signal<ReviewSection>('overview');
  protected readonly unitSearch = signal('');
  protected readonly overrideDraft = signal<OverrideDraft | undefined>(undefined);
  protected readonly reportReference = signal('');
  protected readonly overallOutcome = signal('');
  protected readonly decisions = signal<Record<string, ChangeDecision>>({});
  protected readonly imageUrls = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly loadingDetail = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly connectorChecks = [
    { key: 'pePreTest', label: 'PE pre-test' },
    { key: 'cpError', label: 'CP error' },
    { key: 'peError', label: 'PE error' },
    { key: 'cpStates', label: 'CP states' },
  ] as const;
  protected readonly connectorReadings = [
    { key: 'rcd1x0Ms', label: '1× 0° (ms)' },
    { key: 'rcd1x180Ms', label: '1× 180° (ms)' },
    { key: 'rcd5x0Ms', label: '5× 0° (ms)' },
    { key: 'rcd5x180Ms', label: '5× 180° (ms)' },
    { key: 'dcRamp0Ma', label: 'DC ramp 0° (mA)' },
    { key: 'dcRamp180Ma', label: 'DC ramp 180° (mA)' },
  ] as const;

  protected readonly pendingCount = computed(
    () =>
      this.inspections().filter(({ status }) => status === 'SUBMITTED' || status === 'UNDER_REVIEW')
        .length,
  );
  protected readonly approvedCount = computed(
    () => this.inspections().filter(({ status }) => status === 'APPROVED').length,
  );
  protected readonly failedCount = computed(
    () =>
      this.inspections().filter((item) =>
        ['FAIL', 'FAULTS_REPORTED'].includes(this.result(item).toUpperCase()),
      ).length,
  );
  protected readonly visitTitle = computed(
    () => this.inspections()[0]?.visit?.title ?? 'Inspection review',
  );
  protected readonly customerSite = computed(() => {
    const item = this.inspections()[0];
    return item === undefined ? '' : item.customer.name + ' / ' + item.site.name;
  });
  protected readonly filteredInspections = computed(() => {
    const query = this.unitSearch().trim().toLocaleLowerCase('en-GB');
    if (query === '') return this.inspections();
    return this.inspections().filter((item) =>
      [
        item.asset?.assetReference,
        item.asset?.displayName,
        item.asset?.manufacturer,
        item.asset?.model,
        item.asset?.serialNumber,
        item.inspectionType,
      ]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLocaleLowerCase('en-GB').includes(query)),
    );
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeImages());
    void this.loadSession();
  }

  protected async selectInspection(id: string): Promise<void> {
    if (id === this.selectedId() && this.inspection() !== undefined) return;
    this.selectedId.set(id);
    this.loadingDetail.set(true);
    this.error.set('');
    this.overrideDraft.set(undefined);
    this.revokeImages();
    try {
      const detail = (await this.api.getInspection(this.organisationId, id)).inspection;
      this.inspection.set(detail);
      this.initialiseDecisions(detail);
      await this.loadEvidence(detail);
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { inspection: id },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to open this inspection.');
    } finally {
      this.loadingDetail.set(false);
    }
  }

  protected setSection(section: ReviewSection): void {
    this.activeSection.set(section);
  }

  protected setUnitSearch(event: Event): void {
    this.unitSearch.set(this.eventValue(event));
  }

  protected setReportReference(event: Event): void {
    this.reportReference.set(this.eventValue(event).trim());
  }

  protected setOverallOutcome(event: Event): void {
    this.overallOutcome.set(this.eventValue(event));
  }

  private overriding(): { reportReference?: string; overallOutcome?: string } {
    const overallOutcome = this.overallOutcome().trim();
    return {
      ...(this.reportReference() === '' ? {} : { reportReference: this.reportReference() }),
      ...(overallOutcome === '' ? {} : { overallOutcome }),
    };
  }

  protected result(item: InspectionSummary): string {
    return this.scalar(item.revisions[0]?.data?.['outcome'], 'Not recorded');
  }

  protected resultClass(value: unknown): string {
    const result = this.scalar(value).toUpperCase();
    return result === 'PASS' || result === 'NO_ISSUES'
      ? 'pass'
      : result === 'FAIL' || result === 'FAULTS_REPORTED'
        ? 'fail'
        : 'neutral';
  }

  protected thermalTargets(source = this.latest()?.data): Record<string, unknown>[] {
    return this.records(source?.['targets']);
  }

  protected thermalDetails(): Record<string, unknown> {
    return this.record(this.latest()?.data?.['details']);
  }

  protected thermalEquipment(): Record<string, unknown> {
    return this.record(this.latest()?.data?.['equipment']);
  }

  protected targetImageCount(target: Record<string, unknown>): number {
    return Array.isArray(target['imageIds']) ? target['imageIds'].length : 0;
  }

  protected readingFails(value: unknown, maximum: number): boolean {
    return typeof value === 'number' && value > maximum;
  }

  protected latest(item = this.inspection()): InspectionSummary['revisions'][number] | undefined {
    return item?.revisions[0];
  }

  protected supplies(): Record<string, unknown>[] {
    return this.records(this.latest()?.evData?.supplyTests);
  }

  protected connectors(): Record<string, unknown>[] {
    return this.records(this.latest()?.evData?.connectorTests);
  }

  protected generalEntries(): Array<[string, unknown]> {
    const hidden = new Set([
      'outcome',
      'notes',
      'automaticFailureReason',
      'targets',
      'details',
      'equipment',
      'reportType',
    ]);
    return Object.entries(this.latest()?.data ?? {}).filter(([key]) => !hidden.has(key));
  }

  protected display(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'Not recorded';
    if (Array.isArray(value)) return value.map((item) => this.display(item)).join(', ');
    if (typeof value === 'object') return 'Recorded';
    const labels: Record<string, string> = {
      TYPE_B: 'Type B RCD',
      RDC_DD: 'RDC-DD',
      NONE: 'None',
      NOT_TESTED: 'Not tested',
      TNCS: 'TN-C-S',
      TNS: 'TN-S',
    };
    const text =
      typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? value.toString()
          : 'Recorded';
    return labels[text] ?? text.replaceAll('_', ' ');
  }

  protected format(value: string | undefined): string {
    return value
      ? new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value))
      : 'Not recorded';
  }

  protected startOverride(): void {
    const item = this.inspection();
    const revision = this.latest(item);
    if (item === undefined || revision === undefined) return;
    this.overrideDraft.set({
      reason: '',
      data: structuredClone(revision.data),
      ...(revision.evData === null || revision.evData === undefined
        ? {}
        : { evData: structuredClone(revision.evData) }),
      defects: item.defects.map((defect) => ({
        id: defect.id,
        title: defect.title,
        description: defect.description ?? '',
        severity: this.defectSeverity(defect.severity),
        status: this.defectStatus(defect.status),
        photoMediaIds: defect.photoMediaIds ?? [],
      })),
    });
    this.activeSection.set('tests');
  }

  protected cancelOverride(): void {
    this.overrideDraft.set(undefined);
  }

  protected setOverrideReason(event: Event): void {
    this.overrideDraft.update((draft) =>
      draft === undefined ? draft : { ...draft, reason: this.eventValue(event) },
    );
  }

  protected setData(key: string, event: Event): void {
    this.overrideDraft.update((draft) => {
      if (draft === undefined) return draft;
      return { ...draft, data: { ...draft.data, [key]: this.eventValue(event) } };
    });
  }

  protected setObservation(event: Event): void {
    this.overrideDraft.update((draft) => {
      if (draft?.evData === undefined) return draft;
      return {
        ...draft,
        evData: { ...draft.evData, engineerObservations: this.eventValue(event) },
      };
    });
  }

  protected setSupply(index: number, key: string, event: Event, numeric = false): void {
    this.overrideDraft.update((draft) => {
      if (draft?.evData === undefined) return draft;
      const supplies = this.records(draft.evData.supplyTests);
      const current = supplies[index];
      if (current === undefined) return draft;
      supplies[index] = {
        ...current,
        [key]: numeric ? this.eventNumber(event) : this.eventValue(event),
      };
      return { ...draft, evData: { ...draft.evData, supplyTests: supplies } };
    });
  }

  protected setConnector(index: number, key: string, event: Event, numeric = false): void {
    this.overrideDraft.update((draft) => {
      if (draft?.evData === undefined) return draft;
      const connectors = this.records(draft.evData.connectorTests);
      const current = connectors[index];
      if (current === undefined) return draft;
      connectors[index] = {
        ...current,
        [key]: numeric ? this.eventNumber(event) : this.eventValue(event),
      };
      return { ...draft, evData: { ...draft.evData, connectorTests: connectors } };
    });
  }

  protected setDefect(index: number, key: keyof DefectDraft, event: Event): void {
    this.overrideDraft.update((draft) => {
      if (draft === undefined) return draft;
      const defects = structuredClone(draft.defects);
      const defect = defects[index];
      if (defect === undefined) return draft;
      const value = this.eventValue(event);
      if (key === 'severity') defect.severity = this.defectSeverity(value);
      else if (key === 'status') defect.status = this.defectStatus(value);
      else if (key === 'title' || key === 'description') defect[key] = value;
      return { ...draft, defects };
    });
  }

  protected async saveOverride(): Promise<void> {
    const item = this.inspection();
    const draft = this.overrideDraft();
    if (item === undefined || draft === undefined || draft.reason.trim().length < 3) {
      this.error.set('Add a short reason explaining the administrator correction.');
      return;
    }
    await this.run(async () => {
      await this.api.overrideInspection(this.organisationId, item.id, {
        reason: draft.reason.trim(),
        data: draft.data,
        ...(draft.evData === undefined ? {} : { evData: draft.evData }),
        defects: draft.defects.map((defect) => ({
          id: defect.id,
          title: defect.title,
          ...(defect.description.trim() === '' ? {} : { description: defect.description }),
          severity: defect.severity,
          status: defect.status,
        })),
      });
      this.success.set('Administrator correction saved as a new audited revision.');
      this.overrideDraft.set(undefined);
      this.reportReference.set('');
      this.overallOutcome.set('');
      await this.refreshSelected();
      await this.refreshSummaries();
    });
  }

  protected changeFields(item: InspectionSummary, change: ProposedChange): ChangeField[] {
    const proposed = this.record(change.proposedData);
    const isNew = proposed['_operation'] === 'CREATE';
    const fields: ChangeField[] = [];
    const add = (
      path: string,
      section: string,
      label: string,
      current: unknown,
      next: unknown,
      type: FieldType = 'text',
      options?: Array<{ value: string; label: string }>,
    ) => {
      if (!isNew && this.blank(next) && !this.blank(current)) return;
      if (this.comparable(current) === this.comparable(next)) return;
      fields.push({
        path,
        section,
        label,
        current,
        proposed: next,
        type,
        ...(options === undefined ? {} : { options }),
      });
    };
    const asset = this.record(proposed['asset']);
    const chargePoint = this.record(proposed['chargePoint']);
    add(
      'asset.assetReference',
      'Charger identity',
      'Asset reference',
      isNew ? undefined : item.asset?.assetReference,
      asset['assetReference'],
    );
    add(
      'asset.displayName',
      'Charger identity',
      'Display name',
      isNew ? undefined : item.asset?.displayName,
      asset['displayName'],
    );
    add(
      'asset.manufacturer',
      'Charger identity',
      'Manufacturer',
      isNew ? undefined : item.asset?.manufacturer,
      asset['manufacturer'],
    );
    add(
      'asset.model',
      'Charger identity',
      'Model',
      isNew ? undefined : item.asset?.model,
      asset['model'],
    );
    add(
      'asset.serialNumber',
      'Charger identity',
      'Serial number',
      isNew ? undefined : item.asset?.serialNumber,
      asset['serialNumber'],
    );
    add(
      'chargePoint.maximumPowerKw',
      'Charger identity',
      'Maximum power (kW)',
      isNew ? undefined : item.asset?.evChargePoint?.maximumPowerKw,
      chargePoint['maximumPowerKw'],
      'number',
    );
    add(
      'chargePoint.dcRcdType',
      'Charger identity',
      'DC protection',
      isNew ? undefined : item.asset?.evChargePoint?.dcRcdType,
      chargePoint['dcRcdType'],
      'select',
      [
        { value: 'TYPE_B', label: 'Type B RCD' },
        { value: 'RDC_DD', label: 'RDC-DD' },
        { value: 'NONE', label: 'None' },
      ],
    );

    const currentSupplies = new Map(
      (item.asset?.evChargePoint?.supplies ?? []).map((supply) => [supply.id, supply]),
    );
    const proposedSupplies = this.records(proposed['supplies']);
    const supplyOptions = proposedSupplies.map((supply, index) => ({
      value: this.scalar(supply['id']),
      label: this.scalar(supply['label'], 'Supply ' + (index + 1)),
    }));
    for (const [index, supply] of proposedSupplies.entries()) {
      const current = currentSupplies.get(this.scalar(supply['id']));
      const section = 'Supply ' + this.scalar(supply['label'], String(index + 1));
      add('supplies.' + index + '.label', section, 'Name', current?.label, supply['label']);
      add(
        'supplies.' + index + '.phaseCount',
        section,
        'Phases',
        current?.phaseCount,
        supply['phaseCount'],
        'number',
      );
      add(
        'supplies.' + index + '.protectiveDeviceType',
        section,
        'Protective device',
        current?.protectiveDeviceType,
        supply['protectiveDeviceType'],
        'select',
        [
          { value: 'MCB', label: 'MCB' },
          { value: 'RCBO', label: 'RCBO' },
          { value: 'AFDD', label: 'AFDD' },
        ],
      );
      add(
        'supplies.' + index + '.protectiveDeviceRating',
        section,
        'Device rating (A)',
        current?.protectiveDeviceRating,
        supply['protectiveDeviceRating'],
        'number',
      );
      add(
        'supplies.' + index + '.earthingArrangement',
        section,
        'Earthing',
        current?.earthingArrangement,
        supply['earthingArrangement'],
        'select',
        [
          { value: 'TNCS', label: 'TN-C-S' },
          { value: 'TNS', label: 'TN-S' },
          { value: 'TT', label: 'TT' },
          { value: 'IT', label: 'IT' },
        ],
      );
    }

    const currentConnectors = new Map(
      (item.asset?.evChargePoint?.connectors ?? []).map((connector) => [connector.id, connector]),
    );
    for (const [index, connector] of this.records(proposed['connectors']).entries()) {
      const current = currentConnectors.get(this.scalar(connector['id']));
      const section = 'Connector ' + this.scalar(connector['label'], String(index + 1));
      add('connectors.' + index + '.label', section, 'Number', current?.label, connector['label']);
      add(
        'connectors.' + index + '.connectorType',
        section,
        'Connector type',
        current?.connectorType,
        connector['connectorType'],
      );
      add(
        'connectors.' + index + '.supplyIds',
        section,
        'Supplied by',
        current?.supplyMappings.map(({ supplyId }) => supplyId) ?? [],
        this.array(connector['supplyIds']),
        'supply',
        supplyOptions,
      );
    }
    return fields;
  }

  protected sectionNames(fields: ChangeField[]): string[] {
    return [...new Set(fields.map(({ section }) => section))];
  }

  protected fieldsForSection(fields: ChangeField[], section: string): ChangeField[] {
    return fields.filter((field) => field.section === section);
  }

  protected hasEffectiveChanges(item: InspectionSummary, change: ProposedChange): boolean {
    return this.changeFields(item, change).length > 0;
  }

  protected pendingAssetChangeCount(item: InspectionSummary): number {
    return item.proposedAssetChanges?.filter(({ status }) => status === 'PENDING').length ?? 0;
  }

  protected decisionSelected(changeId: string, path: string): boolean {
    return this.decisions()[changeId]?.selected[path] ?? true;
  }

  protected decisionValue(changeId: string, path: string): unknown {
    return this.decisions()[changeId]?.values[path];
  }

  protected toggleDecision(changeId: string, path: string, event: Event): void {
    const selected = (event.target as HTMLInputElement).checked;
    this.decisions.update((all) => {
      const decision = all[changeId] ?? { selected: {}, values: {} };
      return {
        ...all,
        [changeId]: {
          ...decision,
          selected: { ...decision.selected, [path]: selected },
        },
      };
    });
  }

  protected setDecisionValue(changeId: string, path: string, event: Event, type: FieldType): void {
    let value: unknown = type === 'number' ? this.eventNumber(event) : this.eventValue(event);
    if (type === 'supply') value = value === '' ? [] : [value];
    this.decisions.update((all) => {
      const decision = all[changeId] ?? { selected: {}, values: {} };
      return {
        ...all,
        [changeId]: {
          ...decision,
          values: { ...decision.values, [path]: value },
        },
      };
    });
  }

  protected async reviewAssetChange(change: ProposedChange, approved: boolean): Promise<void> {
    const item = this.inspection();
    if (item === undefined || change.status !== 'PENDING') return;
    if (approved && !this.hasEffectiveChanges(item, change)) return;
    const verb = approved ? 'apply the selected asset updates' : 'reject all proposed updates';
    if (!confirm('Are you sure you want to ' + verb + '?')) return;
    await this.run(async () => {
      const result = await this.api.reviewProposedAssetChange(
        this.organisationId,
        change.id,
        approved,
        approved ? this.resolveChange(item, change) : undefined,
      );
      try {
        await this.reconcileReviewState(item.id);
      } finally {
        // The mutation response is authoritative. An immediate Hyperdrive read can briefly
        // return the previous row version, so apply it after reconciliation as well.
        this.patchAssetChangeState(item.id, change.id, result.change.status);
      }
      this.success.set(approved ? 'Selected asset updates applied.' : 'Asset updates rejected.');
    });
  }

  protected async reviewInspection(approved: boolean): Promise<void> {
    const item = this.inspection();
    if (item === undefined) return;
    const pendingChanges =
      item.proposedAssetChanges?.filter(({ status }) => status === 'PENDING').length ?? 0;
    const warning =
      approved && pendingChanges > 0
        ? ' There are still pending asset updates; they will remain unapplied.'
        : '';
    if (
      !confirm(
        (approved ? 'Approve this inspection?' : 'Return this inspection to the engineer?') +
          warning,
      )
    )
      return;
    await this.run(async () => {
      const result = await this.api.reviewInspection(this.organisationId, item.id, approved);
      const confirmedStatus = {
        status: result.inspection.status,
        ...(result.inspection.approvedAt === undefined
          ? {}
          : { approvedAt: result.inspection.approvedAt }),
      };
      try {
        await this.reconcileReviewState(item.id);
      } finally {
        // Keep the confirmed POST result visible even if a read immediately after the write is
        // served from a connection that has not observed the committed transaction yet.
        this.patchInspectionState(item.id, confirmedStatus);
      }
      this.success.set(approved ? 'Inspection approved.' : 'Inspection returned to the engineer.');
    });
  }

  protected async downloadCertificate(): Promise<void> {
    const item = this.inspection();
    if (item === undefined || item.status !== 'APPROVED') return;
    await this.run(async () => {
      const document =
        this.latest(item)?.documents?.[0] ??
        (await this.api.issueInspectionDocument(this.organisationId, item.id, this.overriding()))
          .document;
      const blob = await this.api.downloadDocumentPdf(this.organisationId, document.id);
      this.saveBlob(
        blob,
        this.fileName(
          item.moduleKey === 'thermal-imaging'
            ? `${item.site.name} thermal imaging report.pdf`
            : `${item.asset?.assetReference || item.asset?.displayName || 'EV charger'} certificate.pdf`,
        ),
      );
      this.success.set(
        item.moduleKey === 'thermal-imaging'
          ? 'Thermal report downloaded.'
          : 'Certificate downloaded.',
      );
      await this.refreshSelected();
    });
  }

  protected async previewThermalReport(): Promise<void> {
    const item = this.inspection();
    if (item === undefined || item.moduleKey !== 'thermal-imaging' || item.status !== 'APPROVED')
      return;
    const previewWindow = window.open('about:blank', '_blank');
    if (previewWindow !== null) previewWindow.opener = null;
    await this.run(async () => {
      try {
        const document =
          this.latest(item)?.documents?.[0] ??
          (await this.api.issueInspectionDocument(this.organisationId, item.id, this.overriding()))
            .document;
        const blob = await this.api.previewDocumentHtml(this.organisationId, document.id);
        const url = URL.createObjectURL(blob);
        if (previewWindow === null) window.open(url, '_blank', 'noopener,noreferrer');
        else previewWindow.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
        this.success.set('Thermal report preview opened.');
        await this.refreshSelected();
      } catch (error: unknown) {
        previewWindow?.close();
        throw error;
      }
    });
  }

  protected async downloadVisitPack(): Promise<void> {
    const visitId = this.inspections()[0]?.visit?.id;
    if (visitId === undefined || this.approvedCount() === 0) return;
    await this.run(async () => {
      const issued = await this.api.issueVisitDocuments(this.organisationId, visitId);
      if (issued.documents.length === 0)
        throw new Error('Approve at least one inspection before downloading the job pack.');
      const blob = await this.api.downloadVisitReportPdf(this.organisationId, visitId);
      this.saveBlob(blob, this.fileName(`${this.visitTitle()} combined report.pdf`));
      this.success.set(
        `${issued.documents.length} certificate${issued.documents.length === 1 ? '' : 's'} downloaded as one PDF.`,
      );
      await this.refreshSelected();
      await this.refreshSummaries();
    });
  }

  protected imageUrl(mediaId: string): string {
    return this.imageUrls()[mediaId] ?? '';
  }

  protected selectedSupplyValue(value: unknown): string {
    return this.scalar(this.array(value)[0]);
  }

  protected overrideSupplies(draft: OverrideDraft): Record<string, unknown>[] {
    return this.records(draft.evData?.supplyTests);
  }

  protected overrideConnectors(draft: OverrideDraft): Record<string, unknown>[] {
    return this.records(draft.evData?.connectorTests);
  }

  private async loadSession(): Promise<void> {
    await this.run(async () => {
      const [account, all] = await Promise.all([
        this.api.currentUser(),
        this.api.listInspections(this.organisationId),
      ]);
      const membership = account.memberships.find(
        (item) => item.organisation.id === this.organisationId,
      );
      this.capabilities.set(membership?.role.capabilities ?? []);
      const session = all.inspections
        .filter((item) => item.visit?.id === this.reviewId || item.id === this.reviewId)
        .sort((left, right) =>
          (left.asset?.assetReference ?? left.inspectionType).localeCompare(
            right.asset?.assetReference ?? right.inspectionType,
            'en-GB',
            { numeric: true },
          ),
        );
      this.inspections.set(session);
      if (session.length === 0) throw new Error('No inspections were found for this review.');
      const requested = this.route.snapshot.queryParamMap.get('inspection');
      const initial =
        session.find(({ id }) => id === requested) ??
        session.find(({ status }) => status === 'SUBMITTED' || status === 'UNDER_REVIEW') ??
        session[0];
      if (initial !== undefined) await this.selectInspection(initial.id);
    });
  }

  private async refreshSummaries(): Promise<void> {
    const all = (await this.api.listInspections(this.organisationId)).inspections;
    this.inspections.set(
      all
        .filter((item) => item.visit?.id === this.reviewId || item.id === this.reviewId)
        .sort((left, right) =>
          (left.asset?.assetReference ?? left.inspectionType).localeCompare(
            right.asset?.assetReference ?? right.inspectionType,
            'en-GB',
            { numeric: true },
          ),
        ),
    );
  }

  private async refreshSelected(): Promise<void> {
    const id = this.selectedId();
    this.selectedId.set('');
    await this.selectInspection(id);
  }

  private async reconcileReviewState(inspectionId: string): Promise<void> {
    const [detail, all] = await Promise.all([
      this.api.getInspection(this.organisationId, inspectionId),
      this.api.listInspections(this.organisationId),
    ]);
    const session = all.inspections
      .filter((item) => item.visit?.id === this.reviewId || item.id === this.reviewId)
      .sort((left, right) =>
        (left.asset?.assetReference ?? left.inspectionType).localeCompare(
          right.asset?.assetReference ?? right.inspectionType,
          'en-GB',
          { numeric: true },
        ),
      );
    this.inspections.set(session);
    this.inspection.set(detail.inspection);
    this.initialiseDecisions(detail.inspection);
    this.revokeImages();
    await this.loadEvidence(detail.inspection);
  }

  private patchInspectionState(id: string, patch: Partial<InspectionSummary>): void {
    this.inspection.update((item) => (item?.id === id ? { ...item, ...patch } : item));
    this.inspections.update((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  private patchAssetChangeState(inspectionId: string, changeId: string, status: string): void {
    const patch = (item: InspectionSummary): InspectionSummary => {
      if (!item.proposedAssetChanges) return item;
      return {
        ...item,
        proposedAssetChanges: item.proposedAssetChanges.map((change) =>
          change.id === changeId ? { ...change, status } : change,
        ),
      };
    };
    this.inspection.update((item) => (item?.id === inspectionId ? patch(item) : item));
    this.inspections.update((items) =>
      items.map((item) => (item.id === inspectionId ? patch(item) : item)),
    );
  }

  private initialiseDecisions(item: InspectionSummary): void {
    const decisions: Record<string, ChangeDecision> = {};
    for (const change of item.proposedAssetChanges ?? []) {
      const selected: Record<string, boolean> = {};
      const values: Record<string, unknown> = {};
      for (const field of this.changeFields(item, change)) {
        selected[field.path] = true;
        values[field.path] = structuredClone(field.proposed);
      }
      decisions[change.id] = { selected, values };
    }
    this.decisions.set(decisions);
  }

  private resolveChange(item: InspectionSummary, change: ProposedChange): Record<string, unknown> {
    const resolved = structuredClone(change.proposedData);
    const decision = this.decisions()[change.id] ?? { selected: {}, values: {} };
    const fields = this.changeFields(item, change);
    for (const field of fields) {
      const selected = decision.selected[field.path] ?? true;
      this.setPath(resolved, field.path, selected ? decision.values[field.path] : field.current);
    }
    for (const collection of ['supplies', 'connectors'] as const) {
      const rows = this.records(resolved[collection]);
      resolved[collection] = rows.filter((_, index) => {
        const prefix = collection + '.' + index + '.';
        const related = fields.filter(({ path }) => path.startsWith(prefix));
        const isNew = related.length > 0 && related.every(({ current }) => current === undefined);
        return !isNew || related.some(({ path }) => decision.selected[path] ?? true);
      });
    }
    return resolved;
  }

  private setPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> | unknown[] = target;
    for (const [index, part] of parts.entries()) {
      const final = index === parts.length - 1;
      const key = Number.isInteger(Number(part)) ? Number(part) : part;
      if (final) {
        if (value === undefined) {
          if (Array.isArray(current) && typeof key === 'number') current[key] = undefined;
          else if (!Array.isArray(current) && typeof key === 'string') delete current[key];
        } else if (Array.isArray(current) && typeof key === 'number') current[key] = value;
        else if (!Array.isArray(current) && typeof key === 'string') current[key] = value;
        return;
      }
      const next = Array.isArray(current)
        ? current[typeof key === 'number' ? key : -1]
        : current[typeof key === 'string' ? key : ''];
      if (typeof next !== 'object' || next === null) return;
      current = next as Record<string, unknown> | unknown[];
    }
  }

  private async loadEvidence(item: InspectionSummary): Promise<void> {
    const media = item.evidenceMedia ?? [];
    const pairs = await Promise.all(
      media.map(async ({ id }) => {
        const blob = await this.api.downloadMedia(this.organisationId, id);
        return [id, URL.createObjectURL(blob)] as const;
      }),
    );
    this.imageUrls.set(Object.fromEntries(pairs));
  }

  private revokeImages(): void {
    for (const url of Object.values(this.imageUrls())) URL.revokeObjectURL(url);
    this.imageUrls.set({});
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  private fileName(value: string): string {
    return value
      .replace(/[<>:"/\\|?*]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private records(value: unknown): Record<string, unknown>[] {
    return this.array(value).map((item) => this.record(item));
  }

  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private scalar(value: unknown, fallback = ''): string {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : fallback;
  }

  private comparable(value: unknown): string {
    return JSON.stringify(value ?? null);
  }

  private blank(value: unknown): boolean {
    return (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  private eventValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  private eventNumber(event: Event): number | null {
    const value = this.eventValue(event).trim();
    if (value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private defectSeverity(value: string): DefectDraft['severity'] {
    return ['ADVISORY', 'MINOR', 'MAJOR', 'DANGEROUS'].includes(value)
      ? (value as DefectDraft['severity'])
      : 'MINOR';
  }

  private defectStatus(value: string): DefectDraft['status'] {
    return ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'].includes(value)
      ? (value as DefectDraft['status'])
      : 'OPEN';
  }

  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The review action failed.');
    } finally {
      this.busy.set(false);
    }
  }
}
