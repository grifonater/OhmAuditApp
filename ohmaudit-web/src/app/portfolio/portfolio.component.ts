import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import {
  ApiService,
  type CustomerDetail,
  type CustomerSummary,
  type ReportSummary,
  type SiteSummary,
} from '../core/api.service';

@Component({
  selector: 'oa-portfolio',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortfolioComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private requestNumber = 0;
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly customers = signal<CustomerSummary[]>([]);
  protected readonly totalCustomers = signal(0);
  protected readonly summary = signal({ customers: 0, sites: 0, assets: 0 });
  protected readonly matchedSites = signal<SiteSummary[]>([]);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly searching = signal(false);
  protected readonly logoUrls = signal<Record<string, string>>({});
  protected readonly expandedCustomerId = signal('');
  protected readonly clientPreviews = signal<Record<string, CustomerDetail>>({});
  protected readonly previewLoadingId = signal('');
  protected readonly previewErrors = signal<Record<string, string>>({});
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly statusControl = new FormControl('ALL', { nonNullable: true });
  protected readonly sortControl = new FormControl<'ASC' | 'DESC'>('ASC', { nonNullable: true });
  protected readonly visibleCustomers = computed(() => {
    const status = this.statusControl.value;
    const direction = this.sortControl.value === 'DESC' ? -1 : 1;
    return [...this.customers()]
      .filter((customer) => status === 'ALL' || customer.status === status)
      .sort((left, right) => left.name.localeCompare(right.name, 'en-GB') * direction);
  });
  protected readonly activeShown = computed(
    () => this.customers().filter(({ status }) => status === 'ACTIVE').length,
  );
  protected readonly customerForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    reference: new FormControl('', { nonNullable: true }),
    internalNotes: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeLogos());
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.search());
    this.statusControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.customers.update((customers) => [...customers]));
    this.sortControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.customers.update((customers) => [...customers]));
    void this.loadSummary();
    void this.search();
  }

  private async loadSummary(): Promise<void> {
    try {
      this.summary.set((await this.api.portfolioSummary(this.organisationId)).summary);
    } catch {
      // The directory remains usable if summary metrics are temporarily unavailable.
    }
  }

  protected async search(): Promise<void> {
    const requestNumber = ++this.requestNumber;
    const query = this.searchControl.value.trim();
    this.searching.set(true);
    this.error.set('');
    try {
      const [customers, results] = await Promise.all([
        this.api.listCustomers(this.organisationId, query),
        query.length >= 2
          ? this.api.search(this.organisationId, query)
          : Promise.resolve(undefined),
      ]);
      if (requestNumber !== this.requestNumber) return;
      this.customers.set(customers.items);
      this.totalCustomers.set(customers.total);
      if (!customers.items.some(({ id }) => id === this.expandedCustomerId())) {
        this.expandedCustomerId.set('');
      }
      await this.loadLogos(customers.items);
      this.matchedSites.set(results?.sites ?? []);
    } catch (error: unknown) {
      if (requestNumber === this.requestNumber)
        this.error.set(error instanceof Error ? error.message : 'Unable to search the portfolio.');
    } finally {
      if (requestNumber === this.requestNumber) this.searching.set(false);
    }
  }

  private async loadLogos(customers: CustomerSummary[]): Promise<void> {
    this.revokeLogos();
    const downloads = await Promise.all(
      customers.flatMap((customer) =>
        customer.logoMedia?.id
          ? [
              this.api
                .downloadMedia(this.organisationId, customer.logoMedia.id)
                .then((blob) => [customer.id, URL.createObjectURL(blob)] as const)
                .catch(() => undefined),
            ]
          : [],
      ),
    );
    const entries = downloads.filter(
      (entry): entry is readonly [string, string] => entry !== undefined,
    );
    this.logoUrls.set(Object.fromEntries(entries));
  }

  private revokeLogos(): void {
    Object.values(this.logoUrls()).forEach((url) => URL.revokeObjectURL(url));
    this.logoUrls.set({});
  }

  protected clearSearch(): void {
    this.searchControl.setValue('');
  }

  protected async toggleClientPreview(customerId: string): Promise<void> {
    if (this.expandedCustomerId() === customerId) {
      this.expandedCustomerId.set('');
      return;
    }
    this.expandedCustomerId.set(customerId);
    if (this.clientPreviews()[customerId]) return;
    this.previewLoadingId.set(customerId);
    this.previewErrors.update((errors) => ({ ...errors, [customerId]: '' }));
    try {
      const { customer } = await this.api.getCustomer(this.organisationId, customerId);
      this.clientPreviews.update((previews) => ({ ...previews, [customerId]: customer }));
    } catch (error: unknown) {
      this.previewErrors.update((errors) => ({
        ...errors,
        [customerId]: error instanceof Error ? error.message : 'Unable to load this client.',
      }));
    } finally {
      if (this.previewLoadingId() === customerId) this.previewLoadingId.set('');
    }
  }

  protected async retryClientPreview(customerId: string): Promise<void> {
    this.expandedCustomerId.set('');
    await this.toggleClientPreview(customerId);
  }

  protected async openReport(report: ReportSummary): Promise<void> {
    if (!report.visitId && !report.mediaId && !report.inspectionRevisionId) return;
    try {
      const blob = report.visitId
        ? await this.api.downloadVisitReportPdf(this.organisationId, report.visitId)
        : report.mediaId
          ? await this.api.downloadMedia(this.organisationId, report.mediaId)
          : await this.api.downloadDocumentPdf(this.organisationId, report.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to open the report.');
    }
  }

  protected formatDate(value: string | undefined): string {
    return value
      ? new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(value))
      : 'Date unavailable';
  }

  protected async createCustomer(): Promise<void> {
    if (this.customerForm.invalid) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.createCustomer(
        this.organisationId,
        this.customerForm.getRawValue(),
      );
      this.customerForm.reset();
      await this.router.navigate([
        '/app/org',
        this.organisationId,
        'portfolio',
        'clients',
        result.customer.id,
      ]);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to create the client.');
    } finally {
      this.busy.set(false);
    }
  }
}
