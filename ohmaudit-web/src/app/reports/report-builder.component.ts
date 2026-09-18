import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

type ReportStatus = 'Published' | 'Template' | 'Draft';
type ReportFormat = 'PDF' | 'Excel';

interface ReportItem {
  id: number;
  name: string;
  description: string;
  module: 'Inspections' | 'Assets' | 'RAMS' | 'Jobs';
  lastRun: string;
  timestamp: number;
  format: ReportFormat;
  status: ReportStatus;
  owner: string;
  initials: string;
}

@Component({
  selector: 'oa-report-builder',
  templateUrl: './report-builder.component.html',
  styleUrl: './report-builder.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportBuilderComponent {
  protected readonly search = signal('');
  protected readonly moduleFilter = signal('All modules');
  protected readonly statusFilter = signal('All statuses');
  protected readonly sortOrder = signal('newest');
  protected readonly currentPage = signal(1);
  protected readonly openMenu = signal<number | null>(null);

  protected readonly reports: ReportItem[] = [
    {
      id: 1,
      name: 'EV inspection compliance summary',
      description: 'Summary of EV inspections, pass rates and outstanding items.',
      module: 'Inspections',
      lastRun: '1 Sept 2026, 10:24',
      timestamp: 1788258240,
      format: 'PDF',
      status: 'Published',
      owner: 'Ryan Griffin',
      initials: 'RG',
    },
    {
      id: 2,
      name: 'Asset service due report',
      description: 'Assets due for service in the next 30 days.',
      module: 'Assets',
      lastRun: '31 Aug 2026, 16:02',
      timestamp: 1788192120,
      format: 'Excel',
      status: 'Published',
      owner: 'Ryan Griffin',
      initials: 'RG',
    },
    {
      id: 3,
      name: 'RAMS issue register',
      description: 'Open and closed RAMS issues across all sites.',
      module: 'RAMS',
      lastRun: '30 Aug 2026, 09:15',
      timestamp: 1788081300,
      format: 'PDF',
      status: 'Template',
      owner: 'James White',
      initials: 'JW',
    },
    {
      id: 4,
      name: 'Multi-site inspection performance',
      description: 'Inspection completion rates by site and engineer.',
      module: 'Inspections',
      lastRun: '28 Aug 2026, 14:33',
      timestamp: 1787927580,
      format: 'Excel',
      status: 'Published',
      owner: 'Ryan Griffin',
      initials: 'RG',
    },
    {
      id: 5,
      name: 'Open remedials by client',
      description: 'All open remedial actions grouped by client.',
      module: 'Jobs',
      lastRun: '25 Aug 2026, 11:20',
      timestamp: 1787653200,
      format: 'PDF',
      status: 'Draft',
      owner: 'James White',
      initials: 'JW',
    },
    {
      id: 6,
      name: 'Quarterly asset condition review',
      description: 'Condition trends and asset risk across the portfolio.',
      module: 'Assets',
      lastRun: '18 Aug 2026, 09:40',
      timestamp: 1787042400,
      format: 'PDF',
      status: 'Published',
      owner: 'Ryan Griffin',
      initials: 'RG',
    },
  ];

  protected readonly filteredReports = computed(() => {
    const query = this.search().trim().toLowerCase();
    const moduleName = this.moduleFilter();
    const status = this.statusFilter();
    const direction = this.sortOrder() === 'oldest' ? 1 : -1;

    return this.reports
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

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  protected updateModule(event: Event): void {
    this.moduleFilter.set((event.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  protected updateStatus(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  protected updateSort(event: Event): void {
    this.sortOrder.set((event.target as HTMLSelectElement).value);
  }

  protected toggleMenu(id: number): void {
    this.openMenu.update((current) => (current === id ? null : id));
  }
}
