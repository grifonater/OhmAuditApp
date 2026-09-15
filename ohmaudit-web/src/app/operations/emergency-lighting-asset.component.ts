import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ApiService,
  type EmergencyLightFitting,
  type EmergencyLightFittingInput,
  type EmergencyLightingDevice,
  type EmergencyLightingFittingType,
  type EmergencyLightingGroup,
  type EmergencyLightingKeyswitch,
  type EmergencyLightingLocation,
} from '../core/api.service';
import { compressPhoto } from '../core/image-compression';
import {
  emergencyLightingFittingPath,
  emergencyLightingLabelStudioPath,
} from '../core/emergency-lighting-routes';

type FittingFormValue = {
  reference: string;
  description: string;
  locationId: string;
  groupIds: string[];
  deviceId: string;
  manufacturer: string;
  model: string;
  fittingType: string;
  maintained: boolean;
  notes: string;
};

@Component({
  selector: 'oa-emergency-lighting-asset',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './emergency-lighting-asset.component.html',
  styleUrls: ['./operations.css', './emergency-lighting.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmergencyLightingAssetComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly assetId = this.route.snapshot.paramMap.get('assetId') ?? '';
  protected readonly labelStudioPath = emergencyLightingLabelStudioPath(
    this.organisationId,
    this.assetId,
  );
  protected readonly asset = signal<
    Awaited<ReturnType<ApiService['getEmergencyLightingAsset']>>['asset'] | undefined
  >(undefined);
  protected readonly query = signal('');
  protected readonly locationFilter = signal('');
  protected readonly groupFilter = signal('');
  protected readonly activeView = signal<'fittings' | 'setup'>('fittings');
  protected readonly selectedFittingId = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly editingId = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

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
    notes: new FormControl('', { nonNullable: true }),
  });

  protected readonly locationForm = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly groupForm = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly keyswitchForm = new FormGroup({
    reference: new FormControl('', { nonNullable: true, validators: Validators.required }),
    locationId: new FormControl('', { nonNullable: true }),
    groupId: new FormControl('', { nonNullable: true }),
  });

  protected readonly fittingTypeForm = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly deviceForm = new FormGroup({
    make: new FormControl('', { nonNullable: true, validators: Validators.required }),
    model: new FormControl('', { nonNullable: true, validators: Validators.required }),
    fittingTypeId: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
  });

  protected readonly editingLocationId = signal('');
  protected readonly editingGroupId = signal('');
  protected readonly editingKeyswitchId = signal('');

  protected readonly filteredFittings = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('en-GB');
    return (this.asset()?.fittings ?? []).filter(
      (fitting) =>
        (!this.locationFilter() || fitting.locationId === this.locationFilter()) &&
        (!this.groupFilter() ||
          fitting.groupMappings?.some(({ groupId }) => groupId === this.groupFilter())) &&
        (!query ||
          [fitting.reference, fitting.description, fitting.manufacturer, fitting.model]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLocaleLowerCase('en-GB').includes(query))),
    );
  });
  protected readonly stats = computed(() => {
    const fittings = this.asset()?.fittings ?? [];
    return {
      total: fittings.length,
      active: fittings.filter(({ status }) => status === 'ACTIVE').length,
      maintained: fittings.filter(({ operationMode }) => operationMode === 'MAINTAINED').length,
      withKeyswitch: fittings.filter((fitting) => Boolean(this.keyswitchFor(fitting))).length,
      attention: fittings.filter(({ status }) => status !== 'ACTIVE').length,
    };
  });
  protected readonly selectedFitting = computed(() => {
    const fittings = this.filteredFittings();
    return fittings.find(({ id }) => id === this.selectedFittingId()) ?? fittings[0];
  });

  protected selectedDevice(): EmergencyLightingDevice | undefined {
    const id = this.fittingForm.getRawValue().deviceId;
    if (!id) return undefined;
    return (this.asset()?.devices ?? []).find((device) => device.id === id);
  }

  protected deviceSelected(): boolean {
    return this.selectedDevice() !== undefined;
  }

  constructor() {
    void this.load();
  }

  protected fittingPath(fitting: EmergencyLightFitting): string[] {
    return emergencyLightingFittingPath(this.organisationId, this.assetId, fitting.id);
  }

  protected selectFitting(fitting: EmergencyLightFitting): void {
    this.selectedFittingId.set(fitting.id);
  }

  protected showView(view: 'fittings' | 'setup'): void {
    this.activeView.set(view);
  }

  protected addFitting(): void {
    this.editingId.set('');
    this.fittingForm.reset({ maintained: false });
    this.fittingForm.patchValue({ reference: this.nextReference() });
    this.editorOpen.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected editFitting(fitting: EmergencyLightFitting): void {
    this.editingId.set(fitting.id);
    this.fittingForm.setValue({
      reference: fitting.reference,
      description: fitting.description ?? '',
      locationId: fitting.locationId ?? '',
      groupIds: fitting.groupMappings?.map(({ groupId }) => groupId) ?? [],
      deviceId: fitting.deviceId ?? '',
      manufacturer: fitting.manufacturer ?? '',
      model: fitting.model ?? '',
      fittingType: fitting.fittingType ?? '',
      maintained: fitting.operationMode === 'MAINTAINED',
      notes: fitting.notes ?? '',
    });
    this.editorOpen.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
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

  protected async saveFitting(): Promise<void> {
    if (this.fittingForm.invalid) return;
    const value = this.fittingForm.getRawValue();
    const device = this.selectedDevice();
    const input = this.cleanFitting(value, device);
    await this.run(async () => {
      const id = this.editingId();
      if (id)
        await this.api.updateEmergencyLightFitting(this.organisationId, this.assetId, id, input);
      else await this.api.addEmergencyLightFitting(this.organisationId, this.assetId, input);
      this.editorOpen.set(false);
      if (!id) this.selectedFittingId.set('');
      this.notice.set(id ? 'Fitting updated.' : 'Fitting added.');
      await this.load(false);
    });
  }

  protected async deleteFitting(fitting: EmergencyLightFitting): Promise<void> {
    if (!confirm(`Delete fitting ${fitting.reference}?`)) return;
    await this.run(async () => {
      await this.api.deleteEmergencyLightFitting(this.organisationId, this.assetId, fitting.id);
      this.notice.set('Fitting deleted.');
      await this.load(false);
    });
  }

  protected async addLocation(): Promise<void> {
    const name = this.locationForm.value.trim();
    if (!name) return;
    await this.run(async () => {
      await this.api.addEmergencyLightingLocation(this.organisationId, this.assetId, { name });
      this.locationForm.reset();
      await this.load(false);
    });
  }
  protected async updateLocation(location: EmergencyLightingLocation): Promise<void> {
    const name = prompt('Rename location', location.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    await this.run(async () => {
      await this.api.updateEmergencyLightingLocation(
        this.organisationId,
        this.assetId,
        location.id,
        {
          name: trimmed,
        },
      );
      await this.load(false);
    });
  }
  protected async deleteLocation(location: EmergencyLightingLocation): Promise<void> {
    if (!confirm(`Delete location ${location.name}?`)) return;
    await this.run(async () => {
      await this.api.deleteEmergencyLightingLocation(
        this.organisationId,
        this.assetId,
        location.id,
      );
      await this.load(false);
    });
  }

  protected async uploadRoomImage(
    location: EmergencyLightingLocation,
    event: Event,
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.run(async () => {
      const image = await compressPhoto(file);
      const { media } = await this.api.registerMedia(this.organisationId, {
        entityType: 'EmergencyLightingLocation',
        entityId: location.id,
        category: 'location-image',
        caption: location.name,
        originalFilename: file.name,
        mimeType: 'image/jpeg',
        size: image.size,
      });
      await this.api.uploadMedia(this.organisationId, media.id, image);
      input.value = '';
      this.notice.set(`Room image added to ${location.name}.`);
      await this.load(false);
    });
  }

  protected async addGroup(): Promise<void> {
    const name = this.groupForm.value.trim();
    if (!name) return;
    await this.run(async () => {
      await this.api.addEmergencyLightingGroup(this.organisationId, this.assetId, { name });
      this.groupForm.reset();
      await this.load(false);
    });
  }
  protected async updateGroup(group: EmergencyLightingGroup): Promise<void> {
    const name = prompt('Rename test group', group.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    await this.run(async () => {
      await this.api.updateEmergencyLightingGroup(this.organisationId, this.assetId, group.id, {
        name: trimmed,
      });
      await this.load(false);
    });
  }
  protected async deleteGroup(group: EmergencyLightingGroup): Promise<void> {
    if (!confirm(`Delete test group ${group.name}?`)) return;
    await this.run(async () => {
      await this.api.deleteEmergencyLightingGroup(this.organisationId, this.assetId, group.id);
      await this.load(false);
    });
  }

  protected async addKeyswitch(): Promise<void> {
    if (this.keyswitchForm.invalid) return;
    const { reference, locationId, groupId } = this.keyswitchForm.getRawValue();
    await this.run(async () => {
      await this.api.addEmergencyLightingKeyswitch(this.organisationId, this.assetId, {
        reference: reference.trim(),
        groupIds: groupId ? [groupId] : [],
        ...(locationId ? { locationId } : {}),
      });
      this.keyswitchForm.reset();
      await this.load(false);
    });
  }
  protected async updateKeyswitch(keyswitch: EmergencyLightingKeyswitch): Promise<void> {
    const reference = prompt('Edit keyswitch reference', keyswitch.reference);
    if (reference === null) return;
    const trimmed = reference.trim();
    if (!trimmed) return;
    await this.run(async () => {
      await this.api.updateEmergencyLightingKeyswitch(
        this.organisationId,
        this.assetId,
        keyswitch.id,
        {
          reference: trimmed,
          groupIds: keyswitch.groupMappings?.map(({ groupId }) => groupId) ?? [],
          ...(keyswitch.locationId ? { locationId: keyswitch.locationId } : {}),
        },
      );
      await this.load(false);
    });
  }
  protected async deleteKeyswitch(keyswitch: EmergencyLightingKeyswitch): Promise<void> {
    if (!confirm(`Delete keyswitch ${keyswitch.reference}?`)) return;
    await this.run(async () => {
      await this.api.deleteEmergencyLightingKeyswitch(
        this.organisationId,
        this.assetId,
        keyswitch.id,
      );
      await this.load(false);
    });
  }

  protected async addFittingType(): Promise<void> {
    const name = this.fittingTypeForm.value.trim();
    if (!name) return;
    await this.run(async () => {
      await this.api.addEmergencyLightingFittingType(this.organisationId, this.assetId, { name });
      this.fittingTypeForm.reset();
      await this.load(false);
    });
  }
  protected async deleteFittingType(type: EmergencyLightingFittingType): Promise<void> {
    if (type.isDefault) return;
    if (!confirm(`Delete fitting type ${type.name}?`)) return;
    await this.run(async () => {
      await this.api.deleteEmergencyLightingFittingType(this.organisationId, this.assetId, type.id);
      await this.load(false);
    });
  }

  protected async addDevice(): Promise<void> {
    if (this.deviceForm.invalid) return;
    const value = this.deviceForm.getRawValue();
    await this.run(async () => {
      await this.api.addEmergencyLightingDevice(this.organisationId, this.assetId, {
        make: value.make.trim(),
        model: value.model.trim(),
        ...(value.fittingTypeId ? { fittingTypeId: value.fittingTypeId } : {}),
        ...(value.description.trim() ? { description: value.description.trim() } : {}),
      });
      this.deviceForm.reset();
      await this.load(false);
    });
  }
  protected async deleteDevice(device: EmergencyLightingDevice): Promise<void> {
    if (!confirm(`Delete device ${device.make} ${device.model}?`)) return;
    await this.run(async () => {
      await this.api.deleteEmergencyLightingDevice(this.organisationId, this.assetId, device.id);
      await this.load(false);
    });
  }

  protected async uploadImage(fitting: EmergencyLightFitting, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.run(async () => {
      const image = await compressPhoto(file);
      const { media } = await this.api.registerMedia(this.organisationId, {
        entityType: 'EmergencyLightFitting',
        entityId: fitting.id,
        category: 'fitting-image',
        caption: fitting.reference,
        originalFilename: file.name,
        mimeType: 'image/jpeg',
        size: image.size,
      });
      await this.api.uploadMedia(this.organisationId, media.id, image);
      input.value = '';
      this.notice.set(`Image added to ${fitting.reference}.`);
      await this.load(false);
    });
  }

  private nextReference(): string {
    let max = 0;
    for (const fitting of this.asset()?.fittings ?? []) {
      const match = fitting.reference.match(/^EL-?(\d+)$/i);
      if (match) max = Math.max(max, parseInt(match[1] ?? '0', 10));
    }
    return `EL-${String(max + 1).padStart(3, '0')}`;
  }

  private cleanFitting(
    value: FittingFormValue,
    device: EmergencyLightingDevice | undefined,
  ): EmergencyLightFittingInput {
    const { groupIds, maintained, deviceId, ...details } = value;
    const result: EmergencyLightFittingInput = {
      reference: details.reference.trim(),
      groupIds: groupIds ?? [],
      operationMode: maintained ? 'MAINTAINED' : 'NON_MAINTAINED',
      ...(deviceId ? { deviceId } : {}),
    };
    if (device !== undefined) {
      result.manufacturer = device.make;
      result.model = device.model;
      if (device.fittingType) result.fittingType = device.fittingType.name;
    } else {
      for (const [key, item] of Object.entries(details)) {
        if (item !== '' && item !== null) {
          (result as unknown as Record<string, unknown>)[key] = item;
        }
      }
    }
    return result;
  }

  protected groupName(fitting: EmergencyLightFitting): string {
    return fitting.groupMappings?.map(({ group }) => group.name).join(', ') || 'No group';
  }
  protected keyswitchFor(fitting: EmergencyLightFitting): string {
    const groupIds = new Set(fitting.groupMappings?.map(({ groupId }) => groupId) ?? []);
    return (
      this.asset()
        ?.keyswitches.filter((keyswitch) =>
          keyswitch.groupMappings?.some(({ groupId }) => groupIds.has(groupId)),
        )
        .map(({ reference }) => reference)
        .join(', ') ?? ''
    );
  }
  private async load(useBusy = true): Promise<void> {
    if (useBusy) this.busy.set(true);
    this.error.set('');
    try {
      this.asset.set(
        (await this.api.getEmergencyLightingAsset(this.organisationId, this.assetId)).asset,
      );
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Unable to load the emergency lighting register.',
      );
    } finally {
      if (useBusy) this.busy.set(false);
    }
  }
  private async run(operation: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update the register.');
    } finally {
      this.busy.set(false);
    }
  }
}
