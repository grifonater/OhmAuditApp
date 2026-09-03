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
  type AssetMedia,
  type AssetSummary,
  type Entitlement,
  type ReportSummary,
  type ScheduleOccurrence,
  type ScheduleSuggestion,
  type SiteDetail,
} from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { compressPhoto } from '../core/image-compression';

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
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly customerId = this.route.snapshot.paramMap.get('customerId') ?? '';
  protected readonly siteId = this.route.snapshot.paramMap.get('siteId') ?? '';
  protected readonly capabilities = signal<string[]>([]);
  protected readonly canManageSite = computed(() => this.capabilities().includes('sites.manage'));
  protected readonly canManageAssets = computed(() =>
    this.capabilities().includes('assets.manage'),
  );
  protected readonly canCreateVisit = computed(() => this.capabilities().includes('visits.create'));
  protected readonly site = signal<SiteDetail | undefined>(undefined);
  protected readonly entitlements = signal<Entitlement[]>([]);
  protected readonly scheduleOccurrences = signal<ScheduleOccurrence[]>([]);
  protected readonly scheduleSuggestions = signal<ScheduleSuggestion[]>([]);
  protected readonly evEnabled = computed(
    () => this.entitlements().find((item) => item.module.key === 'ev-charging')?.entitled ?? false,
  );
  protected readonly emergencyLightingEnabled = computed(
    () =>
      this.entitlements().find((item) => item.module.key === 'emergency-lighting')?.entitled ??
      false,
  );
  protected readonly tab = signal<SiteTab>('overview');
  protected readonly view = signal<'grid' | 'list'>('grid');
  protected readonly editingSite = signal(false);
  protected readonly editingAssetId = signal<string | undefined>(undefined);
  protected readonly addingAsset = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly siteImageUrls = signal<Record<string, string>>({});
  protected readonly heroImage = computed(() => {
    const media = this.site()?.media;
    if (!media?.length) return undefined;
    return media.find((m) => m.isPrimary) ?? media[0];
  });
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
    const scheduleReminders = this.scheduleOccurrences()
      .filter(
        (occurrence) =>
          occurrence.scheduleRule.site.id === this.siteId &&
          ['UPCOMING', 'DUE', 'OVERDUE'].includes(occurrence.status),
      )
      .map((occurrence) => ({
        id: occurrence.id,
        level: occurrence.status === 'OVERDUE' ? 'danger' : 'warning',
        title: occurrence.scheduleRule.title,
        detail: `${occurrence.scheduleRule.asset?.displayName ?? 'Whole site'} · Due ${this.formatDate(occurrence.dueDate)}`,
      }));
    return [...scheduleReminders, ...reportReminders, ...assetReminders];
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
  protected readonly duplicateSource = signal<AssetSummary | undefined>(undefined);
  protected readonly duplicateForm = new FormGroup({
    displayName: new FormControl('', { nonNullable: true, validators: Validators.required }),
    assetReference: new FormControl('', { nonNullable: true, validators: Validators.required }),
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
    const uploaded: AssetMedia[] = [];
    await this.run(async () => {
      for (const file of files) {
        const compressed = await compressPhoto(file);
        if (compressed.size > 2_000_000)
          throw new Error(`${file.name} is too large after compression. Try a smaller image.`);
        const { media } = await this.api.registerMedia(this.organisationId, {
          entityType: 'Site',
          entityId: this.siteId,
          category: 'site-image',
          ...(this.site()?.name === undefined ? {} : { caption: this.site()!.name }),
          mimeType: 'image/jpeg',
          size: compressed.size,
        });
        await this.api.uploadMedia(this.organisationId, media.id, compressed);
        const blob = await this.api.downloadMedia(this.organisationId, media.id).catch(() => null);
        const url = blob ? URL.createObjectURL(blob) : '';
        uploaded.push(media);
        if (url) this.siteImageUrls.update((map) => ({ ...map, [media.id]: url }));
      }
      this.site.update((s) => (s ? { ...s, media: [...(s.media ?? []), ...uploaded] } : s));
    });
  }
  protected async deleteSiteImage(mediaId: string): Promise<void> {
    await this.run(async () => {
      await this.api.deleteMedia(this.organisationId, mediaId);
      const url = this.siteImageUrls()[mediaId];
      if (url) URL.revokeObjectURL(url);
      this.siteImageUrls.update((map) => {
        const next = { ...map };
        delete next[mediaId];
        return next;
      });
      this.site.update((s) =>
        s ? { ...s, media: (s.media ?? []).filter((m) => m.id !== mediaId) } : s,
      );
    });
  }
  protected async setAsMainPhoto(mediaId: string): Promise<void> {
    await this.run(async () => {
      await this.api.setSitePhotoPrimary(this.organisationId, this.siteId, mediaId);
      this.site.update((s) =>
        s
          ? {
              ...s,
              media: (s.media ?? []).map((m) => ({ ...m, isPrimary: m.id === mediaId })),
            }
          : s,
      );
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
    const formValue = this.siteForm.getRawValue();
    await this.run(async () => {
      await this.api.updateSite(this.organisationId, this.siteId, formValue);
      this.site.update((s) => (s ? { ...s, ...formValue } : s));
      this.editingSite.set(false);
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
  protected openDuplicate(asset: AssetSummary): void {
    this.duplicateSource.set(asset);
    this.duplicateForm.setValue({
      displayName: asset.displayName,
      assetReference: asset.assetReference,
    });
  }
  protected closeDuplicate(): void {
    this.duplicateSource.set(undefined);
    this.duplicateForm.reset({ displayName: '', assetReference: '' });
  }
  protected closeDuplicateOnBackdrop(event: Event): void {
    if (event.target === event.currentTarget) this.closeDuplicate();
  }
  protected async duplicateAsset(): Promise<void> {
    const source = this.duplicateSource();
    if (!source || this.duplicateForm.invalid) return;
    await this.run(async () => {
      await this.api.createAsset(this.organisationId, {
        siteId: this.siteId,
        assetType: source.assetType,
        assetReference: this.duplicateForm.controls.assetReference.value,
        displayName: this.duplicateForm.controls.displayName.value,
        ...(source.manufacturer === undefined ? {} : { manufacturer: source.manufacturer }),
        ...(source.model === undefined ? {} : { model: source.model }),
        ...(source.serialNumber === undefined ? {} : { serialNumber: source.serialNumber }),
        ...(source.notes === undefined ? {} : { notes: source.notes }),
      });
      this.closeDuplicate();
      await this.load();
      this.error.set('');
    });
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
  protected async removeAsset(asset: AssetSummary): Promise<void> {
    if (
      !confirm(
        `Remove "${asset.displayName}" (${asset.assetReference}) from this site?\n\n` +
          `The asset record is retained for existing certificates and reports but will no longer ` +
          `appear in the site asset register.`,
      )
    )
      return;
    await this.run(async () => {
      await this.api.updateAssetLifecycle(this.organisationId, asset.id, 'REMOVED');
      this.site.update((s) =>
        s ? { ...s, assets: s.assets.filter((a) => a.id !== asset.id) } : s,
      );
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
  protected async createSuggestedSchedule(suggestion: ScheduleSuggestion): Promise<void> {
    await this.run(async () => {
      await this.api.createSchedule(this.organisationId, {
        siteId: this.siteId,
        ...(suggestion.asset === undefined ? {} : { assetId: suggestion.asset.id }),
        title: suggestion.title,
        moduleKey: suggestion.moduleKey,
        frequencyMonths: suggestion.suggestedFrequencyMonths,
        startDate: suggestion.suggestedStartDate.slice(0, 10),
        notificationLeadDays: 30,
      });
      this.scheduleSuggestions.update((items) =>
        items.filter((item) => item.inspectionId !== suggestion.inspectionId),
      );
      await this.loadScheduleContext();
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
      const account = await this.api.currentUser();
      const membership = account.memberships.find(
        (item) => item.organisation.id === this.organisationId,
      );
      this.capabilities.set(membership?.role.capabilities ?? []);
      const [siteResult, entitlementResult] = await Promise.all([
        this.api.getSite(this.organisationId, this.siteId),
        this.api.entitlements(this.organisationId),
      ]);
      const site = siteResult.site;
      this.entitlements.set(entitlementResult.entitlements);
      if (!this.evEnabled() && this.assetForm.controls.assetType.value === 'EV Charger')
        this.assetForm.controls.assetType.setValue('General Asset');
      this.site.set(site);
      await this.loadScheduleContext();
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
  private async loadScheduleContext(): Promise<void> {
    const from = new Date();
    from.setDate(from.getDate() - 1);
    const to = new Date(from);
    to.setFullYear(to.getFullYear() + 2);
    const [calendarResult, suggestionResult] = await Promise.all([
      this.api.calendar(this.organisationId, from.toISOString(), to.toISOString()),
      this.api.scheduleSuggestions(this.organisationId, this.siteId),
    ]);
    this.scheduleOccurrences.set(calendarResult.occurrences);
    this.scheduleSuggestions.set(suggestionResult.suggestions);
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
