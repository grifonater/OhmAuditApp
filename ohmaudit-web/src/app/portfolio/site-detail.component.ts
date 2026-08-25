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
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ApiService,
  type AssetSummary,
  type Entitlement,
  type ReportSummary,
  type SiteDetail,
} from '../core/api.service';

type SiteTab = 'overview' | 'assets' | 'reports' | 'reminders';
@Component({
  selector: 'oa-site-detail',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './site-detail.component.html',
  styleUrl: './site-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteDetailComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly customerId = this.route.snapshot.paramMap.get('customerId') ?? '';
  protected readonly siteId = this.route.snapshot.paramMap.get('siteId') ?? '';
  protected readonly site = signal<SiteDetail | undefined>(undefined);
  protected readonly entitlements = signal<Entitlement[]>([]);
  protected readonly evEnabled = computed(
    () => this.entitlements().find((item) => item.module.key === 'ev-charging')?.entitled ?? false,
  );
  protected readonly tab = signal<SiteTab>('overview');
  protected readonly view = signal<'grid' | 'list'>('grid');
  protected readonly editingSite = signal(false);
  protected readonly editingAssetId = signal<string | undefined>(undefined);
  protected readonly addingAsset = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly siteImageUrls = signal<Record<string, string>>({});
  protected readonly assetSearch = new FormControl('', { nonNullable: true });
  protected readonly statusFilter = new FormControl('ALL', { nonNullable: true });
  private readonly assetQuery = toSignal(this.assetSearch.valueChanges, { initialValue: '' });
  private readonly assetStatus = toSignal(this.statusFilter.valueChanges, { initialValue: 'ALL' });
  protected readonly filteredAssets = computed(() => {
    const assets = this.site()?.assets ?? [];
    const q = this.assetQuery().trim().toLowerCase();
    const status = this.assetStatus();
    return assets.filter(
      (asset) =>
        (status === 'ALL' || asset.status === status) &&
        (!q ||
          [
            asset.displayName,
            asset.assetReference,
            asset.assetType,
            asset.manufacturer,
            asset.model,
            asset.serialNumber,
          ].some((value) => value?.toLowerCase().includes(q))),
    );
  });
  protected readonly reminders = computed(() => {
    const site = this.site();
    if (!site) return [];
    const now = Date.now();
    const ninetyDays = 90 * 86400000;
    const reportReminders = site.reports
      .filter(
        (report) => report.expiresAt && new Date(report.expiresAt).getTime() - now <= ninetyDays,
      )
      .map((report) => ({
        id: report.id,
        level: new Date(report.expiresAt!).getTime() < now ? 'danger' : 'warning',
        title: `${report.title} ${new Date(report.expiresAt!).getTime() < now ? 'expired' : 'expires soon'}`,
        detail: `Expiry: ${this.formatDate(report.expiresAt)}`,
      }));
    const assetReminders = site.assets
      .filter((asset) => ['PROPOSED', 'INACTIVE'].includes(asset.status))
      .map((asset) => ({
        id: asset.id,
        level: 'info',
        title: `${asset.displayName} needs review`,
        detail: `${asset.assetReference} · ${asset.status.toLowerCase()}`,
      }));
    return [...reportReminders, ...assetReminders];
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
    parkingInformation: new FormControl('', { nonNullable: true }),
    accessInstructions: new FormControl('', { nonNullable: true }),
    internalNotes: new FormControl('', { nonNullable: true }),
  });
  protected readonly assetForm = new FormGroup({
    assetType: new FormControl('EV Charger', {
      nonNullable: true,
      validators: Validators.required,
    }),
    assetReference: new FormControl('', { nonNullable: true, validators: Validators.required }),
    displayName: new FormControl('', { nonNullable: true, validators: Validators.required }),
    manufacturer: new FormControl('', { nonNullable: true }),
    model: new FormControl('', { nonNullable: true }),
    serialNumber: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });
  constructor() {
    this.destroyRef.onDestroy(() => this.revokeSiteImages());
    void this.load();
  }
  protected async uploadSiteImages(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    await this.run(async () => {
      for (const file of files) {
        const { media } = await this.api.registerMedia(this.organisationId, {
          entityType: 'Site',
          entityId: this.siteId,
          category: 'site-image',
          ...(this.site()?.name === undefined ? {} : { caption: this.site()!.name }),
          mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
          size: file.size,
        });
        await this.api.uploadMedia(this.organisationId, media.id, file);
      }
      await this.load();
    });
  }
  protected async deleteSiteImage(mediaId: string): Promise<void> {
    await this.run(async () => {
      await this.api.deleteMedia(this.organisationId, mediaId);
      await this.load();
    });
  }
  protected setTab(tab: SiteTab): void {
    this.tab.set(tab);
  }
  protected startSiteEdit(): void {
    const site = this.site();
    if (!site) return;
    this.siteForm.setValue({
      name: site.name,
      reference: site.reference ?? '',
      addressLine1: site.addressLine1 ?? '',
      city: site.city ?? '',
      postcode: site.postcode ?? '',
      parkingInformation: site.parkingInformation ?? '',
      accessInstructions: site.accessInstructions ?? '',
      internalNotes: site.internalNotes ?? '',
    });
    this.editingSite.set(true);
  }
  protected async saveSite(): Promise<void> {
    if (this.siteForm.invalid) return;
    await this.run(async () => {
      await this.api.updateSite(this.organisationId, this.siteId, this.siteForm.getRawValue());
      this.editingSite.set(false);
      await this.load();
    });
  }
  protected async createAsset(): Promise<void> {
    if (this.assetForm.invalid) return;
    await this.run(async () => {
      await this.api.createAsset(this.organisationId, {
        siteId: this.siteId,
        ...this.assetForm.getRawValue(),
      });
      this.assetForm.reset({ assetType: this.evEnabled() ? 'EV Charger' : 'General Asset' });
      this.addingAsset.set(false);
      await this.load();
    });
  }
  protected startAssetEdit(asset: AssetSummary): void {
    this.editingAssetId.set(asset.id);
    this.assetForm.setValue({
      assetType: asset.assetType,
      assetReference: asset.assetReference,
      displayName: asset.displayName,
      manufacturer: asset.manufacturer ?? '',
      model: asset.model ?? '',
      serialNumber: asset.serialNumber ?? '',
      notes: asset.notes ?? '',
    });
  }
  protected cancelAssetEdit(): void {
    this.editingAssetId.set(undefined);
    this.assetForm.reset({ assetType: this.evEnabled() ? 'EV Charger' : 'General Asset' });
  }
  protected async saveAsset(): Promise<void> {
    const id = this.editingAssetId();
    if (!id || this.assetForm.invalid) return;
    await this.run(async () => {
      await this.api.updateAsset(this.organisationId, id, this.assetForm.getRawValue());
      this.cancelAssetEdit();
      await this.load();
    });
  }
  protected async changeStatus(assetId: string, status: string): Promise<void> {
    await this.run(async () => {
      await this.api.updateAssetLifecycle(this.organisationId, assetId, status);
      await this.load();
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
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  }
  protected formatDate(value: string | undefined): string {
    return value
      ? new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(value))
      : 'Not set';
  }
  private async load(): Promise<void> {
    await this.run(async () => {
      const [siteResult, entitlementResult] = await Promise.all([
        this.api.getSite(this.organisationId, this.siteId),
        this.api.entitlements(this.organisationId),
      ]);
      const site = siteResult.site;
      this.entitlements.set(entitlementResult.entitlements);
      if (!this.evEnabled() && this.assetForm.controls.assetType.value === 'EV Charger')
        this.assetForm.controls.assetType.setValue('General Asset');
      this.site.set(site);
      this.revokeSiteImages();
      const downloads = await Promise.all(
        (site.media ?? []).map((media) =>
          this.api
            .downloadMedia(this.organisationId, media.id)
            .then((blob) => [media.id, URL.createObjectURL(blob)] as const)
            .catch(() => undefined),
        ),
      );
      const imageEntries = downloads.filter(
        (entry): entry is readonly [string, string] => entry !== undefined,
      );
      this.siteImageUrls.set(Object.fromEntries(imageEntries));
    });
  }
  private revokeSiteImages(): void {
    Object.values(this.siteImageUrls()).forEach((url) => URL.revokeObjectURL(url));
    this.siteImageUrls.set({});
  }
  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update the site.');
    } finally {
      this.busy.set(false);
    }
  }
}
