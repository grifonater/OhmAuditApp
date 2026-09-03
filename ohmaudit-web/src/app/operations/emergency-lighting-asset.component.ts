import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ApiService,
  type EmergencyLightFitting,
  type EmergencyLightFittingInput,
} from '../core/api.service';
import { compressPhoto } from '../core/image-compression';

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
  protected readonly asset = signal<
    Awaited<ReturnType<ApiService['getEmergencyLightingAsset']>>['asset'] | undefined
  >(undefined);
  protected readonly query = signal('');
  protected readonly locationFilter = signal('');
  protected readonly groupFilter = signal('');
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
      maintained: fittings.filter(({ operationMode }) => operationMode === 'MAINTAINED').length,
      withKeyswitch: fittings.filter((fitting) => Boolean(this.keyswitchFor(fitting))).length,
      attention: fittings.filter(({ status }) => status !== 'ACTIVE').length,
    };
  });

  constructor() {
    void this.load();
  }

  protected addFitting(): void {
    this.editingId.set('');
    this.fittingForm.reset({ maintained: false });
    this.editorOpen.set(true);
  }

  protected editFitting(fitting: EmergencyLightFitting): void {
    this.editingId.set(fitting.id);
    this.fittingForm.setValue({
      reference: fitting.reference,
      description: fitting.description ?? '',
      locationId: fitting.locationId ?? '',
      groupIds: fitting.groupMappings?.map(({ groupId }) => groupId) ?? [],
      manufacturer: fitting.manufacturer ?? '',
      model: fitting.model ?? '',
      fittingType: fitting.fittingType ?? '',
      maintained: fitting.operationMode === 'MAINTAINED',
      notes: fitting.notes ?? '',
    });
    this.editorOpen.set(true);
  }

  protected closeEditor(event?: Event): void {
    if (event && event.target !== event.currentTarget) return;
    this.editorOpen.set(false);
  }

  protected async saveFitting(): Promise<void> {
    if (this.fittingForm.invalid) return;
    const input = this.clean(this.fittingForm.getRawValue());
    await this.run(async () => {
      const id = this.editingId();
      if (id)
        await this.api.updateEmergencyLightFitting(this.organisationId, this.assetId, id, input);
      else await this.api.addEmergencyLightFitting(this.organisationId, this.assetId, input);
      this.editorOpen.set(false);
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
  protected async addGroup(): Promise<void> {
    const name = this.groupForm.value.trim();
    if (!name) return;
    await this.run(async () => {
      await this.api.addEmergencyLightingGroup(this.organisationId, this.assetId, { name });
      this.groupForm.reset();
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

  private clean(value: typeof this.fittingForm.value): EmergencyLightFittingInput {
    const { groupIds, maintained, ...details } = value;
    return {
      reference: details.reference ?? '',
      groupIds: groupIds ?? [],
      operationMode: maintained ? 'MAINTAINED' : 'NON_MAINTAINED',
      ...Object.fromEntries(
        Object.entries(details).filter(
          ([key, item]) => key !== 'reference' && item !== '' && item !== null,
        ),
      ),
    };
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
