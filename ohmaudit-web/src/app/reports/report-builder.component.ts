import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

interface ReportColumn {
  key: string;
  label: string;
}

interface ReportDefinition {
  key: string;
  label: string;
  detail: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string>>;
}

@Component({
  selector: 'oa-report-builder',
  templateUrl: './report-builder.component.html',
  styleUrl: './report-builder.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportBuilderComponent {
  protected readonly reportTypes: ReportDefinition[] = [
    {
      key: 'assets',
      label: 'Asset register',
      detail: 'Every asset across the organisation',
      columns: [
        { key: 'reference', label: 'Reference' },
        { key: 'name', label: 'Asset name' },
        { key: 'type', label: 'Asset type' },
        { key: 'location', label: 'Client / site' },
        { key: 'status', label: 'Status' },
        { key: 'lastInspection', label: 'Last inspection' },
      ],
      rows: [
        {
          reference: 'EV-018',
          name: 'Visitor car park charger 01',
          type: 'EV Charger',
          location: 'Northstar Retail / Leeds',
          status: 'Active',
          lastInspection: '12 Sep 2026',
        },
        {
          reference: 'DB-L2-04',
          name: 'Second floor distribution board',
          type: 'Distribution Board',
          location: 'Aperture House / Manchester',
          status: 'Active',
          lastInspection: '04 Aug 2026',
        },
        {
          reference: 'EL-Z3',
          name: 'Emergency lighting zone 3',
          type: 'Emergency Lighting',
          location: 'Northstar Retail / York',
          status: 'Review due',
          lastInspection: '19 Jun 2026',
        },
      ],
    },
    {
      key: 'ev',
      label: 'EV charge points',
      detail: 'Chargers, ratings and inspection status',
      columns: [
        { key: 'reference', label: 'Charger ID' },
        { key: 'name', label: 'Charge point' },
        { key: 'location', label: 'Client / site' },
        { key: 'power', label: 'Maximum power' },
        { key: 'connectors', label: 'Connectors' },
        { key: 'status', label: 'Inspection status' },
      ],
      rows: [
        {
          reference: 'EV-018',
          name: 'Visitor car park charger 01',
          location: 'Northstar Retail / Leeds',
          power: '22 kW',
          connectors: '2 x Type 2',
          status: 'Pass',
        },
        {
          reference: 'EV-044',
          name: 'Fleet bay rapid charger',
          location: 'Form Works / Sheffield',
          power: '50 kW',
          connectors: 'CCS / CHAdeMO',
          status: 'Review due',
        },
      ],
    },
    {
      key: 'sites',
      label: 'Site directory',
      detail: 'Sites, clients and contact details',
      columns: [
        { key: 'reference', label: 'Site reference' },
        { key: 'name', label: 'Site' },
        { key: 'client', label: 'Client' },
        { key: 'postcode', label: 'Postcode' },
        { key: 'assets', label: 'Assets' },
        { key: 'status', label: 'Open reminders' },
      ],
      rows: [
        {
          reference: 'NRT-LDS',
          name: 'Leeds retail park',
          client: 'Northstar Retail',
          postcode: 'LS10 1AB',
          assets: '38',
          status: '3 reminders',
        },
        {
          reference: 'APH-MCR',
          name: 'Aperture House',
          client: 'Aperture Group',
          postcode: 'M1 4ET',
          assets: '21',
          status: 'Up to date',
        },
      ],
    },
    {
      key: 'inspections',
      label: 'Inspection history',
      detail: 'Outcomes, dates and engineers',
      columns: [
        { key: 'reference', label: 'Report reference' },
        { key: 'name', label: 'Inspection' },
        { key: 'location', label: 'Site / asset' },
        { key: 'engineer', label: 'Engineer' },
        { key: 'date', label: 'Effective date' },
        { key: 'status', label: 'Outcome' },
      ],
      rows: [
        {
          reference: '101-1',
          name: 'EV charge point inspection',
          location: 'Leeds / EV-018',
          engineer: 'Alex Morgan',
          date: '12 Sep 2026',
          status: 'Pass',
        },
        {
          reference: '098-3',
          name: 'Thermal imaging survey',
          location: 'Manchester / DB-L2-04',
          engineer: 'Sam Taylor',
          date: '04 Aug 2026',
          status: 'Advisory',
        },
      ],
    },
  ];
  protected readonly selectedType = signal('assets');
  protected readonly selectedColumns = signal(
    new Set(this.reportTypes[0]!.columns.map(({ key }) => key)),
  );
  protected readonly groupBy = signal('Client');
  private readonly selectedDefinition = computed(
    () => this.reportTypes.find(({ key }) => key === this.selectedType()) ?? this.reportTypes[0]!,
  );
  protected readonly selectedTypeLabel = computed(() => this.selectedDefinition().label);
  protected readonly columns = computed(() => this.selectedDefinition().columns);
  protected readonly visibleColumns = computed(() =>
    this.columns().filter(({ key }) => this.selectedColumns().has(key)),
  );
  protected readonly previewRows = computed(() => this.selectedDefinition().rows);

  protected selectType(key: string): void {
    this.selectedType.set(key);
    const definition = this.reportTypes.find((type) => type.key === key);
    if (definition) this.selectedColumns.set(new Set(definition.columns.map(({ key }) => key)));
  }

  protected toggleColumn(key: string): void {
    this.selectedColumns.update((selected) => {
      const next = new Set(selected);
      if (next.has(key) && next.size > 1) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected setGroupBy(event: Event): void {
    this.groupBy.set((event.target as HTMLSelectElement).value);
  }

  protected previewValue(row: Record<string, string>, key: string): string {
    return row[key] ?? '';
  }
}
