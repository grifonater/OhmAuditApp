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
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, fromEvent, merge } from 'rxjs';
import {
  ApiService,
  type ChargerDataPlateCandidate,
  type ChargerDataPlateField,
  type EvChargePoint,
  type EvTestInstructionContent,
  type EvTestStep,
  type EngineerRamsRecord,
  type InspectionSummary,
  type RamsRevisionDetail,
  type VisitFinding,
  type VisitFindingCategory,
  type VisitFindingInput,
  type VisitFindingSeverity,
  type VisitSummary,
  type VisitTask,
} from '../core/api.service';
import { compressImage, compressPhoto } from '../core/image-compression';
import { GenerationProgressService } from '../core/generation-progress.service';
import { OfflineVisitService } from '../core/offline-visit.service';
import {
  applyDataPlateCandidate as applyCandidate,
  canRemoveVisitEvTask,
  moduleLabel,
  type LocalEvChargerIds,
  type SubmissionSyncState,
} from '../core/offline-visit.helpers';
import {
  emergencyLightingInspectionPath,
  guestEmergencyLightingInspectionPath,
} from '../core/emergency-lighting-routes';
import { RamsReadOnlyComponent } from '../shared/rams-read-only.component';
import { SignaturePadComponent } from '../shared/signature-pad.component';
import {
  connectorSupplyIds,
  engineerWorkspaceStep,
  type EngineerWorkspaceStep,
  isSupportedImageMimeType,
  PROTECTIVE_DEVICE_TYPES,
} from './ev-visit-helpers';

type ResultChoice = 'PASS' | 'FAIL' | 'NOT_TESTED';
type FindingCategory = 'ADVICE' | 'NOTE' | 'FAULT' | 'CONDITION';
type FindingGroup = FormGroup<{
  clientFindingId: FormControl<string>;
  category: FormControl<FindingCategory>;
  title: FormControl<string>;
  description: FormControl<string>;
  severity: FormControl<string>;
}>;
type VisitFindingGroup = FormGroup<{
  clientFindingId: FormControl<string>;
  category: FormControl<VisitFindingCategory>;
  title: FormControl<string>;
  description: FormControl<string>;
  severity: FormControl<VisitFindingSeverity>;
  photoMediaIds: FormControl<string[]>;
}>;
interface VisitFindingPhotoPreview {
  id: string;
  findingId: string;
  url: string;
  description: string;
  serverMediaId?: string;
}
interface PhotoPreview {
  id: string;
  url: string;
  kind: 'fault' | 'normal-state' | 'data-plate';
  findingId?: string;
  description: string;
}
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
  imports: [ReactiveFormsModule, RamsReadOnlyComponent, SignaturePadComponent],
  templateUrl: './engineer-visit.component.html',
  styleUrls: [
    './operations.css',
    './engineer-visit.mobile.css',
    './engineer-visit.landing.css',
    './engineer-visit.desktop.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EngineerVisitComponent {
  private readonly api = inject(ApiService);
  private readonly generationProgress = inject(GenerationProgressService);
  protected readonly offline = inject(OfflineVisitService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly visitId = this.route.snapshot.paramMap.get('visitId') ?? '';
  protected readonly guestToken = this.route.snapshot.paramMap.get('token') ?? '';
  protected readonly workspaceSteps: Array<{ key: EngineerWorkspaceStep; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'rams', label: 'RAMS' },
    { key: 'inspections', label: 'Inspections' },
    { key: 'findings', label: 'Findings' },
  ];
  protected readonly workspaceStep = signal(
    engineerWorkspaceStep(this.route.snapshot.queryParamMap.get('step')),
  );
  protected readonly visit = signal<VisitSummary | undefined>(undefined);
  protected readonly linkedRams = signal<EngineerRamsRecord[]>([]);
  protected readonly currentSignerName = signal('your account');
  private readonly currentUserId = signal('');
  protected readonly viewedRams = signal<EngineerRamsRecord | undefined>(undefined);
  protected readonly viewedRevision = signal<RamsRevisionDetail | undefined>(undefined);
  protected readonly ramsSignature = signal('');
  protected readonly signingRamsId = signal('');
  protected readonly selectedTask = signal<VisitTask | undefined>(undefined);
  protected readonly inspection = signal<InspectionSummary | undefined>(undefined);
  protected readonly assetImageUrl = signal('');
  protected readonly busy = signal(false);
  protected readonly downloadingPack = signal(false);
  protected readonly downloadingPdf = signal('');
  protected readonly offlineDownloadedAt = signal('');
  protected readonly error = signal('');
  protected readonly saved = signal('');
  protected readonly photoCount = signal(0);
  protected readonly normalPhotoCount = signal(0);
  protected readonly photoPreviews = signal<PhotoPreview[]>([]);
  protected readonly viewedPhoto = signal<PhotoPreview | undefined>(undefined);
  protected readonly submitted = signal(false);
  protected readonly submissionResult = signal<'confirmed' | 'pending' | 'failed'>('confirmed');
  protected readonly recentlySubmittedTaskId = signal('');
  protected readonly addingCharger = signal(false);
  protected readonly newChargerDataPlateBusy = signal(false);
  protected readonly newChargerDataPlateError = signal('');
  protected readonly newChargerDataPlatePreviewUrl = signal('');
  protected readonly newChargerDataPlateCandidates = signal<ChargerDataPlateCandidate[]>([]);
  protected readonly newChargerMissingDataPlateFields = signal<ChargerDataPlateField[]>([]);
  protected readonly newChargerAppliedDataPlateFields = signal<ChargerDataPlateField[]>([]);
  protected readonly pendingAddTaskIds = signal<Set<string>>(new Set());
  protected readonly submissionSyncStates = signal<Record<string, SubmissionSyncState>>({});
  protected readonly visitFindings = new FormArray<VisitFindingGroup>([]);
  protected readonly visitFindingPhotos = signal<VisitFindingPhotoPreview[]>([]);
  protected readonly viewedVisitFindingPhoto = signal<VisitFindingPhotoPreview | undefined>(
    undefined,
  );
  protected readonly visitFindingsSaving = signal(false);
  protected readonly visitFindingsSyncState = signal<'confirmed' | 'pending' | 'failed'>(
    'confirmed',
  );
  private readonly newChargerLocalIds = signal<LocalEvChargerIds | undefined>(undefined);
  protected readonly dataPlateBusy = signal(false);
  protected readonly dataPlateError = signal('');
  protected readonly dataPlatePreviewUrl = signal('');
  protected readonly dataPlateCandidates = signal<ChargerDataPlateCandidate[]>([]);
  protected readonly missingDataPlateFields = signal<ChargerDataPlateField[]>([]);
  protected readonly appliedDataPlateFields = signal<ChargerDataPlateField[]>([]);
  protected readonly helpStep = signal<EvTestStep | ''>('');
  protected readonly helpContent = signal<EvTestInstructionContent | null>(null);
  protected readonly helpLoading = signal(false);
  protected readonly helpError = signal('');
  protected readonly helpManufacturer = signal('');
  protected readonly activeStep = signal(0);
  protected readonly savingDraft = signal(false);
  protected readonly photographing = signal(false);
  protected readonly protectiveDeviceTypes = PROTECTIVE_DEVICE_TYPES;
  protected readonly findingCategories: FindingCategory[] = [
    'ADVICE',
    'NOTE',
    'FAULT',
    'CONDITION',
  ];
  protected readonly guestIdentityRequired = computed(() => {
    const visit = this.visit();
    return Boolean(this.guestToken && visit && !visit.guestEngineerName && !visit.guestEmail);
  });

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
  protected readonly findings = new FormArray<FindingGroup>([]);
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
  protected readonly guestIdentityForm = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
  });
  protected readonly normalPhotoDescription = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });
  constructor() {
    effect(() => {
      this.offline.outboxVersion();
      const visit = this.visit();
      if (visit) {
        void this.refreshSubmissionStateAfterOutboxChange(visit);
        void this.refreshVisitFindingsSyncState(visit.id);
      }
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((parameters) => {
      this.workspaceStep.set(engineerWorkspaceStep(parameters.get('step')));
    });
    merge(
      this.form.valueChanges,
      this.evAssetForm.valueChanges,
      this.supplyTests.valueChanges,
      this.connectorTests.valueChanges,
      this.findings.valueChanges,
    )
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.saveDraft());
    merge(this.evAssetForm.controls.dcRcdType.valueChanges, this.connectorTests.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyAutomaticRcdOutcome());
    this.visitFindings.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.visitFindingsSyncState.set('pending'));
    fromEvent<PopStateEvent>(window, 'popstate')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.selectedTask()) void this.returnToTasks();
      });
    this.destroyRef.onDestroy(() => {
      this.revokeAssetImage();
      this.revokeDataPlatePreview();
      this.revokeNewChargerDataPlatePreview();
      this.revokePhotoPreviews();
      this.revokeVisitFindingPhotoPreviews();
      if (this.helpStep() !== '') document.body.style.overflow = '';
    });
    void this.load();
  }

  protected isEvTask(): boolean {
    return this.selectedTask()?.moduleKey === 'ev-charging';
  }

  protected async selectWorkspaceStep(step: EngineerWorkspaceStep): Promise<void> {
    this.workspaceStep.set(step);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step },
      queryParamsHandling: 'merge',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected async downloadJobPackPdf(): Promise<void> {
    const visit = this.visit();
    if (!visit || !this.offline.online() || this.downloadingPdf()) return;
    this.downloadingPdf.set('job-pack');
    this.error.set('');
    try {
      await this.generationProgress.run(
        'Generating job pack PDF',
        async () => {
          const blob = this.guestToken
            ? await this.api.downloadGuestJobSheetPdf(this.guestToken, true)
            : await this.api.downloadEngineerJobPackPdf(this.organisationId, visit.id);
          this.saveBlob(
            blob,
            `${this.slug(visit.reference || visit.title)}-job-pack-with-rams.pdf`,
          );
          this.saved.set('Job pack PDF downloaded');
        },
        'This can take a few moments.',
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to generate the job pack.');
    } finally {
      this.downloadingPdf.set('');
    }
  }

  protected async downloadCurrentRamsPdf(rams: EngineerRamsRecord): Promise<void> {
    if (!this.offline.online() || this.downloadingPdf() || rams.currentRevisionNumber < 1) return;
    this.downloadingPdf.set(`rams:${rams.id}`);
    this.error.set('');
    try {
      await this.generationProgress.run(
        'Generating RAMS PDF',
        async () => {
          const blob = this.guestToken
            ? await this.api.downloadGuestRamsRevisionPdf(
                this.guestToken,
                rams.id,
                rams.currentRevisionNumber,
              )
            : await this.api.downloadRamsPdf(this.organisationId, rams.id);
          this.saveBlob(
            blob,
            `${this.slug(rams.reference || rams.title)}-revision-${rams.currentRevisionNumber}.pdf`,
          );
          this.saved.set(`${rams.reference} PDF downloaded`);
        },
        'This can take a few moments.',
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to generate the RAMS PDF.');
    } finally {
      this.downloadingPdf.set('');
    }
  }

  protected async downloadPack(): Promise<void> {
    const visit = this.visit();
    if (!visit) return;
    if (this.offline.notificationPermission() === 'default')
      void this.offline.requestNotificationPermission();
    this.downloadingPack.set(true);
    this.error.set('');
    try {
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
      await this.offline.cacheVisitFindingPhotos(
        this.visit() ?? visit,
        this.guestToken || undefined,
      );
      await this.offline.cacheThermalPack(this.visit() ?? visit, this.guestToken || undefined);
      const verified = await this.offline.pack(this.visitId, this.guestToken || undefined);
      if (verified === undefined)
        throw new Error('The job could not be verified for offline use on this device.');
      this.saved.set('Offline ready — job verified on this device');
      await this.refreshOfflineMetadata();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to prepare the offline job.');
    } finally {
      this.downloadingPack.set(false);
    }
  }

  protected offlineStatusLabel(): string {
    if (this.downloadingPack()) return 'Preparing offline pack';
    if (!this.offline.online())
      return this.offlineDownloadedAt() ? 'Offline ready' : 'Not available offline';
    return this.offlineDownloadedAt() ? 'Ready offline' : 'Download for offline use';
  }

  protected friendlyModuleLabel(moduleKey: string): string {
    return moduleLabel(moduleKey);
  }

  protected submissionSyncState(taskId: string): SubmissionSyncState | undefined {
    return this.submissionSyncStates()[taskId];
  }

  protected canRemoveCharger(task: VisitTask): boolean {
    const visit = this.visit();
    return Boolean(
      visit &&
      visit.submittedAt == null &&
      visit.completedAt == null &&
      !['SUBMITTED', 'COMPLETED'].includes(visit.status) &&
      canRemoveVisitEvTask(task, this.visitId),
    );
  }

  protected async removeCharger(task: VisitTask): Promise<void> {
    const visit = this.visit();
    if (!visit || !this.canRemoveCharger(task) || task.asset === undefined) return;
    if (!confirm(`Remove ${task.asset.displayName} from this job? This cannot be undone.`)) return;
    const unsynced = this.pendingAddTaskIds().has(task.id);
    await this.run(async () => {
      const updated = await this.offline.queueRemoveEvCharger(
        visit,
        task,
        this.guestToken || undefined,
      );
      this.visit.set(updated);
      this.pendingAddTaskIds.set(await this.offline.pendingAddTaskIdsForVisit(visit.id));
      this.saved.set(
        unsynced
          ? 'Unsynced charger cancelled'
          : this.offline.online()
            ? 'Charger removal requested'
            : 'Charger removal saved on this device and pending sync',
      );
    });
  }

  protected addVisitFinding(category: VisitFindingCategory = 'NOTE'): void {
    this.visitFindings.push(this.visitFindingGroup({ category }));
    this.visitFindingsSyncState.set('pending');
  }

  protected async removeVisitFinding(index: number): Promise<void> {
    const findingId = this.visitFindings.at(index).controls.clientFindingId.value;
    await this.offline.deleteVisitFindingPhotos(findingId);
    this.visitFindings.removeAt(index);
    await this.refreshVisitFindingPhotoPreviews();
    this.visitFindingsSyncState.set('pending');
  }

  protected visitPhotosForFinding(findingId: string): VisitFindingPhotoPreview[] {
    return this.visitFindingPhotos().filter((photo) => photo.findingId === findingId);
  }

  protected async captureVisitFindingPhoto(event: Event, findingId: string): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const visit = this.visit();
    const finding = this.visitFindings.controls.find(
      (group) => group.controls.clientFindingId.value === findingId,
    );
    if (!file || !visit || !finding) return;
    if (!isSupportedImageMimeType(file.type)) {
      this.error.set('Use a JPEG, PNG, or WebP photo.');
      return;
    }
    this.photographing.set(true);
    this.error.set('');
    try {
      const compressed = await compressPhoto(file);
      if (compressed.size > 2_000_000)
        throw new Error('The photo is too large after compression. Try a smaller image.');
      await this.offline.storeVisitFindingPhoto(
        visit.organisationId,
        visit.id,
        findingId,
        this.guestToken || undefined,
        compressed,
        finding.controls.title.value.trim() || 'Job finding evidence',
      );
      await this.refreshVisitFindingPhotoPreviews();
      this.visitFindingsSyncState.set('pending');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The image could not be saved.');
    } finally {
      this.photographing.set(false);
    }
  }

  protected async removeVisitFindingPhoto(photo: VisitFindingPhotoPreview): Promise<void> {
    await this.offline.deleteVisitFindingPhoto(photo.id);
    if (photo.serverMediaId) {
      const finding = this.visitFindings.controls.find(
        (group) => group.controls.clientFindingId.value === photo.findingId,
      );
      finding?.controls.photoMediaIds.setValue(
        finding.controls.photoMediaIds.value.filter((id) => id !== photo.serverMediaId),
      );
    }
    if (this.viewedVisitFindingPhoto()?.id === photo.id)
      this.viewedVisitFindingPhoto.set(undefined);
    await this.refreshVisitFindingPhotoPreviews();
    this.visitFindingsSyncState.set('pending');
  }

  protected async saveVisitFindings(): Promise<void> {
    const visit = this.visit();
    if (!visit || this.visitFindings.invalid || this.visitFindingsSaving()) return;
    const findings: VisitFindingInput[] = this.visitFindings.getRawValue().map((finding) => ({
      clientFindingId: finding.clientFindingId,
      category: finding.category,
      title: finding.title.trim(),
      ...(finding.description.trim() ? { description: finding.description.trim() } : {}),
      severity: finding.severity,
      status: 'OPEN',
      photoMediaIds: finding.photoMediaIds,
    }));
    const optimisticVisit: VisitSummary = { ...visit, findings };
    this.visitFindingsSaving.set(true);
    this.error.set('');
    try {
      this.visit.set(optimisticVisit);
      await this.offline.queueVisitFindings(
        optimisticVisit,
        findings,
        this.guestToken || undefined,
      );
      await this.refreshVisitFindingsSyncState(visit.id);
      if (this.visitFindingsSyncState() === 'confirmed') {
        await this.refreshVisitFindingsFromServer(optimisticVisit);
        this.saved.set('Job findings saved');
      } else {
        this.saved.set(
          this.visitFindingsSyncState() === 'failed'
            ? 'Job findings sync failed. They remain saved on this device.'
            : 'Job findings saved on this device and pending sync',
        );
      }
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'The job findings could not be saved.',
      );
    } finally {
      this.visitFindingsSaving.set(false);
    }
  }

  protected async saveGuestIdentity(): Promise<void> {
    const visit = this.visit();
    if (!visit || !this.guestToken || this.guestIdentityForm.invalid || !this.offline.online())
      return;
    const displayName = this.guestIdentityForm.controls.displayName.value.trim();
    await this.run(async () => {
      const result = await this.api.setGuestVisitIdentity(this.guestToken, displayName);
      const updated = {
        ...(result.visit ?? visit),
        guestEngineerName: result.identity.displayName,
      };
      this.visit.set(updated);
      this.currentSignerName.set(result.identity.displayName);
      this.form.controls.signerName.setValue(result.identity.displayName);
      await this.offline.updateCachedVisit(updated, this.guestToken);
      this.saved.set('Identity confirmed');
    });
  }

  protected formatVisitDate(value: string | undefined, includeTime = false): string {
    if (!value) return 'Not set';
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(new Date(value));
  }

  protected personLabel(person: EngineerRamsRecord['signedBy']): string {
    return person?.displayName || person?.email || 'Engineer';
  }

  protected async signOn(rams: EngineerRamsRecord): Promise<void> {
    const signatureData = this.ramsSignature();
    if (
      rams.status !== 'APPROVED' ||
      rams.signedOn ||
      !signatureData ||
      !this.offline.online() ||
      this.guestIdentityRequired()
    )
      return;
    this.signingRamsId.set(rams.id);
    await this.run(async () => {
      if (this.guestToken)
        await this.api.signOnToGuestRams(this.guestToken, rams.id, {
          signatureData,
        });
      else
        await this.api.signOnToRams(this.organisationId, this.visitId, rams.id, {
          signatureData,
        });
      await this.loadLinkedRams();
      this.ramsSignature.set('');
      this.saved.set(`Signed onto ${rams.reference}`);
    });
    this.signingRamsId.set('');
  }

  protected async openRamsRevision(
    rams: EngineerRamsRecord,
    revisionNumber: number,
  ): Promise<void> {
    this.viewedRams.set(rams);
    await this.run(async () => {
      const result = this.guestToken
        ? await this.api.getGuestRamsRevision(this.guestToken, rams.id, revisionNumber)
        : await this.api.getRamsRevision(this.organisationId, rams.id, revisionNumber);
      this.viewedRevision.set(result.revision);
    });
  }

  protected async downloadHistoricalRams(revision: RamsRevisionDetail): Promise<void> {
    const rams =
      this.viewedRams() ??
      this.linkedRams().find((item) => item.revisions?.some(({ id }) => id === revision.id));
    if (!rams) return;
    await this.run(async () => {
      await this.generationProgress.run(
        'Generating RAMS revision PDF',
        async () => {
          const blob = this.guestToken
            ? await this.api.downloadGuestRamsRevisionPdf(
                this.guestToken,
                rams.id,
                revision.revisionNumber,
              )
            : await this.api.downloadRamsRevisionPdf(
                this.organisationId,
                rams.id,
                revision.revisionNumber,
              );
          this.saveBlob(
            blob,
            `${this.slug(rams.reference)}-revision-${revision.revisionNumber}.pdf`,
          );
        },
        'This can take a few moments.',
      );
    });
  }

  protected closeRamsViewer(): void {
    this.viewedRevision.set(undefined);
    this.viewedRams.set(undefined);
  }

  protected async openTask(task: VisitTask): Promise<void> {
    if (task.moduleKey === 'thermal-imaging') {
      await this.router.navigate(
        this.guestToken
          ? ['/guest/job', this.guestToken, 'thermal', task.id]
          : ['/app/org', this.organisationId, 'visits', this.visitId, 'thermal', task.id],
      );
      return;
    }
    if (task.moduleKey === 'emergency-lighting') {
      await this.run(async () => {
        const inspection =
          task.inspection ??
          (this.guestToken
            ? (await this.api.startGuestInspection(this.guestToken, task.id)).inspection
            : (await this.api.startInspection(this.organisationId, task.id)).inspection);
        await this.router.navigate(
          this.guestToken
            ? guestEmergencyLightingInspectionPath(this.guestToken, inspection.id)
            : emergencyLightingInspectionPath(this.organisationId, this.visitId, inspection.id),
        );
      });
      return;
    }
    await this.run(async () => {
      this.findings.clear({ emitEvent: false });
      this.revokePhotoPreviews();
      this.selectedTask.set(task);
      this.activeStep.set(0);
      history.pushState({ ...history.state, oaEngineerTask: `${this.visitId}:${task.id}` }, '');
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
      await this.refreshPhotoPreviews();
    });
  }

  protected choose(
    control: 'outcome' | 'visualCondition' | 'polarity' | 'functionalOperation',
    value: string,
  ): void {
    if (control === 'outcome' && value === 'PASS' && this.automaticRcdFailures().length > 0) return;
    this.form.controls[control].setValue(value);
  }

  protected goToStep(index: number): void {
    this.activeStep.set(Math.max(0, Math.min(4, Math.floor(index))));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected stepComplete(index: number): boolean {
    switch (index) {
      case 0: {
        const asset = this.evAssetForm.getRawValue();
        return (
          asset.manufacturer.trim() !== '' ||
          asset.model.trim() !== '' ||
          asset.serialNumber.trim() !== '' ||
          asset.maximumPowerKw !== null ||
          this.normalPhotoCount() > 0
        );
      }
      case 1:
        return (
          this.supplyTests.length > 0 &&
          this.supplyTests
            .getRawValue()
            .every(
              (supply) =>
                typeof supply.zsOhms === 'number' && typeof supply.maximumPfcKa === 'number',
            )
        );
      case 2: {
        const useRamp = this.evAssetForm.controls.dcRcdType.value !== 'NONE';
        return (
          this.connectorTests.length > 0 &&
          this.connectorTests
            .getRawValue()
            .every(
              (connector) =>
                [
                  connector.pePreTest,
                  connector.cpError,
                  connector.peError,
                  connector.cpStates,
                ].every((result) => result === 'PASS' || result === 'FAIL') &&
                typeof connector.rcd1x0Ms === 'number' &&
                typeof connector.rcd1x180Ms === 'number' &&
                typeof connector.rcd5x0Ms === 'number' &&
                typeof connector.rcd5x180Ms === 'number' &&
                connector.supplyIds.length === 1 &&
                (!useRamp ||
                  (typeof connector.dcRamp0Ma === 'number' &&
                    typeof connector.dcRamp180Ma === 'number')),
            )
        );
      }
      case 3:
        return true;
      case 4:
        return this.evReady() && this.form.controls.signerName.valid;
      default:
        return false;
    }
  }

  protected helpLabel(step: EvTestStep): string {
    switch (step) {
      case 'unit':
        return 'Help for “Confirm the unit”';
      case 'supplies':
        return 'Help for “Test each supply”';
      case 'connectors':
        return 'Help for “Test each connector”';
      case 'condition':
        return 'Help for “Were any faults found?”';
      case 'submit':
        return 'Help for “Review & submit”';
    }
  }

  protected async openHelp(step: EvTestStep): Promise<void> {
    if (this.helpStep() === step) {
      this.closeHelp();
      return;
    }
    this.helpStep.set(step);
    this.helpContent.set(null);
    this.helpError.set('');
    const manufacturer = this.isEvTask()
      ? (this.evAssetForm.controls.manufacturer.value ?? '').trim()
      : '';
    this.helpManufacturer.set(manufacturer);
    this.helpLoading.set(true);
    document.body.style.overflow = 'hidden';
    try {
      const content = this.guestToken
        ? await this.api.getGuestEvTestInstruction(this.guestToken, step, manufacturer)
        : await this.api.getEvTestInstruction(this.organisationId, step, manufacturer);
      this.helpContent.set(content);
    } catch (error) {
      this.helpError.set(
        error instanceof Error ? error.message : 'Unable to load the step instructions.',
      );
    } finally {
      this.helpLoading.set(false);
    }
  }

  protected closeHelp(): void {
    if (this.helpStep() === '') return;
    this.helpStep.set('');
    this.helpContent.set(null);
    this.helpError.set('');
    document.body.style.overflow = '';
  }

  protected helpVideoSrc(): string {
    const video = this.helpContent()?.video;
    return video === null || video === undefined
      ? ''
      : this.api.evTestInstructionVideoUrl(video.id);
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

  protected addFinding(category: FindingCategory = 'FAULT', save = true): void {
    this.findings.push(this.findingGroup({ category }));
    if (save) void this.saveDraft();
  }

  protected async removeFinding(index: number): Promise<void> {
    const findingId = this.findings.at(index).controls.clientFindingId.value;
    await this.removeFindingPhotos(findingId);
    this.findings.removeAt(index);
    await this.saveDraft();
  }

  protected photosForFinding(findingId: string): PhotoPreview[] {
    return this.photoPreviews().filter(
      (photo) =>
        photo.findingId === findingId ||
        (this.findings.length === 1 && photo.kind === 'fault' && photo.findingId === undefined),
    );
  }

  protected normalPhotos(): PhotoPreview[] {
    return this.photoPreviews().filter((photo) => photo.kind === 'normal-state');
  }

  protected addSupply(): void {
    this.supplyTests.push(this.supplyGroup());
    this.assignOnlySupplyToUnmappedConnectors();
  }

  protected removeSupply(index: number): void {
    const id = this.supplyTests.at(index).controls.id.value;
    this.supplyTests.removeAt(index);
    for (const connector of this.connectorTests.controls)
      if (connector.controls.supplyIds.value.includes(id))
        connector.controls.supplyIds.setValue([]);
    this.assignOnlySupplyToUnmappedConnectors();
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

  protected async analyseDataPlate(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const inspection = this.inspection();
    if (!file || !inspection) return;
    if (!this.offline.online()) {
      this.dataPlateError.set('Connect to the internet to analyse a data plate.');
      return;
    }
    if (!isSupportedImageMimeType(file.type)) {
      this.dataPlateError.set('Use a JPEG, PNG, or WebP photo.');
      return;
    }

    this.dataPlateBusy.set(true);
    this.dataPlateError.set('');
    this.dataPlateCandidates.set([]);
    this.missingDataPlateFields.set([]);
    this.appliedDataPlateFields.set([]);
    try {
      const image = await compressImage(file, { maxDimension: 3072, targetBytes: 1_000_000 });
      if (image.size > 2_000_000) throw new Error('The photo is too large. Try moving closer.');
      this.revokeDataPlatePreview();
      this.dataPlatePreviewUrl.set(URL.createObjectURL(image));
      const result = this.guestToken
        ? await this.api.analyseGuestChargerDataPlate(this.guestToken, inspection.id, image)
        : await this.api.analyseChargerDataPlate(this.organisationId, inspection.id, image);
      this.dataPlateCandidates.set(result.candidates);
      this.missingDataPlateFields.set(result.missingFields);
      if (result.candidates.length === 0)
        this.dataPlateError.set(
          'No supported details were readable. Try a closer photo with less glare.',
        );
    } catch (error: unknown) {
      this.dataPlateError.set(
        error instanceof Error ? error.message : 'The data plate could not be analysed.',
      );
    } finally {
      this.dataPlateBusy.set(false);
    }
  }

  protected applyDataPlateCandidate(candidate: ChargerDataPlateCandidate): void {
    if (candidate.field === 'maximumPowerKw') {
      const power = Number(candidate.value);
      if (Number.isFinite(power) && power > 0)
        this.evAssetForm.controls.maximumPowerKw.setValue(power);
    } else {
      this.evAssetForm.controls[candidate.field].setValue(candidate.value);
    }
    this.appliedDataPlateFields.update((fields) =>
      fields.includes(candidate.field) ? fields : [...fields, candidate.field],
    );
  }

  protected dataPlateFieldLabel(field: ChargerDataPlateField): string {
    return {
      manufacturer: 'Make',
      model: 'Model',
      serialNumber: 'Serial number',
      maximumPowerKw: 'Power output',
    }[field];
  }

  protected toggleAddCharger(): void {
    if (this.addingCharger()) {
      this.addingCharger.set(false);
      this.resetNewChargerDataPlate();
      return;
    }
    this.newChargerLocalIds.set(this.createLocalChargerIds());
    this.addingCharger.set(true);
  }

  protected async selectNewChargerDataPlate(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const visit = this.visit();
    if (!file || !visit) return;
    if (!isSupportedImageMimeType(file.type)) {
      this.newChargerDataPlateError.set('Use a JPEG, PNG, or WebP photo.');
      return;
    }
    this.newChargerDataPlateBusy.set(true);
    this.newChargerDataPlateError.set('');
    try {
      const image = await compressImage(file, { maxDimension: 3072, targetBytes: 1_000_000 });
      if (image.size > 2_000_000) throw new Error('The photo is too large. Try moving closer.');
      const localIds = this.newChargerLocalIds() ?? this.createLocalChargerIds();
      this.newChargerLocalIds.set(localIds);
      await this.offline.storePhoto(
        visit.organisationId,
        visit.id,
        localIds.inspectionId,
        localIds.assetId,
        this.guestToken || undefined,
        image,
        'data-plate',
        'EV charger data plate',
      );
      this.revokeNewChargerDataPlatePreview();
      this.newChargerDataPlatePreviewUrl.set(URL.createObjectURL(image));
      this.newChargerDataPlateCandidates.set([]);
      this.newChargerMissingDataPlateFields.set([]);
      this.newChargerAppliedDataPlateFields.set([]);
      if (!this.offline.online()) {
        this.newChargerDataPlateError.set(
          'Photo saved. Add the charger now; analysis will be available when online.',
        );
        return;
      }
      const result = this.guestToken
        ? await this.api.analyseGuestVisitChargerDataPlate(this.guestToken, image)
        : await this.api.analyseVisitChargerDataPlate(this.organisationId, visit.id, image);
      this.newChargerDataPlateCandidates.set(result.candidates);
      this.newChargerMissingDataPlateFields.set(result.missingFields);
      if (result.candidates.length === 0)
        this.newChargerDataPlateError.set(
          'No supported details were readable. Enter them manually.',
        );
    } catch (error: unknown) {
      this.newChargerDataPlateError.set(
        error instanceof Error ? error.message : 'The data plate could not be saved.',
      );
    } finally {
      this.newChargerDataPlateBusy.set(false);
    }
  }

  protected applyNewChargerDataPlateCandidate(candidate: ChargerDataPlateCandidate): void {
    const next = applyCandidate(this.newChargerForm.getRawValue(), candidate);
    this.newChargerForm.patchValue(next);
    this.newChargerAppliedDataPlateFields.update((fields) =>
      fields.includes(candidate.field) ? fields : [...fields, candidate.field],
    );
  }

  protected async addCharger(): Promise<void> {
    const visit = this.visit();
    if (!visit || this.newChargerForm.invalid) return;
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
      const localIds = this.newChargerLocalIds() ?? this.createLocalChargerIds();
      const created = await this.offline.queueAddEvCharger(
        visit,
        input,
        this.guestToken || undefined,
        localIds,
      );
      this.visit.set(created.visit);
      this.recentlySubmittedTaskId.set(created.task.id);
      this.pendingAddTaskIds.set(await this.offline.pendingAddTaskIdsForVisit(visit.id));
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
      this.resetNewChargerDataPlate();
      this.saved.set(
        this.offline.online()
          ? 'Charger added and synchronization requested'
          : 'Charger saved on this device — pending sync',
      );
      await this.openTask(created.task);
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

  protected async capturePhoto(
    event: Event,
    kind: 'fault' | 'normal-state' = 'fault',
    findingId?: string,
  ): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    const inspection = this.inspection();
    const visit = this.visit();
    const assetId = this.selectedTask()?.asset?.id;
    if (!file || !inspection || !visit || !assetId) return;
    this.error.set('');
    const description =
      kind === 'normal-state'
        ? this.normalPhotoDescription.value.trim() || 'EV charger condition before testing'
        : this.findings.controls
            .find((finding) => finding.controls.clientFindingId.value === findingId)
            ?.controls.title.value.trim() || 'Engineer inspection evidence';
    if (!isSupportedImageMimeType(file.type)) {
      this.error.set('Use a JPEG, PNG, or WebP photo.');
      return;
    }
    this.photographing.set(true);
    try {
      const compressed = await compressPhoto(file);
      if (compressed.size > 2_000_000) {
        this.error.set('The photo is too large after compression. Try a smaller image.');
        return;
      }
      await this.offline.storePhoto(
        visit.organisationId,
        visit.id,
        inspection.id,
        assetId,
        this.guestToken || undefined,
        compressed,
        kind,
        description,
        findingId,
      );
      await this.refreshPhotoPreviews();
      if (kind === 'normal-state') this.normalPhotoDescription.reset('');
      await this.saveDraft();
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'The image could not be saved. Try another image.',
      );
    } finally {
      this.photographing.set(false);
    }
  }

  protected async deletePhoto(photo: PhotoPreview): Promise<void> {
    this.error.set('');
    try {
      await this.offline.deletePhoto(photo.id);
      await this.refreshPhotoPreviews();
      if (this.viewedPhoto()?.id === photo.id) this.viewedPhoto.set(undefined);
      await this.saveDraft();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The photo could not be removed.');
    }
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
      this.findings.invalid
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
                category: 'FAULT' as const,
                title: 'Faulty RCD reading',
                description: automaticRcdFailures.join('; '),
                severity: 'MAJOR' as const,
              },
            ]
          : []),
        ...this.findings.getRawValue().map((finding) => ({
          assetId: task.asset?.id,
          clientFindingId: finding.clientFindingId,
          category: finding.category,
          title: finding.title.trim(),
          ...(finding.description.trim() ? { description: finding.description.trim() } : {}),
          severity: finding.severity,
        })),
      ],
      ...(evSubmission === undefined ? {} : evSubmission),
    };
    await this.run(async () => {
      if (this.guestToken)
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
      await this.refreshSubmissionSyncStates(visit);
      const syncState = this.submissionSyncState(task.id);
      if (syncState !== undefined) {
        this.submissionResult.set(syncState.state);
        this.saved.set(
          syncState.state === 'failed'
            ? 'Submission failed. Your inspection is saved and can be retried.'
            : 'Pending sync. Your inspection is saved on this device.',
        );
        return;
      }
      this.submissionResult.set('confirmed');
      this.saved.set('Submitted for office review');
      await this.refreshAuthoritativeVisit();
    });
  }

  protected async retrySubmission(taskId: string): Promise<void> {
    if (!this.offline.online() || this.busy()) return;
    await this.run(async () => {
      await this.offline.syncOutbox();
      const visit = this.visit();
      if (!visit) return;
      await this.refreshSubmissionSyncStates(visit);
      const state = this.submissionSyncState(taskId);
      if (state !== undefined) {
        this.submissionResult.set(state.state);
        this.saved.set(
          state.state === 'failed'
            ? 'Submission failed again. Your inspection remains saved.'
            : 'Pending sync. Retry will continue when dependencies are ready.',
        );
        return;
      }
      this.submissionResult.set('confirmed');
      this.saved.set('Submitted for office review');
      await this.refreshAuthoritativeVisit();
    });
  }

  protected async backToTasks(): Promise<void> {
    const historyState = history.state as unknown;
    const taskMarker =
      typeof historyState === 'object' && historyState !== null
        ? (historyState as Record<string, unknown>)['oaEngineerTask']
        : undefined;
    if (taskMarker === `${this.visitId}:${this.selectedTask()?.id}`) {
      history.back();
      return;
    }
    await this.returnToTasks();
  }

  private async returnToTasks(): Promise<void> {
    if (this.offline.online()) {
      try {
        const refreshed = this.guestToken
          ? (await this.api.guestVisit(this.guestToken)).visit
          : (await this.api.getVisit(this.organisationId, this.visitId)).visit;
        this.visit.set(refreshed);
        await this.refreshSubmissionSyncStates(refreshed);
      } catch {
        // Preserve the locally updated task state when a refresh is temporarily unavailable.
      }
    }
    this.selectedTask.set(undefined);
    this.inspection.set(undefined);
    this.submitted.set(false);
    this.revokeAssetImage();
    this.revokeDataPlatePreview();
    this.dataPlateCandidates.set([]);
    this.missingDataPlateFields.set([]);
    this.dataPlateError.set('');
    this.revokePhotoPreviews();
    this.findings.clear({ emitEvent: false });
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
    this.assignOnlySupplyToUnmappedConnectors();
  }

  private supplyGroup(supply?: EvChargePoint['supplies'][number]): SupplyTestGroup {
    return new FormGroup({
      id: new FormControl(supply?.id ?? `new-${crypto.randomUUID()}`, { nonNullable: true }),
      label: new FormControl(supply?.label ?? `Supply ${this.supplyTests.length + 1}`, {
        nonNullable: true,
        validators: Validators.required,
      }),
      phaseCount: new FormControl(supply?.phaseCount ?? 1, { nonNullable: true }),
      protectiveDeviceType: new FormControl(supply?.protectiveDeviceType ?? 'MCB', {
        nonNullable: true,
        validators: Validators.required,
      }),
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
        connectorSupplyIds(
          connector?.supplyMappings.map(({ supplyId }) => supplyId) ?? [],
          this.supplyTests.getRawValue(),
        ).slice(0, 1),
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

  private revokeDataPlatePreview(): void {
    const url = this.dataPlatePreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.dataPlatePreviewUrl.set('');
  }

  private revokeNewChargerDataPlatePreview(): void {
    const url = this.newChargerDataPlatePreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.newChargerDataPlatePreviewUrl.set('');
  }

  private resetNewChargerDataPlate(): void {
    this.revokeNewChargerDataPlatePreview();
    this.newChargerDataPlateCandidates.set([]);
    this.newChargerMissingDataPlateFields.set([]);
    this.newChargerAppliedDataPlateFields.set([]);
    this.newChargerDataPlateError.set('');
    this.newChargerLocalIds.set(undefined);
  }

  private createLocalChargerIds(): LocalEvChargerIds {
    return {
      assetId: crypto.randomUUID(),
      chargePointId: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      inspectionId: crypto.randomUUID(),
    };
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
    this.savingDraft.set(true);
    try {
      await this.offline.saveDraft(visit.organisationId, visit.id, inspection.id, {
        core: this.form.getRawValue(),
        recordingFault: this.findings.length > 0,
        findings: this.findings.getRawValue(),
        evAsset: this.evAssetForm.getRawValue(),
        supplies: this.supplyTests.getRawValue(),
        connectors: this.connectorTests.getRawValue(),
      });
      this.saved.set('Saved on device');
    } finally {
      this.savingDraft.set(false);
    }
  }

  private restoreDraft(draft: Record<string, unknown>): void {
    const core = draft['core'];
    if (typeof core === 'object' && core !== null) this.form.patchValue(core);
    else this.form.patchValue(draft);
    this.findings.clear({ emitEvent: false });
    if (Array.isArray(draft['findings'])) {
      for (const finding of draft['findings']) {
        if (typeof finding === 'object' && finding !== null)
          this.findings.push(
            this.findingGroup(finding as Partial<ReturnType<FindingGroup['getRawValue']>>),
            { emitEvent: false },
          );
      }
    } else {
      const coreDefectTitle = this.form.controls.defectTitle.value.trim();
      if (coreDefectTitle.length > 0) {
        this.findings.push(
          this.findingGroup({
            category: 'FAULT',
            title: coreDefectTitle,
            description: this.form.controls.notes.value,
            severity: this.form.controls.defectSeverity.value,
          }),
          { emitEvent: false },
        );
        this.form.controls.notes.setValue('', { emitEvent: false });
      }
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
    this.assignOnlySupplyToUnmappedConnectors();
    this.applyAutomaticRcdOutcome();
  }

  private findingGroup(
    finding: Partial<ReturnType<FindingGroup['getRawValue']>> = {},
  ): FindingGroup {
    return new FormGroup({
      clientFindingId: new FormControl(finding.clientFindingId ?? crypto.randomUUID(), {
        nonNullable: true,
      }),
      category: new FormControl(finding.category ?? 'FAULT', { nonNullable: true }),
      title: new FormControl(finding.title ?? '', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(3)],
      }),
      description: new FormControl(finding.description ?? '', { nonNullable: true }),
      severity: new FormControl(finding.severity ?? 'MINOR', { nonNullable: true }),
    });
  }

  private async refreshPhotoPreviews(): Promise<void> {
    const inspection = this.inspection();
    this.revokePhotoPreviews();
    if (inspection === undefined) return;
    const photos = await this.offline.photos(inspection.id);
    const previews: PhotoPreview[] = [];
    for (const photo of photos) {
      const blob = await this.offline.photoBlob(photo.id);
      if (blob !== undefined) previews.push({ ...photo, url: URL.createObjectURL(blob) });
    }
    this.photoPreviews.set(previews);
    this.photoCount.set(previews.filter((photo) => photo.kind === 'fault').length);
    this.normalPhotoCount.set(previews.filter((photo) => photo.kind === 'normal-state').length);
  }

  private async removeFindingPhotos(findingId: string): Promise<void> {
    for (const photo of this.photosForFinding(findingId)) await this.offline.deletePhoto(photo.id);
    await this.refreshPhotoPreviews();
  }

  private revokePhotoPreviews(): void {
    for (const photo of this.photoPreviews()) URL.revokeObjectURL(photo.url);
    this.photoPreviews.set([]);
    this.viewedPhoto.set(undefined);
  }

  private assignOnlySupplyToUnmappedConnectors(): void {
    const supplies = this.supplyTests.getRawValue();
    for (const connector of this.connectorTests.controls) {
      const current = connector.controls.supplyIds.value;
      const assigned = connectorSupplyIds(current, supplies).slice(0, 1);
      if (assigned.length !== current.length || assigned[0] !== current[0])
        connector.controls.supplyIds.setValue(assigned);
    }
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
          this.visit.set(cached);
          this.restoreVisitFindings(cached.findings ?? []);
          await this.refreshVisitFindingPhotoPreviews();
          await this.refreshSubmissionSyncStates(cached);
          this.linkedRams.set(cached.rams ?? []);
          const signer = cached.guestEngineerName || cached.guestEmail;
          if (signer) {
            this.currentSignerName.set(signer);
            this.form.controls.signerName.setValue(signer);
          }
          return;
        }
        throw new Error(
          'This job is not saved for offline use on this device. Reconnect and press Download job for offline use.',
        );
      }
      try {
        if (!this.guestToken) {
          const account = await this.api.currentUser();
          this.currentUserId.set(account.user.id);
          this.currentSignerName.set(account.user.displayName || account.user.email);
          this.form.controls.signerName.setValue(account.user.displayName || account.user.email);
        }
        const result = this.guestToken
          ? await this.api.guestVisit(this.guestToken)
          : await this.api.getVisit(this.organisationId, this.visitId);
        if (this.guestToken)
          this.currentSignerName.set(
            result.visit.guestEngineerName ||
              result.visit.guestEmail ||
              'the assigned guest engineer',
          );
        if (this.guestToken && (result.visit.guestEngineerName || result.visit.guestEmail))
          this.form.controls.signerName.setValue(
            result.visit.guestEngineerName || result.visit.guestEmail || '',
          );
        await this.refreshVisitFindingsSyncState(result.visit.id);
        const loadedVisit =
          cached !== undefined && this.visitFindingsSyncState() !== 'confirmed'
            ? { ...result.visit, findings: cached.findings }
            : result.visit;
        this.visit.set(loadedVisit);
        if (this.visitFindingsSyncState() === 'confirmed')
          await this.refreshVisitFindingsFromServer(loadedVisit);
        else {
          this.restoreVisitFindings(loadedVisit.findings ?? []);
          await this.refreshVisitFindingPhotoPreviews();
        }
        await this.refreshSubmissionSyncStates(result.visit);
        this.pendingAddTaskIds.set(await this.offline.pendingAddTaskIdsForVisit(result.visit.id));
        await this.loadLinkedRams(result.visit);
      } catch (error) {
        if (cached !== undefined) {
          this.visit.set(cached);
          this.restoreVisitFindings(cached.findings ?? []);
          await this.refreshVisitFindingPhotoPreviews();
          await this.refreshSubmissionSyncStates(cached);
          this.linkedRams.set(cached.rams ?? []);
        } else throw error;
      }
    });
    await this.refreshOfflineMetadata();
  }

  private async refreshOfflineMetadata(): Promise<void> {
    const metadata = await this.offline.packMetadata(this.visitId, this.guestToken || undefined);
    this.offlineDownloadedAt.set(metadata?.downloadedAt ?? '');
  }

  private async loadLinkedRams(visit = this.visit()): Promise<void> {
    if (!visit || !this.offline.online()) {
      this.linkedRams.set(visit?.rams ?? []);
      return;
    }
    if (this.guestToken) {
      try {
        this.linkedRams.set((await this.api.listGuestVisitRams(this.guestToken)).rams);
      } catch {
        // Guest RAMS may be absent from an older cached pack; inspections must remain available.
        this.linkedRams.set(visit.rams ?? []);
      }
      return;
    }
    const summaries = (await this.api.listEngineerVisitRams(this.organisationId, visit.id)).rams;
    const records = await Promise.all(
      summaries.map(async (summary): Promise<EngineerRamsRecord> => {
        const [detail, acknowledgementResult] = await Promise.all([
          this.api.getRams(this.organisationId, summary.id),
          this.api.listRamsAcknowledgements(this.organisationId, summary.id, visit.id),
        ]);
        const acknowledgement = acknowledgementResult.acknowledgements.find(
          (item) => item.signerSubject === `user:${this.currentUserId()}`,
        );
        return {
          ...detail.rams,
          signedOn: acknowledgement !== undefined,
          ...(acknowledgement === undefined
            ? {}
            : {
                signedAt: acknowledgement.signedAt,
                signedBy: {
                  displayName: acknowledgement.signerName,
                  ...(acknowledgement.signerEmail === null ||
                  acknowledgement.signerEmail === undefined
                    ? {}
                    : { email: acknowledgement.signerEmail }),
                },
              }),
        };
      }),
    );
    this.linkedRams.set(records);
  }

  private async refreshSubmissionSyncStates(visit: VisitSummary): Promise<void> {
    this.submissionSyncStates.set(
      Object.fromEntries(
        (await this.offline.submissionSyncStates(visit)).map((state) => [state.taskId, state]),
      ),
    );
  }

  private visitFindingGroup(finding: Partial<VisitFinding> = {}): VisitFindingGroup {
    return new FormGroup({
      clientFindingId: new FormControl(finding.clientFindingId ?? crypto.randomUUID(), {
        nonNullable: true,
      }),
      category: new FormControl(finding.category ?? 'NOTE', { nonNullable: true }),
      title: new FormControl(finding.title ?? '', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(1), Validators.maxLength(200)],
      }),
      description: new FormControl(finding.description ?? '', {
        nonNullable: true,
        validators: [Validators.maxLength(5000)],
      }),
      severity: new FormControl(finding.severity ?? 'ADVISORY', { nonNullable: true }),
      photoMediaIds: new FormControl(finding.photoMediaIds ?? [], { nonNullable: true }),
    });
  }

  private restoreVisitFindings(findings: VisitFinding[]): void {
    this.visitFindings.clear({ emitEvent: false });
    for (const finding of findings)
      this.visitFindings.push(this.visitFindingGroup(finding), { emitEvent: false });
  }

  private async refreshVisitFindingsFromServer(visit: VisitSummary): Promise<void> {
    let findings = visit.findings ?? [];
    if (this.offline.online()) {
      try {
        findings = this.guestToken
          ? (await this.api.listGuestVisitFindings(this.guestToken)).findings
          : (await this.api.listVisitFindings(this.organisationId, visit.id)).findings;
      } catch {
        // The summary remains usable if the dedicated endpoint is temporarily unavailable.
      }
    }
    const updatedVisit = { ...visit, findings };
    this.visit.set(updatedVisit);
    this.restoreVisitFindings(findings);
    await this.offline.updateCachedVisit(updatedVisit, this.guestToken || undefined);
    await this.offline.cacheVisitFindingPhotos(updatedVisit, this.guestToken || undefined);
    await this.refreshVisitFindingPhotoPreviews();
  }

  private async refreshVisitFindingPhotoPreviews(): Promise<void> {
    this.revokeVisitFindingPhotoPreviews();
    const visit = this.visit();
    if (!visit) return;
    const previews: VisitFindingPhotoPreview[] = [];
    for (const photo of await this.offline.visitFindingPhotos(visit.id)) {
      const blob = await this.offline.visitFindingPhotoBlob(photo.id);
      if (blob) previews.push({ ...photo, url: URL.createObjectURL(blob) });
    }
    this.visitFindingPhotos.set(previews);
  }

  private revokeVisitFindingPhotoPreviews(): void {
    for (const photo of this.visitFindingPhotos()) URL.revokeObjectURL(photo.url);
    this.visitFindingPhotos.set([]);
    this.viewedVisitFindingPhoto.set(undefined);
  }

  private async refreshVisitFindingsSyncState(visitId: string): Promise<void> {
    this.visitFindingsSyncState.set(
      (await this.offline.visitFindingsSyncState(visitId)) ?? 'confirmed',
    );
  }

  private async refreshSubmissionStateAfterOutboxChange(visit: VisitSummary): Promise<void> {
    const previousTaskIds = new Set(Object.keys(this.submissionSyncStates()));
    await this.refreshSubmissionSyncStates(visit);
    const selectedTaskId = this.selectedTask()?.id;
    if (this.submitted() && selectedTaskId) {
      const state = this.submissionSyncState(selectedTaskId);
      if (state !== undefined) {
        this.submissionResult.set(state.state);
        return;
      }
      if (previousTaskIds.has(selectedTaskId)) {
        this.submissionResult.set('confirmed');
        this.saved.set('Submitted for office review');
      }
    }
    if (
      [...previousTaskIds].some((taskId) => this.submissionSyncState(taskId) === undefined) &&
      this.offline.online()
    )
      await this.refreshAuthoritativeVisit();
  }

  private async refreshAuthoritativeVisit(): Promise<void> {
    if (!this.offline.online()) return;
    try {
      const refreshed = this.guestToken
        ? (await this.api.guestVisit(this.guestToken)).visit
        : (await this.api.getVisit(this.organisationId, this.visitId)).visit;
      const findingsPending =
        (await this.offline.visitFindingsSyncState(refreshed.id)) !== undefined;
      const mergedVisit = findingsPending
        ? { ...refreshed, findings: this.visit()?.findings ?? refreshed.findings }
        : refreshed;
      this.visit.set(mergedVisit);
      await this.refreshSubmissionSyncStates(mergedVisit);
      await this.offline.updateCachedVisit(mergedVisit, this.guestToken || undefined);
    } catch {
      // The outbox mutation was server-confirmed; a later job refresh can update the local summary.
    }
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private slug(value: string): string {
    return (
      value
        .trim()
        .toLocaleLowerCase('en-GB')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'job'
    );
  }

  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update the job.');
    } finally {
      this.busy.set(false);
    }
  }
}
