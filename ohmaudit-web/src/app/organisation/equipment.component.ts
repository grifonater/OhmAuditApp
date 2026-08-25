import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, type OrganisationEquipment } from '../core/api.service';

type EquipmentForm = {
  name: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  calibrationDueAt: string;
  notes: string;
};

const emptyForm = (): EquipmentForm => ({
  name: '',
  equipmentType: 'Thermal imaging camera',
  manufacturer: '',
  model: '',
  serialNumber: '',
  calibrationDueAt: '',
  notes: '',
});

@Component({
  selector: 'oa-equipment',
  imports: [FormsModule, RouterLink],
  templateUrl: './equipment.component.html',
  styleUrl: './equipment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipmentComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly equipment = signal<OrganisationEquipment[]>([]);
  protected readonly query = signal('');
  protected readonly canManage = signal(false);
  protected readonly editingId = signal('');
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected form = emptyForm();
  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.equipment().filter((item) =>
      !query
        ? true
        : [item.name, item.equipmentType, item.manufacturer, item.model, item.serialNumber]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(query)),
    );
  });

  constructor() {
    void this.load();
  }

  protected openCreate(): void {
    this.form = emptyForm();
    this.editingId.set('');
    this.formOpen.set(true);
  }

  protected openEdit(item: OrganisationEquipment): void {
    this.form = {
      name: item.name,
      equipmentType: item.equipmentType,
      manufacturer: item.manufacturer ?? '',
      model: item.model ?? '',
      serialNumber: item.serialNumber ?? '',
      calibrationDueAt: item.calibrationDueAt?.slice(0, 10) ?? '',
      notes: item.notes ?? '',
    };
    this.editingId.set(item.id);
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    if (this.form.name.trim().length < 2 || this.form.equipmentType.trim().length < 2) {
      this.error.set('Enter an equipment name and type.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const input = Object.fromEntries(
      Object.entries(this.form).map(([key, value]) => [key, value.trim() || undefined]),
    ) as EquipmentForm;
    try {
      const result = this.editingId()
        ? await this.api.updateEquipment(this.organisationId, this.editingId(), input)
        : await this.api.createEquipment(this.organisationId, input);
      this.equipment.update((items) =>
        this.editingId()
          ? items.map((item) => (item.id === result.equipment.id ? result.equipment : item))
          : [...items, result.equipment],
      );
      this.formOpen.set(false);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The equipment could not be saved.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async archive(item: OrganisationEquipment): Promise<void> {
    if (!confirm(`Archive ${item.name}? It will no longer be available for new inspections.`))
      return;
    try {
      await this.api.archiveEquipment(this.organisationId, item.id);
      this.equipment.update((items) => items.filter(({ id }) => id !== item.id));
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'The equipment could not be archived.',
      );
    }
  }

  protected calibrationState(item: OrganisationEquipment): string {
    if (!item.calibrationDueAt) return 'No date set';
    return new Date(item.calibrationDueAt) < new Date()
      ? 'Calibration overdue'
      : `Due ${new Date(item.calibrationDueAt).toLocaleDateString('en-GB')}`;
  }

  private async load(): Promise<void> {
    try {
      const [account, result] = await Promise.all([
        this.api.currentUser(),
        this.api.listEquipment(this.organisationId),
      ]);
      this.equipment.set(result.equipment);
      this.canManage.set(
        account.memberships
          .find(({ organisation }) => organisation.id === this.organisationId)
          ?.role.capabilities.includes('organisation.manage') ?? false,
      );
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'The equipment register could not be loaded.',
      );
    }
  }
}
