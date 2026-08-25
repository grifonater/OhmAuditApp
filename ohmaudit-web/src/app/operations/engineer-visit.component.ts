import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, merge } from 'rxjs';
import {
  ApiService,
  type EvChargePoint,
  type InspectionSummary,
  type VisitSummary,
  type VisitTask,
} from '../core/api.service';
import { OfflineVisitService } from '../core/offline-visit.service';

type ResultChoice = 'PASS' | 'FAIL' | 'NOT_TESTED';
type SupplyTestGroup = FormGroup<{
  id: FormControl<string>;
  label: FormControl<string>;
  phaseCount: FormControl<number>;
  protectiveDeviceType: FormControl<string>;
  protectiveDeviceRating: FormControl<number | null>;
  earthingArrangement: FormControl<string>;
  zsOhms: FormControl<number | null>;
  maximumPfcKa: FormControl<number | null>;
}>;
type ConnectorTestGroup = FormGroup<{
  id: FormControl<string>;
  label: FormControl<string>;
  connectorType: FormControl<string>;
  supplyIds: FormControl<string[]>;
  pePreTest: FormControl<ResultChoice>;
  cpError: FormControl<ResultChoice>;
  peError: FormControl<ResultChoice>;
  cpStates: FormControl<ResultChoice>;
  rcd1x0Ms: FormControl<number | null>;
  rcd1x180Ms: FormControl<number | null>;
  rcd5x0Ms: FormControl<number | null>;
  rcd5x180Ms: FormControl<number | null>;
  dcRamp0Ma: FormControl<number | null>;
  dcRamp180Ma: FormControl<number | null>;
}>;

@Component({
  selector: 'oa-engineer-visit',
  imports: [ReactiveFormsModule],
  templateUrl: './engineer-visit.component.html',
  styleUrls: ['./operations.css', './engineer-visit.mobile.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EngineerVisitComponent {
  private readonly api = inject(ApiService);
  protected readonly offline = inject(OfflineVisitService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly visitId = this.route.snapshot.paramMap.get('visitId') ?? '';
  protected readonly guestToken = this.route.snapshot.paramMap.get('token') ?? '';
  protected readonly visit = signal<VisitSummary | undefined>(undefined);
  protected readonly selectedTask = signal<VisitTask | undefined>(undefined);
  protected readonly inspection = signal<InspectionSummary | undefined>(undefined);
  protected readonly assetImageUrl = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly saved = signal('');
  protected readonly photoCount = signal(0);
  protected readonly submitted = signal(false);
  protected readonly recentlySubmittedTaskId = signal('');
  protected readonly addingCharger = signal(false);
  protected readonly recordingFault = signal(false);

  protected readonly form = new FormGroup({
    outcome: new FormControl('PASS', { nonNullable: true, validators: Validators.required }),
    visualCondition: new FormControl('PASS', { nonNullable: true }),
    polarity: new FormControl('PASS', { nonNullable: true }),
    functionalOperation: new FormControl('PASS', { nonNullable: true }),
    protectiveConductorContinuity: new FormControl<number | null>(null),
    insulationResistance: new FormControl<number | null>(null),
    earthLoopImpedance: new FormControl<number | null>(null),
    rcdTripTime: new FormControl<number | null>(null),
    notes: new FormControl('', { nonNullable: true }),
    defectTitle: new FormControl('', { nonNullable: true }),
    defectSeverity: new FormControl('MINOR', { nonNullable: true }),
    signerName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });
  protected readonly evAssetForm = new FormGroup({
    manufacturer: new FormControl('', { nonNullable: true }),
    model: new FormControl('', { nonNullable: true }),
    serialNumber: new FormControl('', { nonNullable: true }),
    maximumPowerKw: new FormControl<number | null>(null),
    dcRcdType: new FormControl<'TYPE_B' | 'RDC_DD' | 'NONE'>('NONE', { nonNullable: true }),
  });
  protected readonly supplyTests = new FormArray<SupplyTestGroup>([]);
  protected readonly connectorTests = new FormArray<ConnectorTestGroup>([]);
  protected readonly newChargerForm = new FormGroup({
    assetReference: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    manufacturer: new FormControl('', { nonNullable: true }),
    model: new FormControl('', { nonNullable: true }),
    serialNumber: new FormControl('', { nonNullable: true }),
    maximumPowerKw: new FormControl<number | null>(null),
    dcRcdType: new FormControl<'TYPE_B' | 'RDC_DD' | 'NONE'>('NONE', { nonNullable: true }),
  });

  constructor() {
    merge(
      this.form.valueChanges,
      this.evAssetForm.valueChanges,
      this.supplyTests.valueChanges,
      this.connectorTests.valueChanges,
    )
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.saveDraft());
    merge(this.evAssetForm.controls.dcRcdType.valueChanges, this.connectorTests.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyAutomaticRcdOutcome());
    this.destroyRef.onDestroy(() => this.revokeAssetImage());
    void this.load();
  }

  protected isEvTask(): boolean {
    return this.selectedTask()?.moduleKey === 'ev-charging';
  }

  protected async downloadPack(): Promise<void> {
    const visit = this.visit();
    if (!visit) return;
    await this.run(async () => {
      if (this.guestToken) {
        const tasks = await Promise.all(
          visit.tasks.map(async (task) =>
            task.inspection
              ? task
              : {
                  ...task,
                  inspection: (await this.api.startGuestInspection(this.guestToken, task.id))
                    .inspection,
                },
          ),
        );
        const preparedVisit = { ...visit, tasks };
        this.visit.set(preparedVisit);
        await this.offline.storePack(visit.organisationId, preparedVisit, this.guestToken);
      } else {
        for (const task of visit.tasks)
          if (!task.inspection) await this.api.startInspection(this.organisationId, task.id);
        const refreshed = (await this.api.getVisit(this.organisationId, visit.id)).visit;
        this.visit.set(refreshed);
        await this.offline.storePack(this.organisationId, refreshed);
      }
      await this.cacheAssetImages(this.visit() ?? visit);
      const verified = await this.offline.pack(this.visitId, this.guestToken || undefined);
      if (verified === undefined)
        throw new Error('The visit could not be verified for offline use on this device.');
      this.saved.set('Offline ready — visit verified on this device');
    });
  }

  protected async openTask(task: VisitTask): Promise<void> {
    if (task.moduleKey === 'thermal-imaging') {
      await this.router.navigate(
        this.guestToken
          ? ['/guest/visit', this.guestToken, 'thermal', task.id]
          : ['/app/org', this.organisationId, 'visits', this.visitId, 'thermal', task.id],
      );
      return;
    }
    await this.run(async () => {
      this.setFaultRecording(false, false);
      this.selectedTask.set(task);
      let inspection = task.inspection as InspectionSummary | undefined;
      if (!inspection)
        inspection = this.guestToken
          ? (await this.api.startGuestInspection(this.guestToken, task.id)).inspection
          : (await this.api.startInspection(this.organisationId, task.id)).inspection;
      this.inspection.set(inspection);
      this.prepareEvForms(task);
      await this.loadAssetImage(task);
      const draft = await this.offline.draft(inspection.id);
      if (draft) this.restoreDraft(draft);
      this.photoCount.set(await this.offline.photoCount(inspection.id));
    });
  }

  protected choose(
    control: 'outcome' | 'visualCondition' | 'polarity' | 'functionalOperation',
    value: string,
  ): void {
    if (control === 'outcome' && value === 'PASS' && this.automaticRcdFailures().length > 0) return;
    this.form.controls[control].setValue(value);
  }

  protected scrollToSection(sectionId: string): void {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected tripReadingFailed(value: number | null, maximumMs: number): boolean {
    return typeof value === 'number' && value > maximumMs;
  }

  protected rampReadingFailed(value: number | null): boolean {
    return (
      this.evAssetForm.controls.dcRcdType.value === 'RDC_DD' &&
      typeof value === 'number' &&
      value > 6
    );
  }

  protected automaticRcdFailures(): string[] {
    const failures: string[] = [];
    const dcRcdType = this.evAssetForm.controls.dcRcdType.value;
    for (const [index, connector] of this.connectorTests.getRawValue().entries()) {
      const name = `Connector ${index + 1}`;
      if (this.tripReadingFailed(connector.rcd1x0Ms, 300))
        failures.push(`${name}: 1× at 0° is ${connector.rcd1x0Ms} ms (maximum 300 ms)`);
      if (this.tripReadingFailed(connector.rcd1x180Ms, 300))
        failures.push(`${name}: 1× at 180° is ${connector.rcd1x180Ms} ms (maximum 300 ms)`);
      if (this.tripReadingFailed(connector.rcd5x0Ms, 40))
        failures.push(`${name}: 5× at 0° is ${connector.rcd5x0Ms} ms (maximum 40 ms)`);
      if (this.tripReadingFailed(connector.rcd5x180Ms, 40))
        failures.push(`${name}: 5× at 180° is ${connector.rcd5x180Ms} ms (maximum 40 ms)`);
      if (dcRcdType === 'RDC_DD' && this.rampReadingFailed(connector.dcRamp0Ma))
        failures.push(`${name}: RDC-DD ramp at 0° is ${connector.dcRamp0Ma} mA (maximum 6 mA)`);
      if (dcRcdType === 'RDC_DD' && this.rampReadingFailed(connector.dcRamp180Ma))
        failures.push(`${name}: RDC-DD ramp at 180° is ${connector.dcRamp180Ma} mA (maximum 6 mA)`);
    }
    return failures;
  }

  private applyAutomaticRcdOutcome(): void {
    if (this.automaticRcdFailures().length > 0)
      this.form.controls.outcome.setValue('FAIL', { emitEvent: false });
  }

  protected chooseConnector(group: ConnectorTestGroup, control: string, value: ResultChoice): void {
    group.get(control)?.setValue(value);
  }

  protected setFaultRecording(recording: boolean, save = true): void {
    this.recordingFault.set(recording);
    const title = this.form.controls.defectTitle;
    if (recording) {
      title.setValidators([Validators.required, Validators.minLength(3)]);
    } else {
      title.clearValidators();
      title.setValue('', { emitEvent: false });
      this.form.controls.defectSeverity.setValue('MINOR', { emitEvent: false });
      this.form.controls.notes.setValue('', { emitEvent: false });
    }
    title.updateValueAndValidity({ emitEvent: false });
    if (save) void this.saveDraft();
  }

  protected addSupply(): void {
    this.supplyTests.push(this.supplyGroup());
  }

  protected removeSupply(index: number): void {
    const id = this.supplyTests.at(index).controls.id.value;
    this.supplyTests.removeAt(index);
    for (const connector of this.connectorTests.controls)
      if (connector.controls.supplyIds.value.includes(id))
        connector.controls.supplyIds.setValue([]);
  }

  protected addConnector(): void {
    this.connectorTests.push(this.connectorGroup());
  }

  protected removeConnector(index: number): void {
    this.connectorTests.removeAt(index);
  }

  protected chooseConnectorSupply(group: ConnectorTestGroup, supplyId: string): void {
    group.controls.supplyIds.setValue(supplyId === '' ? [] : [supplyId]);
  }

  protected async addCharger(): Promise<void> {
    const visit = this.visit();
    if (!visit || this.newChargerForm.invalid) return;
    if (!this.offline.online()) {
      this.error.set('Connect to the internet before adding a charger to this site.');
      return;
    }
    const raw = this.newChargerForm.getRawValue();
    await this.run(async () => {
      const input = {
        assetReference: raw.assetReference.trim(),
        displayName: raw.displayName,
        ...(raw.manufacturer.trim() === '' ? {} : { manufacturer: raw.manufacturer.trim() }),
        ...(raw.model.trim() === '' ? {} : { model: raw.model.trim() }),
        ...(raw.serialNumber.trim() === '' ? {} : { serialNumber: raw.serialNumber.trim() }),
        ...(raw.maximumPowerKw === null ? {} : { maximumPowerKw: raw.maximumPowerKw }),
        dcRcdType: raw.dcRcdType,
      };
      const created = this.guestToken
        ? await this.api.addGuestVisitEvAsset(this.guestToken, input)
        : await this.api.addVisitEvAsset(this.organisationId, visit.id, input);
      const refreshed = this.guestToken
        ? (await this.api.guestVisit(this.guestToken)).visit
        : (await this.api.getVisit(this.organisationId, visit.id)).visit;
      this.visit.set(refreshed);
      this.recentlySubmittedTaskId.set(created.task.id);
      this.addingCharger.set(false);
      this.newChargerForm.reset({
        assetReference: '',
        displayName: '',
        manufacturer: '',
        model: '',
        serialNumber: '',
        maximumPowerKw: null,
        dcRcdType: 'NONE',
      });
      this.saved.set('Charger recorded for office approval and added to this visit');
    });
  }

  protected supplyLabel(id: string): string {
    return String(
      this.supplyTests.controls.find((group) => group.get('id')?.value === id)?.get('label')
        ?.value ?? id,
    );
  }

  protected evReady(): boolean {
    if (!this.isEvTask()) return true;
    if (this.supplyTests.length === 0 || this.connectorTests.length === 0) return false;
    const suppliesReady = this.supplyTests
      .getRawValue()
      .every(
        (supply) =>
          typeof supply['zsOhms'] === 'number' && typeof supply['maximumPfcKa'] === 'number',
      );
    const useRamp = this.evAssetForm.controls.dcRcdType.value !== 'NONE';
    const connectorsReady = this.connectorTests
      .getRawValue()
      .every(
        (connector) =>
          [connector.pePreTest, connector.cpError, connector.peError, connector.cpStates].every(
            (result) => result === 'PASS' || result === 'FAIL',
          ) &&
          typeof connector.rcd1x0Ms === 'number' &&
          typeof connector.rcd1x180Ms === 'number' &&
          typeof connector.rcd5x0Ms === 'number' &&
          typeof connector.rcd5x180Ms === 'number' &&
          connector.supplyIds.length === 1 &&
          (!useRamp ||
            (typeof connector.dcRamp0Ma === 'number' && typeof connector.dcRamp180Ma === 'number')),
      );
    return suppliesReady && connectorsReady;
  }

  protected async capturePhoto(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    const inspection = this.inspection();
    const visit = this.visit();
    const assetId = this.selectedTask()?.asset?.id;
    if (!file || !inspection || !visit || !assetId) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.error.set('Use a JPEG, PNG, or WebP photo.');
      return;
    }
    await this.offline.storePhoto(
      visit.organisationId,
      visit.id,
      inspection.id,
      assetId,
      this.guestToken || undefined,
      file,
    );
    this.photoCount.set(await this.offline.photoCount(inspection.id));
  }

  protected async submit(): Promise<void> {
    const inspection = this.inspection();
    const visit = this.visit();
    const task = this.selectedTask();
    if (
      !inspection ||
      !visit ||
      !task ||
      this.form.controls.signerName.invalid ||
      (this.recordingFault() && this.form.controls.defectTitle.invalid)
    )
      return;
    const automaticRcdFailures = this.isEvTask() ? this.automaticRcdFailures() : [];
    if (automaticRcdFailures.length > 0)
      this.form.controls.outcome.setValue('FAIL', { emitEvent: false });
    const value = this.form.getRawValue();
    const evSubmission = this.isEvTask() ? this.buildEvSubmission(task) : undefined;
    const tests = this.isEvTask()
      ? {
          outcome: value.outcome,
          engineerObservations: value.notes,
          supplyCount: this.supplyTests.length,
          connectorCount: this.connectorTests.length,
          offlinePhotoCount: this.photoCount(),
        }
      : {
          outcome: value.outcome,
          visualCondition: value.visualCondition,
          polarity: value.polarity,
          protectiveConductorContinuity: value.protectiveConductorContinuity,
          insulationResistance: value.insulationResistance,
          earthLoopImpedance: value.earthLoopImpedance,
          rcdTripTime: value.rcdTripTime,
          functionalOperation: value.functionalOperation,
          notes: value.notes,
          offlinePhotoCount: this.photoCount(),
        };
    const submission = {
      data: tests,
      validation: this.validation(tests),
      signature: {
        signerName: value.signerName,
        signerRole: 'Engineer',
        signatureData: `typed:${value.signerName}:${new Date().toISOString()}`,
      },
      defects: [
        ...(automaticRcdFailures.length > 0
          ? [
              {
                assetId: task.asset?.id,
                title: 'Faulty RCD reading',
                description: automaticRcdFailures.join('; '),
                severity: 'MAJOR' as const,
              },
            ]
          : []),
        ...(this.recordingFault() && value.defectTitle
          ? [
              {
                assetId: task.asset?.id,
                title: value.defectTitle,
                description: value.notes,
                severity: value.defectSeverity,
              },
            ]
          : []),
      ],
      ...(evSubmission === undefined ? {} : evSubmission),
    };
    await this.run(async () => {
      const readySubmission = this.offline.online()
        ? this.offline.withPhotoIds(
            submission,
            await this.offline.uploadInspectionPhotos(inspection.id),
          )
        : submission;
      this.photoCount.set(await this.offline.photoCount(inspection.id));
      if (this.offline.online()) {
        if (this.guestToken)
          await this.api.submitGuestInspection(this.guestToken, inspection.id, readySubmission);
        else await this.api.submitInspection(this.organisationId, inspection.id, readySubmission);
      } else if (this.guestToken)
        await this.offline.queueGuest(
          this.guestToken,
          visit.organisationId,
          visit.id,
          task.id,
          inspection.id,
          submission,
        );
      else
        await this.offline.queue(
          this.organisationId,
          visit.id,
          'Inspection',
          'SUBMIT_INSPECTION',
          {
            inspectionId: inspection.id,
            submission,
          },
          task.id,
        );
      this.submitted.set(true);
      this.recentlySubmittedTaskId.set(task.id);
      const updatedVisit = this.markTaskSubmitted(visit, new Set([task.id]));
      this.visit.set(updatedVisit);
      await this.offline.storePack(
        updatedVisit.organisationId,
        updatedVisit,
        this.guestToken || undefined,
      );
      this.saved.set(
        this.offline.online() ? 'Inspection submitted' : 'Queued safely — will sync when online',
      );
    });
  }

  protected async backToTasks(): Promise<void> {
    if (this.offline.online()) {
      try {
        const refreshed = this.guestToken
          ? (await this.api.guestVisit(this.guestToken)).visit
          : (await this.api.getVisit(this.organisationId, this.visitId)).visit;
        this.visit.set(await this.applyPendingTaskStatuses(refreshed));
      } catch {
        // Preserve the locally updated task state when a refresh is temporarily unavailable.
      }
    }
    this.selectedTask.set(undefined);
    this.inspection.set(undefined);
    this.submitted.set(false);
    this.revokeAssetImage();
  }

  private prepareEvForms(task: VisitTask): void {
    this.supplyTests.clear();
    this.connectorTests.clear();
    if (task.moduleKey !== 'ev-charging') return;
    const asset = task.asset;
    const ev = asset?.evChargePoint;
    this.evAssetForm.setValue({
      manufacturer: asset?.manufacturer ?? '',
      model: asset?.model ?? '',
      serialNumber: asset?.serialNumber ?? '',
      maximumPowerKw: ev?.maximumPowerKw ?? null,
      dcRcdType: ev?.dcRcdType ?? 'NONE',
    });
    for (const supply of ev?.supplies ?? []) this.supplyTests.push(this.supplyGroup(supply));
    for (const connector of ev?.connectors ?? [])
      this.connectorTests.push(this.connectorGroup(connector));
  }

  private supplyGroup(supply?: EvChargePoint['supplies'][number]): SupplyTestGroup {
    return new FormGroup({
      id: new FormControl(supply?.id ?? `new-${crypto.randomUUID()}`, { nonNullable: true }),
      label: new FormControl(supply?.label ?? `Supply ${this.supplyTests.length + 1}`, {
        nonNullable: true,
        validators: Validators.required,
      }),
      phaseCount: new FormControl(supply?.phaseCount ?? 1, { nonNullable: true }),
      protectiveDeviceType: new FormControl(
        ['MCB', 'RCBO', 'AFDD'].includes(supply?.protectiveDeviceType ?? '')
          ? (supply?.protectiveDeviceType ?? 'MCB')
          : 'MCB',
        {
          nonNullable: true,
          validators: Validators.required,
        },
      ),
      protectiveDeviceRating: new FormControl<number | null>(
        supply?.protectiveDeviceRating ?? null,
      ),
      earthingArrangement: new FormControl(supply?.earthingArrangement ?? 'TNCS', {
        nonNullable: true,
      }),
      zsOhms: new FormControl<number | null>(null, Validators.required),
      maximumPfcKa: new FormControl<number | null>(null, Validators.required),
    });
  }

  private connectorGroup(connector?: EvChargePoint['connectors'][number]): ConnectorTestGroup {
    return new FormGroup({
      id: new FormControl(connector?.id ?? `new-${crypto.randomUUID()}`, { nonNullable: true }),
      label: new FormControl(connector?.label ?? `Connector ${this.connectorTests.length + 1}`, {
        nonNullable: true,
        validators: Validators.required,
      }),
      connectorType: new FormControl(connector?.connectorType ?? 'Type 2', { nonNullable: true }),
      supplyIds: new FormControl(
        connector?.supplyMappings[0] === undefined ? [] : [connector.supplyMappings[0].supplyId],
        { nonNullable: true },
      ),
      pePreTest: new FormControl<ResultChoice>('NOT_TESTED', { nonNullable: true }),
      cpError: new FormControl<ResultChoice>('NOT_TESTED', { nonNullable: true }),
      peError: new FormControl<ResultChoice>('NOT_TESTED', { nonNullable: true }),
      cpStates: new FormControl<ResultChoice>('NOT_TESTED', { nonNullable: true }),
      rcd1x0Ms: new FormControl<number | null>(null),
      rcd1x180Ms: new FormControl<number | null>(null),
      rcd5x0Ms: new FormControl<number | null>(null),
      rcd5x180Ms: new FormControl<number | null>(null),
      dcRamp0Ma: new FormControl<number | null>(null),
      dcRamp180Ma: new FormControl<number | null>(null),
    });
  }

  private buildEvSubmission(task: VisitTask): Record<string, unknown> {
    const assetDetails = this.evAssetForm.getRawValue();
    const supplies = this.supplyTests.getRawValue();
    const connectors = this.connectorTests.getRawValue();
    const stableSupplies = supplies.map((supply) => ({
      id: supply['id'],
      label: supply['label'],
      phaseCount: supply['phaseCount'],
      protectiveDeviceType: supply['protectiveDeviceType'],
      protectiveDeviceRating: supply['protectiveDeviceRating'],
      earthingArrangement: supply['earthingArrangement'],
    }));
    const stableConnectors = connectors.map((connector) => ({
      id: connector['id'],
      label: connector['label'],
      connectorType: connector['connectorType'],
      supplyIds: connector['supplyIds'].slice(0, 1),
    }));
    const proposed = {
      asset: {
        manufacturer: assetDetails.manufacturer,
        model: assetDetails.model,
        serialNumber: assetDetails.serialNumber,
      },
      chargePoint: {
        maximumPowerKw: assetDetails.maximumPowerKw,
        dcRcdType: assetDetails.dcRcdType,
      },
      supplies: stableSupplies,
      connectors: stableConnectors,
    };
    return {
      evData: {
        stableDetails: proposed,
        supplyTests: supplies,
        connectorTests: connectors,
        functionalChecks: { outcome: this.form.controls.outcome.value },
        engineerObservations: this.form.controls.notes.value,
      },
      ...(this.stableDetailsChanged(task, proposed) ? { proposedAssetChanges: proposed } : {}),
    };
  }

  private stableDetailsChanged(task: VisitTask, proposed: Record<string, unknown>): boolean {
    const asset = task.asset;
    const current = {
      asset: {
        manufacturer: asset?.manufacturer ?? '',
        model: asset?.model ?? '',
        serialNumber: asset?.serialNumber ?? '',
      },
      chargePoint: {
        maximumPowerKw: asset?.evChargePoint?.maximumPowerKw ?? null,
        dcRcdType: asset?.evChargePoint?.dcRcdType ?? 'NONE',
      },
      supplies: (asset?.evChargePoint?.supplies ?? []).map((supply) => ({
        id: supply.id,
        label: supply.label,
        phaseCount: supply.phaseCount,
        protectiveDeviceType: supply.protectiveDeviceType ?? '',
        protectiveDeviceRating: supply.protectiveDeviceRating ?? null,
        earthingArrangement: supply.earthingArrangement ?? 'TNCS',
      })),
      connectors: (asset?.evChargePoint?.connectors ?? []).map((connector) => ({
        id: connector.id,
        label: connector.label,
        connectorType: connector.connectorType,
        supplyIds: connector.supplyMappings.map(({ supplyId }) => supplyId),
      })),
    };
    return JSON.stringify(current) !== JSON.stringify(proposed);
  }

  private validation(data: Record<string, unknown>): Record<string, unknown> {
    const warnings: string[] = [];
    for (const [key, value] of Object.entries(data))
      if (typeof value === 'number' && !Number.isFinite(value))
        warnings.push(`${key} is not a valid number`);
    if (this.isEvTask() && this.supplyTests.invalid)
      warnings.push('Every supply requires Zs and PFC.');
    return { valid: warnings.length === 0, warnings, frameworkVersion: 2 };
  }

  private async saveDraft(): Promise<void> {
    const inspection = this.inspection();
    const visit = this.visit();
    if (!inspection || !visit) return;
    await this.offline.saveDraft(visit.organisationId, visit.id, inspection.id, {
      core: this.form.getRawValue(),
      recordingFault: this.recordingFault(),
      evAsset: this.evAssetForm.getRawValue(),
      supplies: this.supplyTests.getRawValue(),
      connectors: this.connectorTests.getRawValue(),
    });
    this.saved.set('Saved on device');
  }

  private restoreDraft(draft: Record<string, unknown>): void {
    const core = draft['core'];
    if (typeof core === 'object' && core !== null) this.form.patchValue(core);
    else this.form.patchValue(draft);
    const coreDefectTitle = this.form.controls.defectTitle.value.trim();
    this.setFaultRecording(draft['recordingFault'] === true || coreDefectTitle.length > 0);
    if (coreDefectTitle.length > 0) {
      this.form.controls.defectTitle.setValue(coreDefectTitle, { emitEvent: false });
    }
    const evAsset = draft['evAsset'];
    if (typeof evAsset === 'object' && evAsset !== null) this.evAssetForm.patchValue(evAsset);
    if (Array.isArray(draft['supplies'])) {
      this.supplyTests.clear();
      for (const supply of draft['supplies']) {
        const group = this.supplyGroup();
        if (typeof supply === 'object' && supply !== null)
          group.patchValue(supply as Partial<ReturnType<SupplyTestGroup['getRawValue']>>);
        this.supplyTests.push(group);
      }
    }
    if (Array.isArray(draft['connectors'])) {
      this.connectorTests.clear();
      for (const connector of draft['connectors']) {
        const group = this.connectorGroup();
        if (typeof connector === 'object' && connector !== null)
          group.patchValue(connector as Partial<ReturnType<ConnectorTestGroup['getRawValue']>>);
        group.controls.supplyIds.setValue(group.controls.supplyIds.value.slice(0, 1));
        this.connectorTests.push(group);
      }
    }
    this.applyAutomaticRcdOutcome();
  }

  private async loadAssetImage(task: VisitTask): Promise<void> {
    this.revokeAssetImage();
    const media = task.asset?.media?.[0];
    const cacheKey = media?.id ?? `display-${task.asset?.id ?? 'missing'}`;
    let blob = await this.offline.assetImage(cacheKey);
    if (blob === undefined && this.offline.online() && task.asset) {
      blob = this.guestToken
        ? ((await this.api.downloadGuestAssetDisplayImage(this.guestToken, task.asset.id)) ??
          undefined)
        : ((await this.api.downloadAssetDisplayImage(this.organisationId, task.asset.id)) ??
          undefined);
      if (blob !== undefined) await this.offline.storeAssetImage(cacheKey, blob);
    }
    this.assetImageUrl.set(
      blob === undefined ? '/images/generic-ev-charger.svg' : URL.createObjectURL(blob),
    );
  }

  private async cacheAssetImages(visit: VisitSummary): Promise<void> {
    if (!this.offline.online()) return;
    for (const task of visit.tasks) {
      if (!task.asset) continue;
      try {
        const cacheKey = task.asset.media?.[0]?.id ?? `display-${task.asset.id}`;
        if ((await this.offline.assetImage(cacheKey)) !== undefined) continue;
        const blob = this.guestToken
          ? await this.api.downloadGuestAssetDisplayImage(this.guestToken, task.asset.id)
          : await this.api.downloadAssetDisplayImage(this.organisationId, task.asset.id);
        if (blob !== null) await this.offline.storeAssetImage(cacheKey, blob);
      } catch {
        // A generic asset image remains available when an optional image cannot be cached.
      }
    }
  }

  private revokeAssetImage(): void {
    if (this.assetImageUrl().startsWith('blob:')) URL.revokeObjectURL(this.assetImageUrl());
    this.assetImageUrl.set('');
  }

  private async load(): Promise<void> {
    await this.run(async () => {
      const cached = await this.offline.pack(this.visitId, this.guestToken || undefined);
      if (!this.offline.online()) {
        if (cached !== undefined) {
          this.visit.set(await this.applyPendingTaskStatuses(cached));
          return;
        }
        throw new Error(
          'This visit is not saved for offline use on this device. Reconnect and press Download visit for offline use.',
        );
      }
      try {
        const result = this.guestToken
          ? await this.api.guestVisit(this.guestToken)
          : await this.api.getVisit(this.organisationId, this.visitId);
        this.visit.set(await this.applyPendingTaskStatuses(result.visit));
      } catch (error) {
        if (cached !== undefined) this.visit.set(await this.applyPendingTaskStatuses(cached));
        else throw error;
      }
    });
  }

  private async applyPendingTaskStatuses(visit: VisitSummary): Promise<VisitSummary> {
    return this.markTaskSubmitted(visit, await this.offline.pendingTaskIds(visit));
  }

  private markTaskSubmitted(visit: VisitSummary, taskIds: Set<string>): VisitSummary {
    if (taskIds.size === 0) return visit;
    return {
      ...visit,
      tasks: visit.tasks.map((task) =>
        taskIds.has(task.id)
          ? {
              ...task,
              status: 'SUBMITTED',
              ...(task.inspection === undefined
                ? {}
                : { inspection: { ...task.inspection, status: 'SUBMITTED' } }),
            }
          : task,
      ),
    };
  }

  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update the visit.');
    } finally {
      this.busy.set(false);
    }
  }
}
