import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  type ElementRef,
  type WritableSignal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import {
  ApiService,
  type AssetMedia,
  type EmergencyLightFittingInput,
  type EmergencyLightingDevice,
  type EmergencyLightingFittingDetail,
  type EmergencyLightingFittingTestHistory,
} from '../core/api.service';
import {
  emergencyLightingAssetPath,
  emergencyLightingLabelStudioPath,
} from '../core/emergency-lighting-routes';
import { compressPhoto } from '../core/image-compression';

interface RenderedImage {
  id: string;
  url: string;
  caption?: string;
  media: AssetMedia;
  source: 'fitting' | 'room';
}

interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  date: string;
  kind: 'pass' | 'fail' | 'image' | 'edit';
}

@Component({
  selector: 'oa-emergency-lighting-fitting-detail',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './emergency-lighting-fitting-detail.component.html',
  styleUrls: ['./operations.css', './emergency-lighting-fitting-detail.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmergencyLightingFittingDetailComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly barcodeElement = viewChild<ElementRef<SVGSVGElement>>('barcode');

  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly assetId = this.route.snapshot.paramMap.get('assetId') ?? '';
  protected readonly fittingId = this.route.snapshot.paramMap.get('fittingId') ?? '';
  protected readonly detail = signal<EmergencyLightingFittingDetail | undefined>(undefined);
  protected readonly fittingImages = signal<RenderedImage[]>([]);
  protected readonly roomImages = signal<RenderedImage[]>([]);
  protected readonly qrCodeUrl = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly showAllHistory = signal(false);

  protected readonly assetBackPath = emergencyLightingAssetPath(this.organisationId, this.assetId);
  protected readonly labelStudioPath = emergencyLightingLabelStudioPath(
    this.organisationId,
    this.assetId,
  );
  protected readonly fittingForm = new FormGroup({
    reference: new FormControl('', { nonNullable: true, validators: Validators.required }),
    description: new FormControl('', { nonNullable: true }),
    locationId: new FormControl('', { nonNullable: true }),
    groupIds: new FormControl<string[]>([], { nonNullable: true }),
    deviceId: new FormControl('', { nonNullable: true }),
    manufacturer: new FormControl('', { nonNullable: true }),
    model: new FormControl('', { nonNullable: true }),
    fittingType: new FormControl('', { nonNullable: true }),
    maintained: new FormControl(false, { nonNullable: true }),
    serialNumber: new FormControl('', { nonNullable: true }),
    ratedDurationMinutes: new FormControl<number | null>(null),
    status: new FormControl<'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>('ACTIVE', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  protected readonly latestTest = computed(() => this.detail()?.testHistory[0]);
  protected readonly monthlyTests = computed(
    () => this.detail()?.testHistory.filter(({ testType }) => testType === 'FUNCTIONAL') ?? [],
  );
  protected readonly annualTests = computed(
    () => this.detail()?.testHistory.filter(({ testType }) => testType === 'DURATION') ?? [],
  );
  protected readonly passRate = computed(() => {
    const history =
      this.detail()?.testHistory.filter(({ outcome }) => outcome !== 'NOT_TESTED') ?? [];
    if (history.length === 0) return 0;
    return Math.round(
      (history.filter(({ outcome }) => outcome === 'PASS').length / history.length) * 100,
    );
  });
  protected readonly failedTests = computed(
    () => this.detail()?.testHistory.filter(({ outcome }) => outcome === 'FAIL').length ?? 0,
  );
  protected readonly latestDuration = computed(
    () =>
      this.annualTests().find(({ durationMinutes }) => typeof durationMinutes === 'number')
        ?.durationMinutes,
  );
  protected readonly isCompliant = computed(
    () => this.detail()?.fitting.status === 'ACTIVE' && this.latestTest()?.outcome === 'PASS',
  );
  protected readonly visibleHistory = computed(() => {
    const history = this.detail()?.testHistory ?? [];
    return this.showAllHistory() ? history : history.slice(0, 5);
  });
  protected readonly activity = computed<ActivityItem[]>(() => {
    const current = this.detail();
    if (current === undefined) return [];
    const tests = current.testHistory.map((result) => ({
      id: `test-${result.id}`,
      title: `${this.testName(result)} recorded`,
      detail: `${this.resultLabel(result.outcome)}${result.revisionNumber ? ` · Revision ${result.revisionNumber}` : ''}`,
      date: result.recordedAt,
      kind: result.outcome === 'FAIL' ? ('fail' as const) : ('pass' as const),
    }));
    const images = (current.fitting.media ?? []).map((media) => ({
      id: `media-${media.id}`,
      title: 'Image uploaded',
      detail: media.caption ?? media.originalFilename ?? 'Fitting image',
      date: media.createdAt ?? '',
      kind: 'image' as const,
    }));
    const updated = current.fitting.updatedAt
      ? [
          {
            id: 'fitting-updated',
            title: 'Fitting details updated',
            detail: current.fitting.reference,
            date: current.fitting.updatedAt,
            kind: 'edit' as const,
          },
        ]
      : [];
    return [...tests, ...images, ...updated]
      .filter(({ date }) => date)
      .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
      .slice(0, 8);
  });

  constructor() {
    effect(() => {
      const fitting = this.detail()?.fitting;
      const element = this.barcodeElement()?.nativeElement;
      if (fitting === undefined || element === undefined) return;
      JsBarcode(element, fitting.serialNumber || fitting.reference, {
        format: 'CODE128',
        displayValue: true,
        height: 40,
        margin: 0,
        fontSize: 11,
        lineColor: '#10203d',
      });
    });
    this.destroyRef.onDestroy(() => this.revokeImages());
    void this.load();
  }

  protected selectedDevice(): EmergencyLightingDevice | undefined {
    const id = this.fittingForm.getRawValue().deviceId;
    return this.detail()?.system.devices.find((device) => device.id === id);
  }

  protected deviceSelected(): boolean {
    return this.selectedDevice() !== undefined;
  }

  protected onDeviceChange(): void {
    const device = this.selectedDevice();
    if (device === undefined) return;
    this.fittingForm.patchValue({
      manufacturer: device.make,
      model: device.model,
      fittingType: device.fittingType?.name ?? '',
    });
  }

  protected groupNames(): string {
    const groups = this.detail()?.fitting.groupMappings?.map(({ group }) => group.name) ?? [];
    return groups.length ? groups.join(', ') : 'No group';
  }

  protected keyswitchNames(): string {
    const keyswitches = this.detail()?.fitting.keyswitches ?? [];
    return keyswitches.length
      ? keyswitches.map(({ reference }) => reference).join(', ')
      : 'No keyswitch';
  }

  protected testName(result: EmergencyLightingFittingTestHistory): string {
    return result.testType === 'DURATION' ? 'Annual duration test' : 'Monthly functional test';
  }

  protected resultLabel(outcome: EmergencyLightingFittingTestHistory['outcome']): string {
    return outcome === 'NOT_TESTED' ? 'Not tested' : outcome === 'PASS' ? 'Pass' : 'Fail';
  }

  protected resultDate(result: EmergencyLightingFittingTestHistory | undefined): string {
    if (result === undefined) return 'No test recorded';
    return this.formatDate(result.inspection?.effectiveDate ?? result.recordedAt);
  }

  protected formatDate(value: string | null | undefined): string {
    if (!value) return 'Not recorded';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }

  protected formatTime(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  protected scrollToHistory(): void {
    document.querySelector('#fitting-history')?.scrollIntoView({ behavior: 'smooth' });
  }

  protected printLabel(): void {
    window.print();
  }

  protected async saveChanges(): Promise<void> {
    if (this.fittingForm.invalid) return;
    const value = this.fittingForm.getRawValue();
    const device = this.selectedDevice();
    const input: EmergencyLightFittingInput = {
      reference: value.reference.trim(),
      locationId: value.locationId || null,
      deviceId: value.deviceId || null,
      groupIds: value.groupIds,
      operationMode: value.maintained ? 'MAINTAINED' : 'NON_MAINTAINED',
      status: value.status,
      ...(value.description.trim() ? { description: value.description.trim() } : {}),
      ...(value.serialNumber.trim() ? { serialNumber: value.serialNumber.trim() } : {}),
      ...(value.ratedDurationMinutes === null
        ? {}
        : { ratedDurationMinutes: value.ratedDurationMinutes }),
      ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
    };
    if (device === undefined) {
      if (value.manufacturer.trim()) input.manufacturer = value.manufacturer.trim();
      if (value.model.trim()) input.model = value.model.trim();
      if (value.fittingType.trim()) input.fittingType = value.fittingType.trim();
    }
    await this.run(async () => {
      await this.api.updateEmergencyLightFitting(
        this.organisationId,
        this.assetId,
        this.fittingId,
        input,
      );
      this.notice.set('Fitting details saved.');
      await this.load(false);
    });
  }

  protected async uploadImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.run(async () => {
      const image = await compressPhoto(file);
      const current = this.detail();
      const { media } = await this.api.registerMedia(this.organisationId, {
        entityType: 'EmergencyLightFitting',
        entityId: this.fittingId,
        category: 'fitting-image',
        caption: current?.fitting.reference ?? file.name,
        originalFilename: file.name,
        mimeType: 'image/jpeg',
        size: image.size,
      });
      await this.api.uploadMedia(this.organisationId, media.id, image);
      input.value = '';
      this.notice.set('Fitting image uploaded.');
      await this.load(false);
    });
  }

  protected async deleteImage(image: RenderedImage): Promise<void> {
    if (!confirm('Delete this fitting image?')) return;
    await this.run(async () => {
      await this.api.deleteMedia(this.organisationId, image.id);
      this.notice.set('Fitting image deleted.');
      await this.load(false);
    });
  }

  private async load(useBusy = true): Promise<void> {
    if (useBusy) this.busy.set(true);
    this.error.set('');
    try {
      const detail = await this.api.getEmergencyLightingFitting(
        this.organisationId,
        this.assetId,
        this.fittingId,
      );
      this.detail.set(detail);
      this.fittingForm.setValue({
        reference: detail.fitting.reference,
        description: detail.fitting.description ?? '',
        locationId: detail.fitting.locationId ?? '',
        groupIds: detail.fitting.groupMappings?.map(({ groupId }) => groupId) ?? [],
        deviceId: detail.fitting.deviceId ?? '',
        manufacturer: detail.fitting.manufacturer ?? '',
        model: detail.fitting.model ?? '',
        fittingType: detail.fitting.fittingType ?? '',
        maintained: detail.fitting.operationMode === 'MAINTAINED',
        serialNumber: detail.fitting.serialNumber ?? '',
        ratedDurationMinutes: detail.fitting.ratedDurationMinutes ?? null,
        status: this.recordStatus(detail.fitting.status),
        notes: detail.fitting.notes ?? '',
      });
      this.qrCodeUrl.set(
        await QRCode.toDataURL(window.location.href, {
          width: 180,
          margin: 1,
          color: { dark: '#10203d', light: '#ffffff' },
        }),
      );
      this.revokeImages();
      await Promise.all([
        this.loadImages(detail.fitting.media ?? [], this.fittingImages, 'fitting'),
        this.loadImages(detail.fitting.locationMedia ?? [], this.roomImages, 'room'),
      ]);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load the fitting.');
    } finally {
      if (useBusy) this.busy.set(false);
    }
  }

  private recordStatus(status: string): 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' {
    return status === 'INACTIVE' || status === 'ARCHIVED' ? status : 'ACTIVE';
  }

  private async loadImages(
    media: AssetMedia[],
    target: WritableSignal<RenderedImage[]>,
    source: RenderedImage['source'],
  ): Promise<void> {
    const rendered = await Promise.all(
      media.map(async (entry) => ({
        id: entry.id,
        url: URL.createObjectURL(await this.api.downloadMedia(this.organisationId, entry.id)),
        ...(entry.caption === undefined ? {} : { caption: entry.caption }),
        media: entry,
        source,
      })),
    );
    target.set(rendered);
  }

  private revokeImages(): void {
    for (const image of [...this.fittingImages(), ...this.roomImages()]) {
      if (image.url.startsWith('blob:')) URL.revokeObjectURL(image.url);
    }
    this.fittingImages.set([]);
    this.roomImages.set([]);
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update the fitting.');
    } finally {
      this.busy.set(false);
    }
  }
}
