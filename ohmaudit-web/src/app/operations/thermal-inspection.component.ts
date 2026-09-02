import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ApiService,
  type AssetMedia,
  type InspectionSummary,
  type OrganisationEquipment,
  type VisitSummary,
  type VisitTask,
} from '../core/api.service';
import { compressPhoto } from '../core/image-compression';
import { OfflineVisitService } from '../core/offline-visit.service';
import {
  buildMediaMetadataUpdateBody,
  buildThermalInspectionReport,
  canReviewThermalPdf,
  metadataFailureAction,
  normalizeImageDescriptions,
  normalizeThermalTarget,
  patchImageDescription,
  remapThermalTargetIds,
  thermalImageLimitError,
  thermalPreviewBody,
  thermalPreviewSignerError,
  type MediaMetadata,
  type ThermalCondition,
  type ThermalDetails,
  type ThermalTarget,
} from './thermal-inspection.helpers';

type ThermalStep = 'details' | 'images' | 'targets' | 'review';
type ImageKind = 'unclassified' | 'thermal' | 'standard';
type ImageCategory = 'unclassified-image' | 'thermal-image' | 'standard-image';
const emptyDetails = (): ThermalDetails => ({
  scope: '',
  purpose: 'Thermal imaging inspection of electrical equipment under normal operating load.',
  inspectionMethod: 'Non-contact infrared thermography with corresponding visible-light images.',
  areasInspected: '',
  areasExcluded: '',
  limitations: '',
  environmentalConditions: '',
  loadCondition: '',
  clientRepresentative: '',
  ambientTemperatureC: null,
  emissivity: 0.95,
  reflectedTemperatureC: null,
  equipmentId: '',
  additionalNotes: '',
});

@Component({
  selector: 'oa-thermal-inspection',
  imports: [FormsModule],
  templateUrl: './thermal-inspection.component.html',
  styleUrl: './thermal-inspection.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThermalInspectionComponent {
  private readonly api = inject(ApiService);
  protected readonly offline = inject(OfflineVisitService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly visitId = this.route.snapshot.paramMap.get('visitId') ?? '';
  protected readonly guestToken = this.route.snapshot.paramMap.get('token') ?? '';
  protected readonly taskId = this.route.snapshot.paramMap.get('taskId') ?? '';
  protected readonly visit = signal<VisitSummary | undefined>(undefined);
  protected readonly task = signal<VisitTask | undefined>(undefined);
  protected readonly inspection = signal<InspectionSummary | undefined>(undefined);
  protected readonly equipment = signal<OrganisationEquipment[]>([]);
  protected readonly images = signal<AssetMedia[]>([]);
  protected readonly imageUrls = signal<Record<string, string>>({});
  protected readonly failedImageIds = signal<Set<string>>(new Set());
  protected readonly selectedImageIds = signal<Set<string>>(new Set());
  protected readonly targets = signal<ThermalTarget[]>([]);
  protected readonly selectedTargetId = signal('');
  protected readonly currentStep = signal<ThermalStep>('details');
  protected readonly filter = signal<ImageKind | 'all'>('all');
  protected readonly search = signal('');
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly previewing = signal(false);
  protected readonly previewError = signal('');
  protected readonly uploading = signal(false);
  protected readonly uploadProgress = signal('');
  protected readonly error = signal('');
  protected readonly saved = signal('');
  protected readonly details = signal<ThermalDetails>(emptyDetails());
  protected signerName = '';
  protected reportReference = '';
  protected overallOutcome = '';
  private draggedImageId = '';
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  private draftWrite: Promise<void> = Promise.resolve();
  private metadataWrite: Promise<void> = Promise.resolve();
  private metadataWriteError: Error | undefined;
  private readonly failedMetadataIds = new Set<string>();
  protected readonly selectedTarget = computed(
    () => this.targets().find(({ id }) => id === this.selectedTargetId()) ?? this.targets()[0],
  );
  protected readonly selectedEquipment = computed(() =>
    this.equipment().find(({ id }) => id === this.details().equipmentId),
  );
  protected readonly filteredImages = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.images().filter((image) => {
      const text =
        `${image.caption ?? ''} ${image.originalFilename ?? ''} ${(image.tags ?? []).join(' ')} ${image.category}`.toLowerCase();
      return (
        (this.filter() === 'all' || this.filter() === this.imageKind(image)) &&
        (!q || text.includes(q))
      );
    });
  });
  protected readonly unclassifiedCount = computed(
    () => this.images().filter((image) => this.imageKind(image) === 'unclassified').length,
  );
  protected readonly faultCount = computed(
    () => this.targets().filter(({ condition }) => condition === 'FAULT').length,
  );
  protected readonly assignedImageIds = computed(
    () => new Set(this.targets().flatMap(({ imageIds }) => imageIds)),
  );
  protected readonly assignedImageCount = computed(() => this.assignedImageIds().size);
  protected readonly availableImages = computed(() =>
    this.filteredImages().filter(({ id }) => !this.assignedImageIds().has(id)),
  );
  protected readonly canReviewPdf = computed(() =>
    canReviewThermalPdf({
      guestToken: this.guestToken,
      online: this.offline.online(),
      hasInspection: this.inspection() !== undefined,
    }),
  );
  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.draftTimer !== undefined) clearTimeout(this.draftTimer);
      for (const url of Object.values(this.imageUrls())) URL.revokeObjectURL(url);
    });
    void this.load();
  }
  protected goToStep(step: ThermalStep): void {
    this.error.set('');
    this.currentStep.set(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  protected async nextFromDetails(): Promise<void> {
    if (this.details().scope.trim().length < 5) {
      this.error.set('Add a short scope of inspection before continuing.');
      return;
    }
    await this.saveDraft();
    this.goToStep('images');
  }
  protected nextFromImages(): void {
    if (!this.images().length) {
      this.error.set('Upload at least one inspection image before continuing.');
      return;
    }
    if (this.unclassifiedCount()) {
      this.error.set('Classify every uploaded image as infrared or standard before continuing.');
      return;
    }
    this.goToStep('targets');
  }
  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    const inspection = this.inspection();
    if (!inspection || !files.length) return;
    const limitError = thermalImageLimitError(this.images().length, files.length);
    if (limitError) {
      this.error.set(limitError);
      input.value = '';
      return;
    }
    const invalid = files.find(
      ({ type, size }) =>
        !['image/jpeg', 'image/png', 'image/webp'].includes(type) || size < 1 || size > 25_000_000,
    );
    if (invalid) {
      this.error.set(`${invalid.name} is not a supported image or is larger than 25 MB.`);
      input.value = '';
      return;
    }
    this.uploading.set(true);
    this.error.set('');
    let completed = 0;
    try {
      for (let offset = 0; offset < files.length; offset += 3) {
        await Promise.all(
          files.slice(offset, offset + 3).map(async (file) => {
            const blob = await compressPhoto(file);
            if (blob.size > 2_000_000)
              throw new Error(`${file.name} is larger than 2 MB after compression.`);
            const media = this.offline.online()
              ? (this.guestToken
                  ? await this.api.uploadGuestThermalImage(
                      this.guestToken,
                      inspection.id,
                      'unclassified',
                      blob,
                      file.name,
                    )
                  : await this.uploadAuthenticated(inspection.id, file.name, blob)
                ).media
              : await this.offline.storeThermalImage(
                  this.organisationId || this.visit()?.organisationId || '',
                  this.visit()?.id ?? this.visitId,
                  inspection.id,
                  this.guestToken || undefined,
                  blob,
                  file.name,
                  this.images().length + completed,
                );
            if (!media.id.startsWith('offline:'))
              await this.offline.cacheThermalImage(
                this.organisationId || this.visit()?.organisationId || '',
                this.visit()?.id ?? this.visitId,
                inspection.id,
                this.guestToken || undefined,
                media,
                blob,
              );
            this.images.update((items) => [...items, media]);
            this.imageUrls.update((urls) => ({
              ...urls,
              [media.id]: URL.createObjectURL(blob),
            }));
            completed += 1;
            this.uploadProgress.set(`${completed} of ${files.length} uploaded`);
          }),
        );
      }
      this.saved.set(
        this.offline.online()
          ? `${files.length} image${files.length === 1 ? '' : 's'} uploaded`
          : `${files.length} image${files.length === 1 ? '' : 's'} saved on device`,
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The images could not be uploaded.');
    } finally {
      input.value = '';
      this.uploading.set(false);
      this.uploadProgress.set('');
    }
  }
  protected toggleImage(id: string): void {
    const next = new Set(this.selectedImageIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedImageIds.set(next);
  }
  protected selectAllVisible(): void {
    const visible = this.filteredImages().map(({ id }) => id);
    const selected = this.selectedImageIds();
    const all = visible.length > 0 && visible.every((id) => selected.has(id));
    const next = new Set(selected);
    for (const id of visible) {
      if (all) next.delete(id);
      else next.add(id);
    }
    this.selectedImageIds.set(next);
  }
  protected async classifySelected(kind: ImageKind): Promise<void> {
    const ids = [...this.selectedImageIds()];
    if (!ids.length) return;
    await this.updateManyImages(ids, { category: this.categoryFor(kind) });
    this.selectedImageIds.set(new Set());
  }
  protected dragStart(id: string): void {
    this.draggedImageId = id;
  }
  protected async dropInLane(kind: ImageKind): Promise<void> {
    if (!this.draggedImageId) return;
    const id = this.draggedImageId;
    this.draggedImageId = '';
    await this.updateManyImages([id], { category: this.categoryFor(kind) });
  }
  protected async dropBefore(targetId: string): Promise<void> {
    const sourceId = this.draggedImageId;
    this.draggedImageId = '';
    if (!sourceId || sourceId === targetId) return;
    const source = this.images().find(({ id }) => id === sourceId);
    const target = this.images().find(({ id }) => id === targetId);
    if (!source || !target) return;
    const reordered = this.images().filter(({ id }) => id !== sourceId);
    reordered.splice(
      reordered.findIndex(({ id }) => id === targetId),
      0,
      { ...source, category: target.category },
    );
    this.images.set(reordered.map((image, index) => ({ ...image, sortOrder: index })));
    await this.updateManyImages(
      reordered.map(({ id }) => id),
      undefined,
      reordered,
    );
  }
  protected async updateImageName(image: AssetMedia, caption: string): Promise<void> {
    if (caption.trim() === (image.caption ?? '')) return;
    await this.updateManyImages([image.id], {
      caption: caption.trim() || image.originalFilename || 'Inspection image',
    });
  }
  protected async updateImageTags(image: AssetMedia, value: string): Promise<void> {
    const tags = [
      ...new Set(
        value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ].slice(0, 20);
    await this.updateManyImages([image.id], { tags });
  }
  protected retryImage(image: AssetMedia): void {
    this.failedImageIds.update((ids) => {
      const next = new Set(ids);
      next.delete(image.id);
      return next;
    });
    void this.loadImageUrls([image], true);
  }
  protected createTarget(): void {
    const imageIds = [...this.selectedImageIds()];
    this.error.set('');
    const target: ThermalTarget = {
      id: crypto.randomUUID(),
      name: `Target item ${this.targets().length + 1}`,
      reference: '',
      location: '',
      imageIds,
      condition: 'NO_ISSUES',
      issueSummary: '',
      severity: 'MINOR',
      maxTemperatureC: null,
      deltaTemperatureC: null,
      observations: '',
      recommendation: '',
    };
    this.targets.update((items) => [...items, target]);
    this.selectedTargetId.set(target.id);
    this.selectedImageIds.set(new Set());
    void this.saveDraft('Target created');
  }
  protected addSelectedToTarget(): void {
    const selected = this.selectedTarget();
    if (!selected) return;
    this.error.set('');
    this.patchTarget({
      imageIds: [...new Set([...selected.imageIds, ...this.selectedImageIds()])],
    });
    this.selectedImageIds.set(new Set());
  }
  protected removeTarget(): void {
    const selected = this.selectedTarget();
    if (
      !selected ||
      !confirm(`Remove ${selected.name}? The uploaded images will remain available.`)
    )
      return;
    this.targets.update((items) => items.filter(({ id }) => id !== selected.id));
    this.selectedTargetId.set(this.targets()[0]?.id ?? '');
    void this.saveDraft('Target removed');
  }
  protected removeImageFromTarget(id: string): void {
    const selected = this.selectedTarget();
    if (selected) {
      const imageIds = selected.imageIds.filter((imageId) => imageId !== id);
      this.patchTarget({
        imageIds,
        imageDescriptions: normalizeImageDescriptions(imageIds, selected.imageDescriptions),
      });
    }
  }
  protected moveImageInTarget(id: string, direction: -1 | 1): void {
    const selected = this.selectedTarget();
    if (!selected) return;
    const imageIds = [...selected.imageIds];
    const from = imageIds.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= imageIds.length) return;
    const moved = imageIds[from] as string;
    imageIds[from] = imageIds[to] as string;
    imageIds[to] = moved;
    this.patchTarget({
      imageIds,
      imageDescriptions: normalizeImageDescriptions(imageIds, selected.imageDescriptions),
    });
  }
  protected patchTargetImageDescription(imageId: string, value: string): void {
    const selected = this.selectedTarget();
    if (!selected) return;
    this.patchTarget({
      imageDescriptions: patchImageDescription(selected, imageId, value),
    });
  }
  protected patchTarget(patch: Partial<ThermalTarget>): void {
    const id = this.selectedTarget()?.id;
    if (!id) return;
    this.targets.update((items) =>
      items.map((target) => (target.id === id ? { ...target, ...patch } : target)),
    );
    this.scheduleDraft();
  }
  protected patchDetails(patch: Partial<ThermalDetails>): void {
    this.details.update((details) => ({ ...details, ...patch }));
    this.scheduleDraft();
  }
  protected patchSignerName(value: string): void {
    this.signerName = value;
    this.scheduleDraft();
  }
  protected patchReportReference(value: string): void {
    this.reportReference = value;
    this.scheduleDraft();
  }
  protected patchOverallOutcome(value: string): void {
    this.overallOutcome = value;
    this.scheduleDraft();
  }
  protected setCondition(condition: ThermalCondition): void {
    this.patchTarget(
      condition === 'NO_ISSUES'
        ? {
            condition,
            issueSummary: '',
            observations: '',
            recommendation: '',
            maxTemperatureC: null,
            deltaTemperatureC: null,
          }
        : { condition },
    );
  }
  protected imageKind(image: AssetMedia): ImageKind {
    return image.category === 'thermal-image'
      ? 'thermal'
      : image.category === 'standard-image'
        ? 'standard'
        : 'unclassified';
  }
  protected imageById(id: string): AssetMedia | undefined {
    return this.images().find((image) => image.id === id);
  }
  protected imageLabel(id: string, index: number): string {
    const image = this.imageById(id);
    return image?.caption || image?.originalFilename || `Image ${index + 1}`;
  }
  protected imageCount(kind: ImageKind): number {
    return this.images().filter((image) => this.imageKind(image) === kind).length;
  }
  protected async submit(): Promise<void> {
    const inspection = this.inspection(),
      visit = this.visit();
    if (!inspection || !visit || this.submitting() || this.previewing()) return;
    if (this.signerName.trim().length < 2) {
      this.error.set('Enter the engineer name before submitting.');
      return;
    }
    if (!this.targets().length) {
      this.error.set('Create at least one target item before submitting.');
      return;
    }
    const incomplete = this.targets().find(
      (target) =>
        !target.name.trim() ||
        !target.imageIds.length ||
        (target.condition === 'FAULT' && !target.issueSummary.trim()),
    );
    if (incomplete) {
      this.selectedTargetId.set(incomplete.id);
      this.currentStep.set('targets');
      this.error.set(
        !incomplete.imageIds.length
          ? `${incomplete.name || 'A target'} needs at least one image.`
          : 'Every reported fault needs a clear issue summary.',
      );
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    try {
      await this.saveDraft();
      await this.awaitMetadataWrites();
      const mediaIds = this.offline.online()
        ? await this.offline.uploadThermalImages(inspection.id)
        : {};
      const submission = this.buildReport(mediaIds);
      if (this.guestToken)
        await this.offline.queueGuest(
          this.guestToken,
          visit.organisationId,
          visit.id,
          this.taskId,
          inspection.id,
          submission,
        );
      else
        await this.offline.queue(
          this.organisationId,
          visit.id,
          'Inspection',
          'SUBMIT_INSPECTION',
          { inspectionId: inspection.id, submission },
          this.taskId,
        );
      await this.router.navigate(
        this.guestToken
          ? ['/guest/job', this.guestToken]
          : ['/app/org', this.organisationId, 'visits', this.visitId],
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The report could not be submitted.');
    } finally {
      this.submitting.set(false);
    }
  }
  protected async reviewPdf(): Promise<void> {
    const inspection = this.inspection();
    if (!this.canReviewPdf() || inspection === undefined || this.previewing() || this.submitting())
      return;
    const signerError = thermalPreviewSignerError(this.signerName);
    if (signerError) {
      this.previewError.set(signerError);
      return;
    }
    const previewWindow = window.open('about:blank', '_blank');
    if (previewWindow !== null) previewWindow.opener = null;
    this.previewing.set(true);
    this.previewError.set('');
    this.error.set('');
    try {
      await this.saveDraft();
      await this.awaitMetadataWrites();
      const mediaIds = await this.offline.uploadThermalImages(inspection.id);
      const blob = await this.api.previewThermalInspectionPdf(
        this.organisationId,
        inspection.id,
        thermalPreviewBody(this.buildReport(mediaIds)),
      );
      const url = URL.createObjectURL(blob);
      if (previewWindow === null) window.open(url, '_blank', 'noopener,noreferrer');
      else previewWindow.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    } catch (error: unknown) {
      previewWindow?.close();
      this.previewError.set(
        error instanceof Error ? error.message : 'The report preview could not be generated.',
      );
    } finally {
      this.previewing.set(false);
    }
  }
  protected async back(): Promise<void> {
    await this.router.navigate(
      this.guestToken
        ? ['/guest/job', this.guestToken]
        : ['/app/org', this.organisationId, 'visits', this.visitId],
    );
  }
  protected async saveDraft(message = ''): Promise<void> {
    const inspection = this.inspection(),
      visit = this.visit();
    if (!inspection || !visit) return;
    if (this.draftTimer !== undefined) {
      clearTimeout(this.draftTimer);
      this.draftTimer = undefined;
    }
    const snapshot = {
      reportType: 'THERMAL_IMAGING',
      details: this.details(),
      targets: this.targets(),
      signerName: this.signerName,
      reportReference: this.reportReference,
      overallOutcome: this.overallOutcome,
    };
    const write = () =>
      this.offline.saveDraft(visit.organisationId, visit.id, inspection.id, snapshot);
    this.draftWrite = this.draftWrite.then(write, write);
    await this.draftWrite;
    if (message) this.saved.set(message);
  }
  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const cached = await this.offline.pack(this.visitId, this.guestToken || undefined);
      let visit: VisitSummary;
      if (!this.offline.online()) {
        if (cached === undefined)
          throw new Error(
            'This job is not saved for offline use. Reconnect and download the job pack.',
          );
        visit = cached;
      } else {
        try {
          visit = this.guestToken
            ? (await this.api.guestVisit(this.guestToken)).visit
            : (await this.api.getVisit(this.organisationId, this.visitId)).visit;
        } catch (error) {
          if (cached === undefined) throw error;
          visit = cached;
        }
      }
      const task = visit.tasks.find(({ id }) => id === this.taskId);
      if (!task || task.moduleKey !== 'thermal-imaging')
        throw new Error('This thermal imaging task is unavailable.');
      let inspectionId = task.inspection?.id;
      if (!inspectionId && !this.offline.online())
        throw new Error('This thermal task was not prepared in the downloaded job pack.');
      if (!inspectionId)
        inspectionId = this.guestToken
          ? (await this.api.startGuestInspection(this.guestToken, task.id)).inspection.id
          : (await this.api.startInspection(this.organisationId, task.id)).inspection.id;
      this.visit.set(visit);
      this.task.set(task);
      const cachedContext = await this.offline.thermalContext(inspectionId);
      if (!this.offline.online() && cachedContext === undefined)
        throw new Error('This thermal task is not available offline. Download the job pack again.');
      if (!this.offline.online() && cachedContext !== undefined) {
        this.inspection.set(cachedContext.inspection);
        this.equipment.set(cachedContext.equipment);
        this.images.set(await this.offline.thermalImages(inspectionId));
        void this.loadImageUrls(this.images());
      } else {
        const equipmentRequest = this.guestToken
          ? this.api.listGuestEquipment(this.guestToken)
          : this.api.listEquipment(this.organisationId);
        try {
          const [, equipment] = await Promise.all([
            this.refreshInspection(inspectionId),
            equipmentRequest,
          ]);
          this.equipment.set(equipment.equipment);
        } catch (error) {
          if (cachedContext === undefined) throw error;
          this.inspection.set(cachedContext.inspection);
          this.equipment.set(cachedContext.equipment);
          this.images.set(await this.offline.thermalImages(inspectionId));
          void this.loadImageUrls(this.images());
        }
      }
      const draft = await this.offline.draft(inspectionId);
      const source = draft ?? this.inspection()?.revisions[0]?.data;
      if (source) this.restore(source);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The report could not be opened.');
    } finally {
      this.loading.set(false);
    }
  }
  private async refreshInspection(id = this.inspection()?.id): Promise<void> {
    if (!id) return;
    const inspection = this.guestToken
      ? (await this.api.getGuestInspection(this.guestToken, id)).inspection
      : (await this.api.getInspection(this.organisationId, id)).inspection;
    this.inspection.set(inspection);
    this.images.set(inspection.evidenceMedia ?? []);
    void this.loadImageUrls(inspection.evidenceMedia ?? []);
  }
  private async loadImageUrls(images: AssetMedia[], force = false): Promise<void> {
    const queue = images.filter((image) => force || !this.imageUrls()[image.id]);
    for (let offset = 0; offset < queue.length; offset += 6) {
      await Promise.all(
        queue.slice(offset, offset + 6).map(async (image) => {
          try {
            let blob: Blob | undefined;
            blob = await this.offline.thermalImageBlob(image.id);
            for (let attempt = 0; attempt < 2; attempt += 1) {
              if (blob?.size) break;
              try {
                blob = this.guestToken
                  ? await this.api.downloadGuestMedia(this.guestToken, image.id)
                  : await this.api.downloadMedia(this.organisationId, image.id);
                if (blob.size) break;
              } catch (error) {
                if (attempt === 1) throw error;
              }
            }
            if (!blob?.size) throw new Error('Empty image response');
            const url = URL.createObjectURL(blob);
            this.imageUrls.update((urls) => {
              const previous = urls[image.id];
              if (force && previous) URL.revokeObjectURL(previous);
              return { ...urls, [image.id]: url };
            });
            this.failedImageIds.update((ids) => {
              const next = new Set(ids);
              next.delete(image.id);
              return next;
            });
          } catch {
            this.failedImageIds.update((ids) => new Set([...ids, image.id]));
          }
        }),
      );
    }
  }
  private async uploadAuthenticated(id: string, filename: string, blob: Blob) {
    const registered = await this.api.registerMedia(this.organisationId, {
      entityType: 'Inspection',
      entityId: id,
      category: 'unclassified-image',
      caption: filename,
      originalFilename: filename,
      mimeType: 'image/jpeg',
      size: blob.size,
      sortOrder: this.images().length,
    });
    return this.api.uploadMedia(this.organisationId, registered.media.id, blob);
  }
  private async updateManyImages(
    ids: string[],
    patch?: MediaMetadata,
    ordered?: AssetMedia[],
  ): Promise<void> {
    const intended = ids
      .map((id, index) => {
        const current = this.images().find((image) => image.id === id);
        const orderedImage = ordered?.[index];
        if (!current) return undefined;
        return {
          ...current,
          ...(ordered
            ? {
                sortOrder: index,
                ...(orderedImage?.id === id ? { category: orderedImage.category } : {}),
              }
            : (patch ?? {})),
        };
      })
      .filter((media): media is AssetMedia => media !== undefined);
    const byId = new Map(intended.map((media) => [media.id, media]));
    this.images.update((items) => items.map((item) => byId.get(item.id) ?? item));
    const write = async () => {
      await this.offline.updateThermalImages(intended.map((media) => ({ id: media.id, media })));
      const serverIds = new Set(
        [...ids, ...this.failedMetadataIds].filter((id) => !id.startsWith('offline:')),
      );
      if (!this.offline.online() || serverIds.size === 0) return;
      await this.syncServerMetadata(serverIds);
    };
    const operation = this.metadataWrite.then(write);
    this.metadataWrite = operation.catch((error: unknown) => {
      this.error.set(
        error instanceof Error ? error.message : 'The image changes could not be saved.',
      );
    });
    await this.metadataWrite;
    if (this.metadataWriteError === undefined) this.saved.set('Image gallery updated');
  }
  private async awaitMetadataWrites(): Promise<void> {
    await this.metadataWrite;
    if (this.metadataWriteError === undefined) return;
    const action = metadataFailureAction(this.offline.online(), this.failedMetadataIds.size);
    if (action === 'defer') return;
    if (action === 'retry') {
      try {
        await this.syncServerMetadata(new Set(this.failedMetadataIds));
        return;
      } catch {
        // This is the single automatic retry. Keep the dirty state for a later attempt.
      }
    }
    throw new Error(`Image metadata is not saved: ${this.metadataWriteError.message}`);
  }
  private async syncServerMetadata(serverIds: Set<string>): Promise<void> {
    const inspection = this.inspection();
    const serverMedia = this.images()
      .filter(({ id }) => serverIds.has(id))
      .map((media) => ({ mediaId: media.id, media }));
    if (inspection === undefined || serverMedia.length === 0)
      throw new Error('The image metadata could not be prepared for saving.');
    try {
      const body = buildMediaMetadataUpdateBody(serverMedia);
      const result = this.guestToken
        ? await this.api.updateGuestInspectionMediaBulk(
            this.guestToken,
            inspection.id,
            body.updates,
          )
        : await this.api.updateInspectionMediaBulk(
            this.organisationId,
            inspection.id,
            body.updates,
          );
      this.failedMetadataIds.clear();
      this.metadataWriteError = undefined;
      const clean = serverMedia.map((item, index) => ({
        id: item.mediaId,
        media: result.media[index] ?? item.media,
      }));
      await this.offline.markThermalImageMetadataClean(clean);
      const cleanById = new Map(clean.map(({ id, media }) => [id, media]));
      this.images.update((items) => items.map((item) => cleanById.get(item.id) ?? item));
    } catch (error: unknown) {
      for (const id of serverIds) this.failedMetadataIds.add(id);
      this.metadataWriteError =
        error instanceof Error ? error : new Error('The image changes could not be saved.');
      throw this.metadataWriteError;
    }
  }
  private buildReport(mediaIds: Record<string, string> = {}) {
    const targets = this.targets().map((target) => remapThermalTargetIds(target, mediaIds));
    return buildThermalInspectionReport({
      details: this.details(),
      targets,
      images: this.images(),
      ...(this.selectedEquipment() === undefined ? {} : { equipment: this.selectedEquipment()! }),
      signerName: this.signerName,
      ...(this.reportReference.trim() === ''
        ? {}
        : { reportReference: this.reportReference.trim() }),
      ...(this.overallOutcome.trim() === '' ? {} : { overallOutcome: this.overallOutcome.trim() }),
    });
  }
  private categoryFor(kind: ImageKind): ImageCategory {
    return kind === 'thermal'
      ? 'thermal-image'
      : kind === 'standard'
        ? 'standard-image'
        : 'unclassified-image';
  }
  private restore(data: Record<string, unknown>): void {
    const targets = (Array.isArray(data['targets']) ? data['targets'] : []).flatMap((target) => {
      const normalized = normalizeThermalTarget(target);
      return normalized === undefined ? [] : [normalized];
    });
    this.targets.set(targets);
    this.selectedTargetId.set(targets[0]?.id ?? '');
    const details = data['details'];
    if (typeof details === 'object' && details !== null)
      this.details.set({ ...emptyDetails(), ...(details as Partial<ThermalDetails>) });
    if (typeof data['signerName'] === 'string') this.signerName = data['signerName'];
    if (typeof data['reportReference'] === 'string') this.reportReference = data['reportReference'];
    if (typeof data['overallOutcome'] === 'string') this.overallOutcome = data['overallOutcome'];
  }
  private scheduleDraft(): void {
    if (this.draftTimer !== undefined) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      this.draftTimer = undefined;
      void this.saveDraft();
    }, 250);
  }
}
