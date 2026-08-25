import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, type InspectionSummary } from '../core/api.service';

interface ChangeRow {
  label: string;
  current: string;
  proposed: string;
  state: 'changed' | 'new';
}

interface ChangeSection {
  title: string;
  rows: ChangeRow[];
}

interface InspectionSession {
  id: string;
  title: string;
  customerName: string;
  siteName: string;
  scheduledStart?: string;
  inspections: InspectionSummary[];
  awaitingReview: number;
  approved: number;
  assetChanges: number;
}

@Component({
  selector: 'oa-inspections',
  templateUrl: './inspections.component.html',
  styleUrls: ['./operations.css', './inspections.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectionsComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly inspections = signal<InspectionSummary[]>([]);
  protected readonly selected = signal<InspectionSummary | undefined>(undefined);
  protected readonly expandedSessionId = signal('');
  protected readonly filter = signal('SUBMITTED');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly sessions = computed<InspectionSession[]>(() => {
    const grouped = new Map<string, InspectionSession>();
    for (const inspection of this.inspections()) {
      const id = inspection.visit?.id ?? `inspection-${inspection.id}`;
      const existing = grouped.get(id) ?? {
        id,
        title: inspection.visit?.title ?? inspection.inspectionType,
        customerName: inspection.customer.name,
        siteName: inspection.site.name,
        ...(inspection.visit?.scheduledStart === undefined
          ? {}
          : { scheduledStart: inspection.visit.scheduledStart }),
        inspections: [],
        awaitingReview: 0,
        approved: 0,
        assetChanges: 0,
      };
      existing.inspections.push(inspection);
      if (inspection.status === 'SUBMITTED' || inspection.status === 'UNDER_REVIEW')
        existing.awaitingReview += 1;
      if (inspection.status === 'APPROVED') existing.approved += 1;
      existing.assetChanges +=
        inspection.proposedAssetChanges?.filter((change) => change.status === 'PENDING').length ??
        0;
      grouped.set(id, existing);
    }
    return [...grouped.values()];
  });
  constructor() {
    void this.load();
  }
  protected async setFilter(value: string): Promise<void> {
    this.filter.set(value);
    await this.load();
  }
  protected async open(id: string): Promise<void> {
    const item = this.inspections().find((inspection) => inspection.id === id);
    const reviewId = item?.visit?.id ?? id;
    await this.router.navigate(
      ['/app/org', this.organisationId, 'inspections', 'review', reviewId],
      { queryParams: { inspection: id } },
    );
  }
  protected async openSession(session: InspectionSession): Promise<void> {
    await this.router.navigate([
      '/app/org',
      this.organisationId,
      'inspections',
      'review',
      session.id,
    ]);
  }
  protected toggleSession(id: string): void {
    this.expandedSessionId.update((current) => (current === id ? '' : id));
    this.selected.set(undefined);
  }
  protected async review(approved: boolean): Promise<void> {
    const item = this.selected();
    if (!item) return;
    await this.run(async () => {
      await this.api.reviewInspection(this.organisationId, item.id, approved);
      this.success.set(approved ? 'Inspection approved' : 'Inspection returned to engineer');
      this.selected.set(undefined);
      await this.load();
    });
  }
  protected async reviewAssetChange(changeId: string, approved: boolean): Promise<void> {
    const item = this.selected();
    if (!item) return;
    const change = item.proposedAssetChanges?.find(({ id }) => id === changeId);
    const isNewAsset = change === undefined ? false : this.isNewAssetChange(change.proposedData);
    await this.run(async () => {
      await this.api.reviewProposedAssetChange(this.organisationId, changeId, approved);
      this.success.set(
        isNewAsset
          ? approved
            ? 'New charger approved and added to the site asset register'
            : 'New charger rejected'
          : approved
            ? 'Engineer asset corrections applied'
            : 'Asset corrections rejected',
      );
      this.selected.set((await this.api.getInspection(this.organisationId, item.id)).inspection);
      await this.load();
    });
  }
  protected async issue(): Promise<void> {
    const item = this.selected();
    if (!item) return;
    await this.run(async () => {
      const result = await this.api.issueInspectionDocument(this.organisationId, item.id);
      this.success.set(`${result.document.title} issued successfully`);
      await this.open(item.id);
    });
  }
  protected async openCertificate(documentId: string): Promise<void> {
    await this.run(async () => {
      const blob = await this.api.downloadDocumentPdf(this.organisationId, documentId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }
  protected format(value: string | undefined): string {
    return value
      ? new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(value))
      : 'Not submitted';
  }
  protected resultEntries(item: InspectionSummary): Array<[string, unknown]> {
    return Object.entries(item.revisions[0]?.data ?? {});
  }
  protected proposedDifferences(
    item: InspectionSummary,
    value: Record<string, unknown>,
  ): ChangeSection[] {
    const proposedAsset = this.record(value['asset']);
    const proposedChargePoint = this.record(value['chargePoint']);
    const currentChargePoint = item.asset?.evChargePoint;
    const isNewAsset = this.isNewAssetChange(value);
    const sections: ChangeSection[] = [];
    const identity = this.changedRows(
      [
        [
          'Asset reference',
          isNewAsset ? undefined : item.asset?.assetReference,
          proposedAsset['assetReference'],
        ],
        [
          'Display name',
          isNewAsset ? undefined : item.asset?.displayName,
          proposedAsset['displayName'],
        ],
        [
          'Manufacturer',
          isNewAsset ? undefined : item.asset?.manufacturer,
          proposedAsset['manufacturer'],
        ],
        ['Model', isNewAsset ? undefined : item.asset?.model, proposedAsset['model']],
        [
          'Serial number',
          isNewAsset ? undefined : item.asset?.serialNumber,
          proposedAsset['serialNumber'],
        ],
        [
          'Maximum power',
          isNewAsset ? undefined : currentChargePoint?.maximumPowerKw,
          proposedChargePoint['maximumPowerKw'],
        ],
        [
          'DC protection',
          isNewAsset ? undefined : currentChargePoint?.dcRcdType,
          proposedChargePoint['dcRcdType'],
        ],
      ],
      isNewAsset,
    );
    if (identity.length) sections.push({ title: 'Charger details', rows: identity });

    const currentSupplies = new Map(
      (currentChargePoint?.supplies ?? []).map((row) => [row.id, row]),
    );
    for (const [index, raw] of this.array(value['supplies']).entries()) {
      const proposed = this.record(raw);
      const current = currentSupplies.get(this.scalar(proposed['id']));
      const rows = this.changedRows(
        [
          ['Label', current?.label, proposed['label']],
          ['Phases', current?.phaseCount, proposed['phaseCount']],
          ['Protective device', current?.protectiveDeviceType, proposed['protectiveDeviceType']],
          ['Device rating', current?.protectiveDeviceRating, proposed['protectiveDeviceRating']],
          ['Earthing arrangement', current?.earthingArrangement, proposed['earthingArrangement']],
        ],
        current === undefined,
      );
      if (rows.length)
        sections.push({
          title: `Supply ${this.scalar(proposed['label'], String(index + 1))}`,
          rows,
        });
    }

    const currentConnectors = new Map(
      (currentChargePoint?.connectors ?? []).map((row) => [row.id, row]),
    );
    const supplyLabels = new Map(
      this.array(value['supplies']).map((raw) => {
        const supply = this.record(raw);
        return [this.scalar(supply['id']), this.scalar(supply['label'], 'Supply')];
      }),
    );
    for (const [index, raw] of this.array(value['connectors']).entries()) {
      const proposed = this.record(raw);
      const current = currentConnectors.get(this.scalar(proposed['id']));
      const currentSupplyIds = current?.supplyMappings.map(({ supplyId }) => supplyId) ?? [];
      const proposedSupplyIds = this.array(proposed['supplyIds']).map((id) => this.scalar(id));
      const rows = this.changedRows(
        [
          ['Label', current?.label, proposed['label']],
          ['Connector type', current?.connectorType, proposed['connectorType']],
          [
            'Supplied by',
            this.supplyNames(currentSupplyIds, currentChargePoint?.supplies ?? []),
            proposedSupplyIds.map((id) => supplyLabels.get(id) ?? id).join(', '),
          ],
        ],
        current === undefined,
      );
      if (rows.length)
        sections.push({
          title: `Connector ${this.scalar(proposed['label'], String(index + 1))}`,
          rows,
        });
    }
    return sections;
  }
  protected isNewAssetChange(value: Record<string, unknown>): boolean {
    return value['_operation'] === 'CREATE';
  }
  private changedRows(values: Array<[string, unknown, unknown]>, isNew = false): ChangeRow[] {
    return values.flatMap(([label, current, proposed]) => {
      const currentText = this.displayValue(current);
      const proposedText = this.displayValue(proposed);
      return currentText === proposedText
        ? []
        : [
            {
              label,
              current: currentText,
              proposed: proposedText,
              state: isNew ? 'new' : 'changed',
            },
          ];
    });
  }
  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }
  private displayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'Not recorded';
    const labels: Record<string, string> = {
      TYPE_B: 'Type B RCD',
      RDC_DD: 'RDC-DD',
      NONE: 'None',
      TNCS: 'TN-C-S',
      TNS: 'TN-S',
    };
    const text = this.scalar(value, 'Not recorded');
    return labels[text] ?? text;
  }
  private scalar(value: unknown, fallback = ''): string {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? `${value}`
      : fallback;
  }
  private supplyNames(
    ids: string[],
    supplies: NonNullable<InspectionSummary['asset']>['evChargePoint'] extends infer ChargePoint
      ? ChargePoint extends { supplies: infer Supplies }
        ? Supplies
        : never
      : never,
  ): string {
    const rows = supplies as Array<{ id: string; label: string }>;
    return ids.map((id) => rows.find((row) => row.id === id)?.label ?? id).join(', ');
  }
  private async load(): Promise<void> {
    await this.run(async () =>
      this.inspections.set(
        (await this.api.listInspections(this.organisationId, this.filter())).inspections,
      ),
    );
  }
  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update inspections.');
    } finally {
      this.busy.set(false);
    }
  }
}
