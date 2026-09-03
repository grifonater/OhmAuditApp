import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  ApiService,
  type EmergencyLightFitting,
  type EmergencyLightFittingInput,
  type EmergencyLightTestResult,
  type EmergencyLightingInspectionContext,
} from '../core/api.service';
import { compressPhoto } from '../core/image-compression';

@Component({
  selector: 'oa-emergency-lighting-inspection',
  imports: [ReactiveFormsModule],
  templateUrl: './emergency-lighting-inspection.component.html',
  styleUrls: ['./operations.css', './emergency-lighting.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmergencyLightingInspectionComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly visitId = this.route.snapshot.paramMap.get('visitId') ?? '';
  protected readonly guestToken = this.route.snapshot.paramMap.get('token') ?? '';
  protected readonly inspectionId = this.route.snapshot.paramMap.get('inspectionId') ?? '';
  protected readonly context = signal<EmergencyLightingInspectionContext | undefined>(undefined);
  protected readonly roomFilter = signal('');
  protected readonly groupFilter = signal('');
  protected readonly busy = signal(false);
  protected readonly savingIds = signal<Set<string>>(new Set());
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly addingFitting = signal(false);
  protected readonly notes = signal<Record<string, string>>({});
  protected readonly signerName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)],
  });
  protected readonly declarationAccepted = signal(false);
  protected readonly durationMinutes = signal<Record<string, number | undefined>>({});

  protected readonly fittingForm = new FormGroup({
    reference: new FormControl('', { nonNullable: true, validators: Validators.required }),
    description: new FormControl('', { nonNullable: true }),
    locationId: new FormControl('', { nonNullable: true }),
    groupId: new FormControl('', { nonNullable: true }),
    fittingType: new FormControl('', { nonNullable: true }),
    manufacturer: new FormControl('', { nonNullable: true }),
    model: new FormControl('', { nonNullable: true }),
    maintained: new FormControl(false, { nonNullable: true }),
  });

  protected readonly visibleFittings = computed(() =>
    (this.context()?.fittings ?? []).filter(
      (fitting) =>
        (!this.roomFilter() || fitting.locationId === this.roomFilter()) &&
        (!this.groupFilter() ||
          fitting.groupMappings?.some(({ groupId }) => groupId === this.groupFilter())),
    ),
  );
  protected readonly locations = computed(() => {
    const values = new Map(
      (this.context()?.system.locations ?? []).map((location) => [location.id, location]),
    );
    for (const fitting of this.context()?.fittings ?? [])
      if (fitting.location) values.set(fitting.location.id, fitting.location);
    return [...values.values()];
  });
  protected readonly groups = computed(() => {
    const values = new Map((this.context()?.system.groups ?? []).map((group) => [group.id, group]));
    for (const fitting of this.context()?.fittings ?? [])
      for (const mapping of fitting.groupMappings ?? [])
        values.set(mapping.group.id, mapping.group);
    return [...values.values()];
  });
  protected readonly resultMap = computed(
    () => new Map((this.context()?.results ?? []).map((result) => [result.fittingId, result])),
  );
  protected readonly completed = computed(
    () =>
      (this.context()?.fittings ?? []).filter((fitting) => this.resultMap().has(fitting.id)).length,
  );
  protected readonly progress = computed(() => {
    const total = this.context()?.fittings.length ?? 0;
    return total ? Math.round((this.completed() / total) * 100) : 0;
  });
  protected readonly testType = computed<'FUNCTIONAL' | 'DURATION'>(() =>
    /duration|annual/iu.test(this.context()?.inspection.inspectionType ?? '')
      ? 'DURATION'
      : 'FUNCTIONAL',
  );

  constructor() {
    void this.load();
  }

  protected resultFor(fittingId: string): EmergencyLightTestResult | undefined {
    return this.resultMap().get(fittingId)?.outcome;
  }
  protected noteFor(fittingId: string): string {
    return this.notes()[fittingId] ?? this.resultMap().get(fittingId)?.notes ?? '';
  }
  protected setNote(fittingId: string, value: string): void {
    this.notes.update((notes) => ({ ...notes, [fittingId]: value }));
  }

  protected async chooseResult(
    fitting: EmergencyLightFitting,
    result: EmergencyLightTestResult,
  ): Promise<void> {
    await this.saveResult(fitting.id, result, this.noteFor(fitting.id));
  }
  protected durationFor(fittingId: string): number | undefined {
    return this.durationMinutes()[fittingId] ?? this.resultMap().get(fittingId)?.durationMinutes;
  }
  protected setDuration(fittingId: string, value: string): void {
    this.durationMinutes.update((items) => ({
      ...items,
      [fittingId]: value === '' ? undefined : Number(value),
    }));
  }
  protected async saveNote(fitting: EmergencyLightFitting): Promise<void> {
    const result = this.resultFor(fitting.id);
    if (result) await this.saveResult(fitting.id, result, this.noteFor(fitting.id));
  }

  protected async bulkPass(): Promise<void> {
    const fittings = this.visibleFittings().filter((fitting) => !this.resultMap().has(fitting.id));
    if (!fittings.length) return;
    if (
      !confirm(
        `Mark ${fittings.length} untested fitting${fittings.length === 1 ? '' : 's'} as pass?`,
      )
    )
      return;
    this.busy.set(true);
    this.error.set('');
    try {
      const input = {
        fittingIds: fittings.map(({ id }) => id),
        outcome: 'PASS' as const,
        testType: this.testType(),
      };
      if (this.guestToken)
        await this.api.bulkSaveGuestEmergencyLightingResults(
          this.guestToken,
          this.inspectionId,
          input,
        );
      else
        await this.api.bulkSaveEmergencyLightingResults(
          this.organisationId,
          this.inspectionId,
          input,
        );
      await this.load(false);
      this.notice.set(`${fittings.length} fittings marked as pass.`);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save bulk results.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async addFitting(): Promise<void> {
    if (this.fittingForm.invalid || !this.context()) return;
    const raw = this.fittingForm.getRawValue();
    const { groupId, maintained, ...details } = raw;
    const input: EmergencyLightFittingInput = {
      reference: details.reference,
      ...(details.description ? { description: details.description } : {}),
      ...(details.locationId ? { locationId: details.locationId } : {}),
      ...(details.fittingType ? { fittingType: details.fittingType } : {}),
      ...(details.manufacturer ? { manufacturer: details.manufacturer } : {}),
      ...(details.model ? { model: details.model } : {}),
      groupIds: groupId ? [groupId] : [],
      operationMode: maintained ? 'MAINTAINED' : 'NON_MAINTAINED',
    };
    this.busy.set(true);
    this.error.set('');
    try {
      const response = this.guestToken
        ? await this.api.addGuestEmergencyLightFitting(this.guestToken, this.inspectionId, input)
        : await this.api.addEmergencyLightFittingDuringInspection(
            this.organisationId,
            this.inspectionId,
            input,
          );
      this.context.update((context) =>
        context ? { ...context, fittings: [...context.fittings, response.fitting] } : context,
      );
      this.fittingForm.reset({ maintained: false });
      this.addingFitting.set(false);
      this.notice.set('Fitting added to this inspection.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to add the fitting.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async submit(): Promise<void> {
    const context = this.context();
    if (
      !context ||
      this.completed() !== context.fittings.length ||
      this.signerName.invalid ||
      !this.declarationAccepted()
    )
      return;
    const results = [...this.resultMap().values()];
    const failed = results.filter(({ outcome }) => outcome === 'FAIL');
    this.busy.set(true);
    this.error.set('');
    try {
      const signerName = this.signerName.value.trim();
      const submission = {
        data: {
          outcome: failed.length === 0 ? 'PASS' : 'FAIL',
          testType: this.testType(),
          fittingCount: context.fittings.length,
          passedCount: results.filter(({ outcome }) => outcome === 'PASS').length,
          failedCount: failed.length,
          notTestedCount: results.filter(({ outcome }) => outcome === 'NOT_TESTED').length,
        },
        validation: { allFittingsRecorded: true },
        signature: {
          signerName,
          signerRole: 'Engineer',
          signatureData: `typed:${signerName}:${new Date().toISOString()}`,
        },
        defects: failed.map((result) => {
          const fitting = context.fittings.find(({ id }) => id === result.fittingId);
          return {
            title: `${fitting?.reference ?? 'Emergency light'} failed ${this.testType().toLocaleLowerCase('en-GB')} test`,
            ...(result.notes ? { description: result.notes } : {}),
            severity: 'MAJOR' as const,
          };
        }),
      };
      if (this.guestToken)
        await this.api.submitGuestInspection(this.guestToken, this.inspectionId, submission);
      else await this.api.submitInspection(this.organisationId, this.inspectionId, submission);
      this.notice.set('Inspection submitted for review.');
      this.context.update((value) =>
        value ? { ...value, inspection: { ...value.inspection, status: 'SUBMITTED' } } : value,
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to submit the inspection.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async capture(fitting: EmergencyLightFitting, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.markSaving(fitting.id, true);
    this.error.set('');
    try {
      const image = await compressPhoto(file);
      if (this.guestToken) {
        await this.api.uploadGuestInspectionPhoto(
          this.guestToken,
          this.inspectionId,
          image,
          fitting.id,
        );
      } else {
        const { media } = await this.api.registerMedia(this.organisationId, {
          entityType: 'Inspection',
          entityId: this.inspectionId,
          category: 'emergency-lighting-evidence',
          caption: fitting.reference,
          originalFilename: file.name,
          tags: [`fitting:${fitting.id}`],
          mimeType: 'image/jpeg',
          size: image.size,
        });
        await this.api.uploadMedia(this.organisationId, media.id, image);
      }
      input.value = '';
      this.notice.set(`Photo attached to ${fitting.reference}.`);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to upload the photo.');
    } finally {
      this.markSaving(fitting.id, false);
    }
  }

  private async saveResult(
    fittingId: string,
    result: EmergencyLightTestResult,
    notes: string,
  ): Promise<void> {
    this.markSaving(fittingId, true);
    this.error.set('');
    try {
      const durationMinutes = this.durationFor(fittingId);
      const input = {
        fittingId,
        outcome: result,
        testType: this.testType(),
        ...(this.testType() === 'DURATION' && durationMinutes !== undefined
          ? { durationMinutes }
          : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const response = this.guestToken
        ? await this.api.saveGuestEmergencyLightingResult(this.guestToken, this.inspectionId, input)
        : await this.api.saveEmergencyLightingResult(this.organisationId, this.inspectionId, input);
      this.context.update((context) =>
        context
          ? { ...context, results: this.mergeResults(context.results, [response.result]) }
          : context,
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save the result.');
    } finally {
      this.markSaving(fittingId, false);
    }
  }
  private mergeResults(
    current: EmergencyLightingInspectionContext['results'],
    updates: EmergencyLightingInspectionContext['results'],
  ) {
    const merged = new Map(current.map((result) => [result.fittingId, result]));
    for (const result of updates) merged.set(result.fittingId, result);
    return [...merged.values()];
  }
  private markSaving(id: string, saving: boolean): void {
    const ids = new Set(this.savingIds());
    if (saving) ids.add(id);
    else ids.delete(id);
    this.savingIds.set(ids);
  }
  private async load(showBusy = true): Promise<void> {
    if (showBusy) this.busy.set(true);
    this.error.set('');
    try {
      const context = this.guestToken
        ? await this.api.getGuestEmergencyLightingInspectionContext(
            this.guestToken,
            this.inspectionId,
          )
        : await this.api.getEmergencyLightingInspectionContext(
            this.organisationId,
            this.inspectionId,
          );
      this.context.set(context);
      this.notes.set(
        Object.fromEntries(context.results.map((result) => [result.fittingId, result.notes ?? ''])),
      );
      this.durationMinutes.set(
        Object.fromEntries(
          context.results.map((result) => [result.fittingId, result.durationMinutes]),
        ),
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load the inspection.');
    } finally {
      if (showBusy) this.busy.set(false);
    }
  }
}
