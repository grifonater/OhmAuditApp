import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import {
  ApiService,
  type EmergencyLightingLabelFitting,
  type EmergencyLightingLabelSettings,
  type EmergencyLightingLabelStudio,
} from '../core/api.service';
import {
  emergencyLightingAssetPath,
  emergencyLightingFittingPath,
} from '../core/emergency-lighting-routes';

type LabelPreset = EmergencyLightingLabelSettings['preset'];

interface PresetDefinition {
  key: Exclude<LabelPreset, 'CUSTOM'>;
  name: string;
  detail: string;
  rows: number;
  columns: number;
  labelWidthMm: number;
  labelHeightMm: number;
  marginTopMm: number;
  marginLeftMm: number;
  gapXmm: number;
  gapYmm: number;
}

const PRESETS: PresetDefinition[] = [
  {
    key: 'L7160',
    name: 'Avery L7160',
    detail: '21 labels · 63.5 × 38.1 mm',
    rows: 7,
    columns: 3,
    labelWidthMm: 63.5,
    labelHeightMm: 38.1,
    marginTopMm: 15.15,
    marginLeftMm: 7.25,
    gapXmm: 2.5,
    gapYmm: 0,
  },
  {
    key: 'L7162',
    name: 'Avery L7162',
    detail: '16 labels · 99.1 × 33.9 mm',
    rows: 8,
    columns: 2,
    labelWidthMm: 99.1,
    labelHeightMm: 33.9,
    marginTopMm: 12.9,
    marginLeftMm: 4.65,
    gapXmm: 2.5,
    gapYmm: 0,
  },
  {
    key: 'L7163',
    name: 'Avery L7163',
    detail: '14 labels · 99.1 × 38.1 mm',
    rows: 7,
    columns: 2,
    labelWidthMm: 99.1,
    labelHeightMm: 38.1,
    marginTopMm: 15.15,
    marginLeftMm: 4.65,
    gapXmm: 2.5,
    gapYmm: 0,
  },
];

const DEFAULT_SETTINGS: EmergencyLightingLabelSettings = {
  preset: 'L7160',
  rows: 7,
  columns: 3,
  labelWidthMm: 63.5,
  labelHeightMm: 38.1,
  marginTopMm: 15.15,
  marginLeftMm: 7.25,
  gapXmm: 2.5,
  gapYmm: 0,
  paddingMm: 2.5,
  fontScale: 100,
  layout: 'SMART',
  alignment: 'LEFT',
  sortBy: 'REFERENCE',
  border: false,
  borderColour: '#cbd5e1',
  accentColour: '#006b66',
  showOrganisationName: true,
  showOrganisationAddress: false,
  showOrganisationTelephone: false,
  showOrganisationEmail: false,
  showOrganisationWebsite: false,
  showCustomerName: false,
  showSiteName: true,
  showSiteAddress: false,
  showFittingReference: true,
  showFittingDescription: true,
  showFittingType: false,
  showLocation: true,
  showAssetReference: false,
  showManufacturer: false,
  showModel: false,
  showSerialNumber: false,
  showOperationMode: false,
  showQrCode: true,
  showBarcode: false,
  showCustomText: false,
  customText: '',
};

@Component({
  selector: 'oa-emergency-lighting-label-studio',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './emergency-lighting-label-studio.component.html',
  styleUrls: ['./operations.css', './emergency-lighting-label-studio.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmergencyLightingLabelStudioComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly assetId = this.route.snapshot.paramMap.get('assetId') ?? '';
  protected readonly initialFittingId = this.route.snapshot.queryParamMap.get('fittingId');
  protected readonly backPath = emergencyLightingAssetPath(this.organisationId, this.assetId);
  protected readonly presets = PRESETS;
  protected readonly studio = signal<EmergencyLightingLabelStudio | undefined>(undefined);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly selectedIds = signal(new Set<string>());
  protected readonly search = signal('');
  protected readonly qrCodes = signal<Record<string, string>>({});
  protected readonly copies = signal(1);
  protected readonly startPosition = signal(1);
  protected readonly activeTab = signal<'SHEET' | 'FITTINGS' | 'CONTENT' | 'STYLE'>('SHEET');

  protected readonly settingsForm = new FormGroup({
    preset: new FormControl<LabelPreset>('L7160', { nonNullable: true }),
    rows: new FormControl(7, {
      nonNullable: true,
      validators: [Validators.min(1), Validators.max(20)],
    }),
    columns: new FormControl(3, {
      nonNullable: true,
      validators: [Validators.min(1), Validators.max(10)],
    }),
    labelWidthMm: new FormControl(63.5, { nonNullable: true, validators: Validators.min(10) }),
    labelHeightMm: new FormControl(38.1, { nonNullable: true, validators: Validators.min(10) }),
    marginTopMm: new FormControl(15.15, { nonNullable: true, validators: Validators.min(0) }),
    marginLeftMm: new FormControl(7.25, { nonNullable: true, validators: Validators.min(0) }),
    gapXmm: new FormControl(2.5, { nonNullable: true, validators: Validators.min(0) }),
    gapYmm: new FormControl(0, { nonNullable: true, validators: Validators.min(0) }),
    paddingMm: new FormControl(2.5, { nonNullable: true, validators: Validators.min(0) }),
    fontScale: new FormControl(100, { nonNullable: true }),
    layout: new FormControl<EmergencyLightingLabelSettings['layout']>('SMART', {
      nonNullable: true,
    }),
    alignment: new FormControl<EmergencyLightingLabelSettings['alignment']>('LEFT', {
      nonNullable: true,
    }),
    sortBy: new FormControl<EmergencyLightingLabelSettings['sortBy']>('REFERENCE', {
      nonNullable: true,
    }),
    border: new FormControl(false, { nonNullable: true }),
    borderColour: new FormControl('#cbd5e1', { nonNullable: true }),
    accentColour: new FormControl('#006b66', { nonNullable: true }),
    showOrganisationName: new FormControl(true, { nonNullable: true }),
    showOrganisationAddress: new FormControl(false, { nonNullable: true }),
    showOrganisationTelephone: new FormControl(false, { nonNullable: true }),
    showOrganisationEmail: new FormControl(false, { nonNullable: true }),
    showOrganisationWebsite: new FormControl(false, { nonNullable: true }),
    showCustomerName: new FormControl(false, { nonNullable: true }),
    showSiteName: new FormControl(true, { nonNullable: true }),
    showSiteAddress: new FormControl(false, { nonNullable: true }),
    showFittingReference: new FormControl(true, { nonNullable: true }),
    showFittingDescription: new FormControl(true, { nonNullable: true }),
    showFittingType: new FormControl(false, { nonNullable: true }),
    showLocation: new FormControl(true, { nonNullable: true }),
    showAssetReference: new FormControl(false, { nonNullable: true }),
    showManufacturer: new FormControl(false, { nonNullable: true }),
    showModel: new FormControl(false, { nonNullable: true }),
    showSerialNumber: new FormControl(false, { nonNullable: true }),
    showOperationMode: new FormControl(false, { nonNullable: true }),
    showQrCode: new FormControl(true, { nonNullable: true }),
    showBarcode: new FormControl(false, { nonNullable: true }),
    showCustomText: new FormControl(false, { nonNullable: true }),
    customText: new FormControl('', { nonNullable: true }),
  });
  protected readonly settings = signal<EmergencyLightingLabelSettings>(DEFAULT_SETTINGS);

  protected readonly filteredFittings = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.studio()?.fittings ?? [];
    return (this.studio()?.fittings ?? []).filter((fitting) =>
      [
        fitting.reference,
        fitting.description,
        fitting.location?.name,
        fitting.asset.assetReference,
        fitting.asset.displayName,
      ].some((value) => value?.toLowerCase().includes(term)),
    );
  });
  protected readonly selectedFittings = computed(() => {
    const ids = this.selectedIds();
    const selected = (this.studio()?.fittings ?? []).filter(({ id }) => ids.has(id));
    const sortBy = this.settings().sortBy;
    return selected.sort((left, right) => {
      const a =
        sortBy === 'LOCATION'
          ? (left.location?.name ?? '')
          : sortBy === 'ASSET'
            ? left.asset.assetReference
            : left.reference;
      const b =
        sortBy === 'LOCATION'
          ? (right.location?.name ?? '')
          : sortBy === 'ASSET'
            ? right.asset.assetReference
            : right.reference;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  });
  protected readonly capacity = computed(() => this.settings().rows * this.settings().columns);
  protected readonly pages = computed<Array<Array<EmergencyLightingLabelFitting | null>>>(() => {
    const labels = this.selectedFittings().flatMap((fitting) =>
      Array.from({ length: this.copies() }, () => fitting),
    );
    const slots: Array<EmergencyLightingLabelFitting | null> = [
      ...Array.from({ length: Math.max(0, this.startPosition() - 1) }, () => null),
      ...labels,
    ];
    const pages: Array<Array<EmergencyLightingLabelFitting | null>> = [];
    for (let index = 0; index < slots.length; index += this.capacity())
      pages.push(slots.slice(index, index + this.capacity()));
    return pages.length > 0 ? pages : [[]];
  });
  protected readonly geometryFits = computed(() => {
    const value = this.settings();
    const width =
      value.marginLeftMm * 2 +
      value.columns * value.labelWidthMm +
      (value.columns - 1) * value.gapXmm;
    const height =
      value.marginTopMm * 2 + value.rows * value.labelHeightMm + (value.rows - 1) * value.gapYmm;
    return width <= 210.1 && height <= 297.1;
  });

  constructor() {
    this.settingsForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.settings.set(this.settingsForm.getRawValue());
    });
    effect(() => {
      this.pages();
      if (this.settings().showBarcode) setTimeout(() => this.renderBarcodes());
    });
    void this.load();
  }

  protected applyPreset(key: LabelPreset): void {
    const preset = PRESETS.find((item) => item.key === key);
    if (preset) this.settingsForm.patchValue(preset);
    else this.settingsForm.patchValue({ preset: 'CUSTOM' });
  }

  protected markCustom(): void {
    this.settingsForm.controls.preset.setValue('CUSTOM');
  }

  protected toggleFitting(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds.set(next);
  }

  protected selectVisible(): void {
    const next = new Set(this.selectedIds());
    for (const fitting of this.filteredFittings()) next.add(fitting.id);
    this.selectedIds.set(next);
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  protected setCopies(event: Event): void {
    this.copies.set(
      Math.max(1, Math.min(20, Number((event.target as HTMLInputElement).value) || 1)),
    );
  }

  protected setStartPosition(event: Event): void {
    this.startPosition.set(
      Math.max(1, Math.min(this.capacity(), Number((event.target as HTMLInputElement).value) || 1)),
    );
  }

  protected fittingPath(fitting: EmergencyLightingLabelFitting): string[] {
    return emergencyLightingFittingPath(this.organisationId, fitting.asset.id, fitting.id);
  }

  protected organisationName(): string {
    return (
      this.studio()?.organisation.brandProfile?.tradingName ||
      this.studio()?.organisation.name ||
      ''
    );
  }

  protected organisationAddress(): string {
    const brand = this.studio()?.organisation.brandProfile;
    return [brand?.addressLine1, brand?.addressLine2, brand?.city, brand?.county, brand?.postcode]
      .filter(Boolean)
      .join(', ');
  }

  protected siteAddress(): string {
    const site = this.studio()?.site;
    return [site?.addressLine1, site?.addressLine2, site?.city, site?.county, site?.postcode]
      .filter(Boolean)
      .join(', ');
  }

  protected fittingType(fitting: EmergencyLightingLabelFitting): string {
    return fitting.device?.fittingType?.name || fitting.fittingType || '';
  }

  protected async saveSettings(): Promise<void> {
    if (this.settingsForm.invalid) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.api.saveEmergencyLightingLabelSettings(
        this.organisationId,
        this.assetId,
        this.settings(),
      );
      this.notice.set('Label defaults saved for this site.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not save label settings.');
    } finally {
      this.saving.set(false);
    }
  }

  protected print(): void {
    this.renderBarcodes();
    setTimeout(() => window.print());
  }

  private async load(): Promise<void> {
    try {
      const studio = await this.api.getEmergencyLightingLabelStudio(
        this.organisationId,
        this.assetId,
      );
      this.studio.set(studio);
      const saved = studio.site.emergencyLightingLabelSettings;
      const settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
      this.settingsForm.setValue(settings);
      this.settings.set(settings);
      const initial =
        this.initialFittingId && studio.fittings.some(({ id }) => id === this.initialFittingId)
          ? [this.initialFittingId]
          : studio.fittings.map(({ id }) => id);
      this.selectedIds.set(new Set(initial));
      const qrEntries = await Promise.all(
        studio.fittings.map(
          async (fitting) =>
            [
              fitting.id,
              await QRCode.toDataURL(
                `${window.location.origin}${this.fittingPath(fitting).join('/')}`,
                { margin: 0, width: 180 },
              ),
            ] as const,
        ),
      );
      this.qrCodes.set(Object.fromEntries(qrEntries));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not load Label Studio.');
    } finally {
      this.loading.set(false);
    }
  }

  private renderBarcodes(): void {
    document.querySelectorAll<SVGSVGElement>('[data-label-barcode]').forEach((element) => {
      try {
        JsBarcode(element, element.dataset['labelBarcode'] ?? '', {
          format: 'CODE128',
          displayValue: false,
          margin: 0,
          height: 24,
          width: 1.2,
        });
      } catch {
        element.replaceChildren();
      }
    });
  }
}
