import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, type CustomerDetail, type ReportSummary } from '../core/api.service';

@Component({
  selector: 'oa-client-detail',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './client-detail.component.html',
  styleUrl: './client-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientDetailComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly customerId = this.route.snapshot.paramMap.get('customerId') ?? '';
  protected readonly customer = signal<CustomerDetail | undefined>(undefined);
  protected readonly tab = signal<'overview' | 'sites' | 'reports' | 'contacts' | 'details'>(
    this.initialTab(),
  );
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly logoUrl = signal('');
  protected readonly siteSearch = new FormControl('', { nonNullable: true });
  protected readonly siteStatus = new FormControl('ALL', { nonNullable: true });
  protected readonly siteSort = new FormControl<'ASC' | 'DESC'>('ASC', { nonNullable: true });
  private readonly siteQuery = toSignal(this.siteSearch.valueChanges, { initialValue: '' });
  private readonly selectedSiteStatus = toSignal(this.siteStatus.valueChanges, {
    initialValue: 'ALL',
  });
  private readonly selectedSiteSort = toSignal(this.siteSort.valueChanges, { initialValue: 'ASC' });
  protected readonly filteredSites = computed(() => {
    const query = this.siteQuery().trim().toLowerCase();
    const status = this.selectedSiteStatus();
    const direction = this.selectedSiteSort() === 'DESC' ? -1 : 1;
    return (this.customer()?.sites ?? [])
      .filter(
        (site) =>
          (status === 'ALL' || site.status === status) &&
          (query === '' ||
            [
              site.name,
              site.reference,
              site.addressLine1,
              site.addressLine2,
              site.city,
              site.county,
              site.postcode,
            ].some((value) => value?.toLowerCase().includes(query))),
      )
      .sort((left, right) => left.name.localeCompare(right.name, 'en-GB') * direction);
  });
  protected readonly primaryContact = computed(() => {
    const contacts = this.customer()?.contacts ?? [];
    return contacts.find(({ primary }) => primary) ?? contacts[0];
  });
  protected readonly recentReports = computed(() => (this.customer()?.reports ?? []).slice(0, 4));
  protected readonly clientForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    reference: new FormControl('', { nonNullable: true }),
    internalNotes: new FormControl('', { nonNullable: true }),
  });
  protected readonly siteForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    reference: new FormControl('', { nonNullable: true }),
    addressLine1: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
    postcode: new FormControl('', { nonNullable: true }),
    accessInstructions: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeLogo());
    void this.load();
  }

  private initialTab(): 'overview' | 'sites' | 'reports' | 'contacts' | 'details' {
    const requested = this.route.snapshot.queryParamMap.get('tab');
    return requested === 'sites' ||
      requested === 'reports' ||
      requested === 'contacts' ||
      requested === 'details'
      ? requested
      : 'overview';
  }

  protected openSiteCreator(): void {
    this.tab.set('sites');
    queueMicrotask(() => document.getElementById('add-client-site')?.scrollIntoView());
  }

  protected siteAddress(site: CustomerDetail['sites'][number]): string {
    return [site.addressLine1, site.addressLine2, site.city, site.county, site.postcode]
      .filter(Boolean)
      .join(', ');
  }

  protected async uploadLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.run(async () => {
      const upload = await this.logoAsJpeg(file);
      const previousLogoId = this.customer()?.logoMediaId;
      const { media } = await this.api.registerMedia(this.organisationId, {
        entityType: 'Customer',
        entityId: this.customerId,
        category: 'client-logo',
        mimeType: 'image/jpeg',
        size: upload.size,
      });
      await this.api.uploadMedia(this.organisationId, media.id, upload);
      await this.api.setCustomerLogo(this.organisationId, this.customerId, media.id);
      if (previousLogoId && previousLogoId !== media.id) {
        // The new logo is already active. Cleanup of an old/stale row must not make a successful
        // replacement appear to have failed to the administrator.
        await this.api.deleteMedia(this.organisationId, previousLogoId).catch(() => undefined);
      }
      await this.load();
    });
  }

  protected async removeLogo(): Promise<void> {
    const mediaId = this.customer()?.logoMediaId;
    if (!mediaId) return;
    await this.run(async () => {
      await this.api.setCustomerLogo(this.organisationId, this.customerId, null);
      await this.api.deleteMedia(this.organisationId, mediaId);
      await this.load();
    });
  }

  protected startEditing(): void {
    const customer = this.customer();
    if (!customer) return;
    this.clientForm.setValue({
      name: customer.name,
      reference: customer.reference ?? '',
      internalNotes: customer.internalNotes ?? '',
    });
    this.editing.set(true);
  }

  protected async saveClient(): Promise<void> {
    if (this.clientForm.invalid) return;
    await this.run(async () => {
      await this.api.updateCustomer(
        this.organisationId,
        this.customerId,
        this.clientForm.getRawValue(),
      );
      this.editing.set(false);
      await this.load();
    });
  }

  protected async createSite(): Promise<void> {
    if (this.siteForm.invalid) return;
    await this.run(async () => {
      const result = await this.api.createSite(this.organisationId, {
        customerId: this.customerId,
        ...this.siteForm.getRawValue(),
      });
      this.siteForm.reset();
      await this.router.navigate([
        '/app/org',
        this.organisationId,
        'portfolio',
        'clients',
        this.customerId,
        'sites',
        result.site.id,
      ]);
    });
  }

  protected async openReport(report: ReportSummary): Promise<void> {
    if (!report.visitId && !report.mediaId && !report.inspectionRevisionId) return;
    await this.run(async () => {
      const blob = report.visitId
        ? await this.api.downloadVisitReportPdf(this.organisationId, report.visitId)
        : report.mediaId
          ? await this.api.downloadMedia(this.organisationId, report.mediaId)
          : await this.api.downloadDocumentPdf(this.organisationId, report.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  protected formatDate(value: string | undefined): string {
    return value === undefined
      ? 'Not set'
      : new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(value));
  }

  private async load(): Promise<void> {
    await this.run(async () => {
      const customer = (await this.api.getCustomer(this.organisationId, this.customerId)).customer;
      this.customer.set(customer);
      this.revokeLogo();
      if (customer.logoMedia?.id) {
        await this.api
          .downloadMedia(this.organisationId, customer.logoMedia.id)
          .then((blob) => this.logoUrl.set(URL.createObjectURL(blob)))
          .catch(() => undefined);
      }
    });
  }
  private revokeLogo(): void {
    const url = this.logoUrl();
    if (url) URL.revokeObjectURL(url);
    this.logoUrl.set('');
  }
  private async logoAsJpeg(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the client logo.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('The client logo could not be prepared.')),
        'image/jpeg',
        0.9,
      ),
    );
  }
  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update the client.');
    } finally {
      this.busy.set(false);
    }
  }
}
