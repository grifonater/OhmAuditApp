import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, type AssetSummary, type EvChargePoint } from '../core/api.service';

type EvAssetDetail = AssetSummary & {
  customer: { id: string; name: string };
  site: { id: string; name: string };
  evChargePoint?: EvChargePoint;
};

@Component({
  selector: 'oa-ev-asset',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './ev-asset.component.html',
  styleUrls: ['./operations.css', './ev-asset.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvAssetComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly assetId = this.route.snapshot.paramMap.get('assetId') ?? '';
  protected readonly asset = signal<EvAssetDetail | undefined>(undefined);
  protected readonly images = signal<
    Array<{ id: string; url: string; caption?: string; fallback?: boolean }>
  >([]);
  protected readonly editingSupplyId = signal('');
  protected readonly editingConnectorId = signal('');
  protected readonly supplyEditorOpen = signal(false);
  protected readonly connectorEditorOpen = signal(false);
  protected readonly connectorSupplyIds = signal<Set<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');

  protected readonly detailsForm = new FormGroup({
    manufacturer: new FormControl('', { nonNullable: true }),
    model: new FormControl('', { nonNullable: true }),
    serialNumber: new FormControl('', { nonNullable: true }),
    chargePointId: new FormControl('', { nonNullable: true }),
    operatorName: new FormControl('', { nonNullable: true }),
    firmwareVersion: new FormControl('', { nonNullable: true }),
    installationDate: new FormControl('', { nonNullable: true }),
    nominalVoltage: new FormControl<number | null>(230),
    phaseCount: new FormControl<number | null>(1),
    maximumPowerKw: new FormControl<number | null>(null),
    dcRcdType: new FormControl<'TYPE_B' | 'RDC_DD' | 'NONE'>('NONE', { nonNullable: true }),
    locationNotes: new FormControl('', { nonNullable: true }),
  });
  protected readonly supplyForm = new FormGroup({
    label: new FormControl('Supply 1', { nonNullable: true, validators: Validators.required }),
    phaseCount: new FormControl(1, { nonNullable: true }),
    protectiveDeviceType: new FormControl('', { nonNullable: true }),
    protectiveDeviceRating: new FormControl<number | null>(null),
    earthingArrangement: new FormControl<'TNCS' | 'TNS' | 'TT' | 'IT'>('TNCS', {
      nonNullable: true,
    }),
  });
  protected readonly connectorForm = new FormGroup({
    label: new FormControl('Connector 1', { nonNullable: true, validators: Validators.required }),
    connectorType: new FormControl('Type 2', {
      nonNullable: true,
      validators: Validators.required,
    }),
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeImages());
    void this.load();
  }

  protected async saveDetails(): Promise<void> {
    const raw = this.detailsForm.getRawValue();
    await this.run(async () => {
      await this.api.updateAsset(this.organisationId, this.assetId, {
        manufacturer: raw.manufacturer,
        model: raw.model,
        serialNumber: raw.serialNumber,
      });
      const charger = {
        chargePointId: raw.chargePointId,
        operatorName: raw.operatorName,
        firmwareVersion: raw.firmwareVersion,
        installationDate: raw.installationDate,
        nominalVoltage: raw.nominalVoltage,
        phaseCount: raw.phaseCount,
        maximumPowerKw: raw.maximumPowerKw,
        dcRcdType: raw.dcRcdType,
        locationNotes: raw.locationNotes,
      };
      await this.api.saveEvChargePoint(this.organisationId, this.assetId, this.clean(charger));
      this.success.set('Charger details saved');
      await this.load();
    });
  }

  protected editSupply(supply: EvChargePoint['supplies'][number]): void {
    this.editingSupplyId.set(supply.id);
    this.supplyForm.setValue({
      label: supply.label,
      phaseCount: supply.phaseCount,
      protectiveDeviceType: supply.protectiveDeviceType ?? '',
      protectiveDeviceRating: supply.protectiveDeviceRating ?? null,
      earthingArrangement: (supply.earthingArrangement as 'TNCS' | 'TNS' | 'TT' | 'IT') ?? 'TNCS',
    });
    this.supplyEditorOpen.set(true);
  }

  protected addSupply(): void {
    this.cancelSupplyEdit();
    const nextNumber = (this.asset()?.evChargePoint?.supplies.length ?? 0) + 1;
    this.supplyForm.patchValue({ label: `Supply ${nextNumber}` });
    this.supplyEditorOpen.set(true);
  }

  protected cancelSupplyEdit(): void {
    this.editingSupplyId.set('');
    this.supplyEditorOpen.set(false);
    this.supplyForm.reset({ label: 'Supply 1', phaseCount: 1, earthingArrangement: 'TNCS' });
  }

  protected closeSupplyOnBackdrop(event: Event): void {
    if (event.target === event.currentTarget) this.cancelSupplyEdit();
  }

  protected async saveSupply(): Promise<void> {
    if (this.supplyForm.invalid) return;
    await this.run(async () => {
      const input = this.clean(this.supplyForm.getRawValue());
      const id = this.editingSupplyId();
      if (id) await this.api.updateEvSupply(this.organisationId, this.assetId, id, input);
      else await this.api.addEvSupply(this.organisationId, this.assetId, input);
      this.cancelSupplyEdit();
      this.success.set(id ? 'Supply updated' : 'Supply added');
      await this.load();
    });
  }

  protected async deleteSupply(id: string): Promise<void> {
    if (!confirm('Delete this supply and remove its connector mappings?')) return;
    await this.run(async () => {
      await this.api.deleteEvSupply(this.organisationId, this.assetId, id);
      this.success.set('Supply deleted');
      await this.load();
      this.removeSupplyFromState(id);
    });
  }

  protected editConnector(connector: EvChargePoint['connectors'][number]): void {
    this.editingConnectorId.set(connector.id);
    this.connectorForm.setValue({ label: connector.label, connectorType: connector.connectorType });
    this.connectorSupplyIds.set(new Set(connector.supplyMappings.map(({ supplyId }) => supplyId)));
    this.connectorEditorOpen.set(true);
  }

  protected addConnector(): void {
    this.cancelConnectorEdit();
    const nextNumber = (this.asset()?.evChargePoint?.connectors.length ?? 0) + 1;
    this.connectorForm.patchValue({ label: `Connector ${nextNumber}` });
    this.connectorEditorOpen.set(true);
  }

  protected chooseConnectorSupply(id: string): void {
    this.connectorSupplyIds.set(id === '' ? new Set() : new Set([id]));
  }

  protected selectedConnectorSupplyId(): string {
    return this.connectorSupplyIds().values().next().value ?? '';
  }

  protected cancelConnectorEdit(): void {
    this.editingConnectorId.set('');
    this.connectorEditorOpen.set(false);
    this.connectorSupplyIds.set(new Set());
    this.connectorForm.reset({ label: 'Connector 1', connectorType: 'Type 2' });
  }

  protected closeConnectorOnBackdrop(event: Event): void {
    if (event.target === event.currentTarget) this.cancelConnectorEdit();
  }

  protected async saveConnector(): Promise<void> {
    if (this.connectorForm.invalid) return;
    await this.run(async () => {
      const input = {
        ...this.connectorForm.getRawValue(),
        supplyIds: [...this.connectorSupplyIds()],
      };
      const id = this.editingConnectorId();
      if (id) await this.api.updateEvConnector(this.organisationId, this.assetId, id, input);
      else await this.api.addEvConnector(this.organisationId, this.assetId, input);
      this.cancelConnectorEdit();
      this.success.set(id ? 'Connector updated' : 'Connector added');
      await this.load();
    });
  }

  protected async deleteConnector(id: string): Promise<void> {
    if (!confirm('Delete this connector?')) return;
    await this.run(async () => {
      await this.api.deleteEvConnector(this.organisationId, this.assetId, id);
      this.success.set('Connector deleted');
      await this.load();
      this.removeConnectorFromState(id);
    });
  }

  protected async uploadImage(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.error.set('Use a JPEG, PNG, or WebP image.');
      return;
    }
    await this.run(async () => {
      const { media } = await this.api.registerMedia(this.organisationId, {
        entityType: 'Asset',
        entityId: this.assetId,
        category: 'asset-image',
        caption: 'EV charger image',
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        size: file.size,
      });
      await this.api.uploadMedia(this.organisationId, media.id, file);
      this.success.set('Asset image uploaded');
      await this.load();
    });
  }

  protected async deleteImage(id: string): Promise<void> {
    if (!confirm('Delete this asset image?')) return;
    await this.run(async () => {
      await this.api.deleteMedia(this.organisationId, id);
      this.success.set('Asset image deleted');
      await this.load();
    });
  }

  private async load(): Promise<void> {
    await this.run(async () => {
      const asset = (await this.api.getEvAsset(this.organisationId, this.assetId)).asset;
      this.asset.set(asset);
      const ev = asset.evChargePoint;
      this.detailsForm.patchValue({
        manufacturer: asset.manufacturer ?? '',
        model: asset.model ?? '',
        serialNumber: asset.serialNumber ?? '',
        chargePointId: ev?.chargePointId ?? '',
        operatorName: ev?.operatorName ?? '',
        firmwareVersion: ev?.firmwareVersion ?? '',
        installationDate: ev?.installationDate?.slice(0, 10) ?? '',
        nominalVoltage: ev?.nominalVoltage ?? null,
        phaseCount: ev?.phaseCount ?? null,
        maximumPowerKw: ev?.maximumPowerKw ?? null,
        dcRcdType: ev?.dcRcdType ?? 'NONE',
        locationNotes: ev?.locationNotes ?? '',
      });
      await this.loadImages(asset);
    });
  }

  private async loadImages(asset: EvAssetDetail): Promise<void> {
    this.revokeImages();
    let images: Array<{ id: string; url: string; caption?: string; fallback?: boolean }> =
      await Promise.all(
        (asset.media ?? []).map(async (media) => ({
          id: media.id,
          ...(media.caption === undefined ? {} : { caption: media.caption }),
          url: URL.createObjectURL(await this.api.downloadMedia(this.organisationId, media.id)),
        })),
      );
    if (images.length === 0) {
      const fallback = await this.api.downloadAssetDisplayImage(this.organisationId, this.assetId);
      images = [
        fallback === null
          ? {
              id: 'generic',
              url: '/images/generic-ev-charger.svg',
              caption: 'Generic EV charger image',
              fallback: true,
            }
          : {
              id: 'stock',
              url: URL.createObjectURL(fallback),
              caption: 'Matched make and model stock image',
              fallback: true,
            },
      ];
    }
    this.images.set(images);
  }

  private revokeImages(): void {
    for (const image of this.images()) {
      if (image.url.startsWith('blob:')) URL.revokeObjectURL(image.url);
    }
    this.images.set([]);
  }

  private removeSupplyFromState(id: string): void {
    this.asset.update((asset) => {
      const chargePoint = asset?.evChargePoint;
      if (asset === undefined || chargePoint === undefined) return asset;
      return {
        ...asset,
        evChargePoint: {
          ...chargePoint,
          supplies: chargePoint.supplies.filter((supply) => supply.id !== id),
          connectors: chargePoint.connectors.map((connector) => ({
            ...connector,
            supplyMappings: connector.supplyMappings.filter(({ supplyId }) => supplyId !== id),
          })),
        },
      };
    });
  }

  private removeConnectorFromState(id: string): void {
    this.asset.update((asset) => {
      const chargePoint = asset?.evChargePoint;
      if (asset === undefined || chargePoint === undefined) return asset;
      return {
        ...asset,
        evChargePoint: {
          ...chargePoint,
          connectors: chargePoint.connectors.filter((connector) => connector.id !== id),
        },
      };
    });
  }

  private clean(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== '' && value !== null),
    );
  }

  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Unable to update EV charger details.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
