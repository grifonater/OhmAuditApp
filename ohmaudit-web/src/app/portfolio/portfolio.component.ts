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
import { GenerationProgressService } from '../core/generation-progress.service';
import { AsyncButtonDirective } from '../shared/async-button.directive';
import { DeferredLoadDirective } from '../shared/deferred-load.directive';

@Component({
  selector: 'oa-portfolio',
  imports: [AsyncButtonDirective, DeferredLoadDirective, ReactiveFormsModule, RouterLink],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortfolioComponent {
  private readonly api = inject(ApiService);
  private readonly generationProgress = inject(GenerationProgressService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private requestNumber = 0;
  private readonly pendingLogos = new Set<string>();
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly customers = signal<CustomerSummary[]>([]);
  protected readonly totalCustomers = signal(0);
  protected readonly summary = signal({ customers: 0, sites: 0, assets: 0 });
  protected readonly matchedSites = signal<SiteSummary[]>([]);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly searching = signal(false);
  protected readonly logoUrls = signal<Record<string, string>>({});
  protected readonly sitePhotoUrls = signal<Record<string, string>>({});
  protected readonly pagination = signal({ page: 1, pageSize: 25, total: 0, pageCount: 1 });
  protected readonly pageStart = computed(() => {
    const pagination = this.pagination();
    return pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  });
  protected readonly pageEnd = computed(() => {
    const pagination = this.pagination();
    return Math.min(pagination.page * pagination.pageSize, pagination.total);
  });
  protected readonly expandedCustomerId = signal('');
  protected readonly clientPreviews = signal<Record<string, CustomerDetail>>({});
  protected readonly previewLoadingId = signal('');
  protected readonly previewErrors = signal<Record<string, string>>({});
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly statusControl = new FormControl<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL', {
    nonNullable: true,
  });
  protected readonly sortControl = new FormControl<'ASC' | 'DESC'>('ASC', { nonNullable: true });
  protected readonly visibleCustomers = this.customers.asReadonly();
  protected readonly customerForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    reference: new FormControl('', { nonNullable: true }),
    internalNotes: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.revokeLogos();
      Object.values(this.sitePhotoUrls()).forEach((url) => URL.revokeObjectURL(url));
      this.sitePhotoUrls.set({});
    });
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.search(1));
    this.statusControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.search(1));
    this.sortControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.search(1));
    void this.loadSummary();
    void this.search();
  }

  private async loadSummary(): Promise<void> {
    try {
      const summaryResult = await this.api.portfolioSummary(this.organisationId);
      this.summary.set(summaryResult.summary);
    } catch {
      // The directory remains usable if summary metrics are temporarily unavailable.
    }
  }

  protected async search(page = 1): Promise<void> {
    const requestNumber = ++this.requestNumber;
    const query = this.searchControl.value.trim();
    this.searching.set(true);
    this.error.set('');
    try {
      const [customers, results] = await Promise.all([
        this.api.listCustomers(
          this.organisationId,
          query,
          page,
          this.pagination().pageSize,
          this.statusControl.value,
          this.sortControl.value,
        ),
        query.length >= 2
          ? this.api.search(this.organisationId, query)
          : Promise.resolve(undefined),
      ]);
      if (requestNumber !== this.requestNumber) return;
      this.customers.set(customers.items);
      this.totalCustomers.set(customers.total);
      this.pagination.set({
        page: customers.page,
        pageSize: customers.pageSize,
        total: customers.total,
        pageCount: customers.pageCount,
      });
      if (!customers.items.some(({ id }) => id === this.expandedCustomerId())) {
        this.expandedCustomerId.set('');
      }
      this.removeUnusedLogos(customers.items);
      this.matchedSites.set(results?.sites ?? []);
    } catch (error: unknown) {
      if (requestNumber === this.requestNumber)
        this.error.set(error instanceof Error ? error.message : 'Unable to search the portfolio.');
    } finally {
      if (requestNumber === this.requestNumber) this.searching.set(false);
    }
  }

  protected async loadLogo(customer: CustomerSummary): Promise<void> {
    const mediaId = customer.logoMedia?.id;
    if (!mediaId || this.logoUrls()[customer.id] || this.pendingLogos.has(customer.id)) return;
    this.pendingLogos.add(customer.id);
    try {
      const blob = await this.api.downloadMedia(this.organisationId, mediaId);
      if (
        this.destroyRef.destroyed ||
        !this.customers().some(
          (current) => current.id === customer.id && current.logoMedia?.id === mediaId,
        )
      )
        return;
      const url = URL.createObjectURL(blob);
      this.logoUrls.update((urls) => ({ ...urls, [customer.id]: url }));
    } catch {
      // The initials fallback remains visible when a logo is unavailable.
    } finally {
      this.pendingLogos.delete(customer.id);
    }
  }

  private removeUnusedLogos(customers: CustomerSummary[]): void {
    const retainedIds = new Set(customers.map((customer) => customer.id));
    const retained: Record<string, string> = {};
    for (const [customerId, url] of Object.entries(this.logoUrls())) {
      if (retainedIds.has(customerId)) retained[customerId] = url;
      else URL.revokeObjectURL(url);
    }
    this.logoUrls.set(retained);
  }

  private revokeLogos(): void {
    Object.values(this.logoUrls()).forEach((url) => URL.revokeObjectURL(url));
    this.logoUrls.set({});
  }

  private async loadSitePhotos(sites: SiteSummary[]): Promise<void> {
    const downloads = await Promise.all(
      sites
        .filter((site) => site.mainPhotoMediaId)
        .map((site) =>
          this.api
            .downloadMedia(this.organisationId, site.mainPhotoMediaId!)
            .then((blob) => [site.id, URL.createObjectURL(blob)] as const)
            .catch(() => undefined),
        ),
    );
    const entries = downloads.filter(
      (entry): entry is readonly [string, string] => entry !== undefined,
    );
    if (entries.length > 0)
      this.sitePhotoUrls.update((map) => ({ ...map, ...Object.fromEntries(entries) }));
  }

  protected clearSearch(): void {
    this.searchControl.setValue('');
  }

  protected goToPage(page: number): void {
    const pagination = this.pagination();
    if (this.searching() || page < 1 || page > pagination.pageCount || page === pagination.page)
      return;
    void this.search(page);
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
      await this.loadSitePhotos((customer.sites ?? []).slice(0, 3));
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
      await this.generationProgress.run(
        'Generating report',
        async () => {
          const blob = report.visitId
            ? await this.api.downloadVisitReportPdf(this.organisationId, report.visitId)
            : report.mediaId
              ? await this.api.downloadMedia(this.organisationId, report.mediaId)
              : await this.api.downloadDocumentPdf(this.organisationId, report.id);
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener,noreferrer');
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        'This can take a few moments.',
      );
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
