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
import { OfflineVisitService } from '../core/offline-visit.service';

type ThermalCondition = 'NO_ISSUES' | 'FAULT';
type ThermalSeverity = 'ADVISORY' | 'MINOR' | 'MAJOR' | 'DANGEROUS';
type ThermalStep = 'details' | 'images' | 'targets' | 'review';
type ImageKind = 'unclassified' | 'thermal' | 'standard';
type ImageCategory = 'unclassified-image' | 'thermal-image' | 'standard-image';
interface ThermalDetails {
  scope: string;
  purpose: string;
  inspectionMethod: string;
  areasInspected: string;
  areasExcluded: string;
  limitations: string;
  environmentalConditions: string;
  loadCondition: string;
  clientRepresentative: string;
  ambientTemperatureC: number | null;
  emissivity: number | null;
  reflectedTemperatureC: number | null;
  equipmentId: string;
  additionalNotes: string;
}
interface ThermalTarget {
  id: string;
  name: string;
  reference: string;
  location: string;
  imageIds: string[];
  condition: ThermalCondition;
  issueSummary: string;
  severity: ThermalSeverity;
  maxTemperatureC: number | null;
  deltaTemperatureC: number | null;
  observations: string;
  recommendation: string;
}
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
  private readonly offline = inject(OfflineVisitService);
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
  protected readonly busy = signal(false);
  protected readonly uploading = signal(false);
  protected readonly uploadProgress = signal('');
  protected readonly error = signal('');
  protected readonly saved = signal('');
  protected readonly details = signal<ThermalDetails>(emptyDetails());
  protected signerName = '';
  private draggedImageId = '';
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  private draftWrite: Promise<void> = Promise.resolve();
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
  protected readonly availableImages = computed(() =>
    this.filteredImages().filter(({ id }) => !this.assignedImageIds().has(id)),
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
    const invalid = files.find(
      ({ type, size }) =>
        !['image/jpeg', 'image/png', 'image/webp'].includes(type) || size < 1 || size > 20_000_000,
    );
    if (invalid) {
      this.error.set(`${invalid.name} is not a supported image or is larger than 20 MB.`);
      input.value = '';
      return;
    }
    if (!navigator.onLine) {
      this.error.set(
        'Reconnect before uploading images. Your report details remain saved on this device.',
      );
      return;
    }
    this.uploading.set(true);
    this.error.set('');
    let completed = 0;
    try {
      for (let offset = 0; offset < files.length; offset += 3) {
        await Promise.all(
          files.slice(offset, offset + 3).map(async (file) => {
            const blob = await this.normaliseForReport(file);
            if (blob.size > 20_000_000)
              throw new Error(`${file.name} is larger than 20 MB after processing.`);
            const uploaded = this.guestToken
              ? await this.api.uploadGuestThermalImage(
                  this.guestToken,
                  inspection.id,
                  'unclassified',
                  blob,
                  file.name,
                )
              : await this.uploadAuthenticated(inspection.id, file.name, blob);
            this.images.update((items) => [...items, uploaded.media]);
            this.imageUrls.update((urls) => ({
              ...urls,
              [uploaded.media.id]: URL.createObjectURL(blob),
            }));
            completed += 1;
            this.uploadProgress.set(`${completed} of ${files.length} uploaded`);
          }),
        );
      }
      this.saved.set(`${files.length} image${files.length === 1 ? '' : 's'} uploaded`);
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
    const imageIds = [...this.selectedImageIds()].filter((id) => {
      const image = this.imageById(id);
      return image && this.imageKind(image) !== 'unclassified';
    });
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
    if (selected)
      this.patchTarget({ imageIds: selected.imageIds.filter((imageId) => imageId !== id) });
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
  protected imageCount(kind: ImageKind): number {
    return this.images().filter((image) => this.imageKind(image) === kind).length;
  }
  protected async submit(): Promise<void> {
    const inspection = this.inspection(),
      visit = this.visit();
    if (!inspection || !visit || this.busy()) return;
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
    if (!navigator.onLine) {
      await this.saveDraft('Saved on this device — reconnect to submit');
      this.error.set('Reconnect to submit this image-based report.');
      return;
    }
    const defects = this.targets()
      .filter(({ condition }) => condition === 'FAULT')
      .map((target) => ({
        title: target.issueSummary,
        description: [target.name, target.location, target.observations, target.recommendation]
          .filter(Boolean)
          .join(' — '),
        severity: target.severity,
        photoMediaIds: target.imageIds,
      }));
    const equipment = this.selectedEquipment();
    const submission = {
      data: {
        reportType: 'THERMAL_IMAGING',
        outcome: defects.length ? 'FAULTS_REPORTED' : 'NO_ISSUES',
        targetCount: this.targets().length,
        imageCount: this.images().length,
        details: this.details(),
        equipment: equipment
          ? {
              id: equipment.id,
              name: equipment.name,
              equipmentType: equipment.equipmentType,
              manufacturer: equipment.manufacturer,
              model: equipment.model,
              serialNumber: equipment.serialNumber,
              calibrationDueAt: equipment.calibrationDueAt,
            }
          : undefined,
        targets: this.targets(),
      },
      validation: { valid: true, faultCount: defects.length },
      signature: {
        signerName: this.signerName.trim(),
        signerRole: 'Engineer',
        signatureData: `typed:${this.signerName.trim()}:${new Date().toISOString()}`,
      },
      defects,
    };
    this.busy.set(true);
    this.error.set('');
    try {
      await this.saveDraft();
      if (this.guestToken)
        await this.api.submitGuestInspection(this.guestToken, inspection.id, submission);
      else await this.api.submitInspection(this.organisationId, inspection.id, submission);
      await this.offline.discardDraft(inspection.id);
      await this.router.navigate(
        this.guestToken
          ? ['/guest/visit', this.guestToken]
          : ['/app/org', this.organisationId, 'visits', this.visitId],
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The report could not be submitted.');
    } finally {
      this.busy.set(false);
    }
  }
  protected async back(): Promise<void> {
    await this.router.navigate(
      this.guestToken
        ? ['/guest/visit', this.guestToken]
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
    };
    const write = () =>
      this.offline.saveDraft(visit.organisationId, visit.id, inspection.id, snapshot);
    this.draftWrite = this.draftWrite.then(write, write);
    await this.draftWrite;
    if (message) this.saved.set(message);
  }
  private async load(): Promise<void> {
    this.busy.set(true);
    try {
      const visit = this.guestToken
        ? (await this.api.guestVisit(this.guestToken)).visit
        : (await this.api.getVisit(this.organisationId, this.visitId)).visit;
      const task = visit.tasks.find(({ id }) => id === this.taskId);
      if (!task || task.moduleKey !== 'thermal-imaging')
        throw new Error('This thermal imaging task is unavailable.');
      let inspectionId = task.inspection?.id;
      if (!inspectionId)
        inspectionId = this.guestToken
          ? (await this.api.startGuestInspection(this.guestToken, task.id)).inspection.id
          : (await this.api.startInspection(this.organisationId, task.id)).inspection.id;
      this.visit.set(visit);
      this.task.set(task);
      const equipmentRequest = this.guestToken
        ? this.api.listGuestEquipment(this.guestToken)
        : this.api.listEquipment(this.organisationId);
      const [, equipment] = await Promise.all([
        this.refreshInspection(inspectionId),
        equipmentRequest,
      ]);
      this.equipment.set(equipment.equipment);
      const draft = await this.offline.draft(inspectionId);
      const source = draft ?? this.inspection()?.revisions[0]?.data;
      if (source) this.restore(source);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The report could not be opened.');
    } finally {
      this.busy.set(false);
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
            for (let attempt = 0; attempt < 2; attempt += 1) {
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
    patch?: Partial<Pick<AssetMedia, 'caption' | 'category' | 'tags' | 'sortOrder'>>,
    ordered?: AssetMedia[],
  ): Promise<void> {
    try {
      const updates = await Promise.all(
        ids.map((id, index) => {
          const orderedImage = ordered?.[index];
          const input = ordered
            ? {
                sortOrder: index,
                ...(orderedImage?.id === id ? { category: orderedImage.category } : {}),
              }
            : (patch ?? {});
          return this.guestToken
            ? this.api.updateGuestMedia(this.guestToken, id, input)
            : this.api.updateMedia(this.organisationId, id, input);
        }),
      );
      const byId = new Map(updates.map(({ media }) => [media.id, media]));
      this.images.update((items) => items.map((item) => byId.get(item.id) ?? item));
      this.saved.set('Image gallery updated');
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'The image changes could not be saved.',
      );
    }
  }
  private categoryFor(kind: ImageKind): ImageCategory {
    return kind === 'thermal'
      ? 'thermal-image'
      : kind === 'standard'
        ? 'standard-image'
        : 'unclassified-image';
  }
  private async normaliseForReport(file: File): Promise<Blob> {
    if (file.type === 'image/jpeg') return file;
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not process the selected image.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error('The selected image could not be prepared for the report.')),
          'image/jpeg',
          0.92,
        ),
      );
    } finally {
      bitmap.close();
    }
  }
  private restore(data: Record<string, unknown>): void {
    const targets = (Array.isArray(data['targets']) ? data['targets'] : []).filter(this.isTarget);
    this.targets.set(targets);
    this.selectedTargetId.set(targets[0]?.id ?? '');
    const details = data['details'];
    if (typeof details === 'object' && details !== null)
      this.details.set({ ...emptyDetails(), ...(details as Partial<ThermalDetails>) });
    if (typeof data['signerName'] === 'string') this.signerName = data['signerName'];
  }
  private readonly isTarget = (value: unknown): value is ThermalTarget => {
    if (typeof value !== 'object' || value === null) return false;
    const item = value as Partial<ThermalTarget>;
    return (
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      Array.isArray(item.imageIds) &&
      (item.condition === 'NO_ISSUES' || item.condition === 'FAULT')
    );
  };
  private scheduleDraft(): void {
    if (this.draftTimer !== undefined) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      this.draftTimer = undefined;
      void this.saveDraft();
    }, 250);
  }
}
