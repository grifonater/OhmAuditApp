import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  type OnDestroy,
} from '@angular/core';
import {
  ApiService,
  type AssetMedia,
  type VisitFinding,
  type VisitFindingCategory,
  type VisitFindingInput,
  type VisitFindingSeverity,
} from '../core/api.service';
import { compressPhoto } from '../core/image-compression';

@Component({
  selector: 'oa-visit-findings-editor',
  template: `
    <section class="visit-findings" aria-labelledby="visit-findings-title">
      <div class="findings-heading">
        <div>
          <p class="eyebrow">Whole-job record</p>
          <h3 id="visit-findings-title">Job findings</h3>
          <p>
            View and correct notes, advice, faults and conditions that apply to the whole visit.
          </p>
        </div>
        <button
          class="button secondary compact"
          type="button"
          [disabled]="loading() || saving() || mediaBusy().size > 0"
          (click)="addFinding()"
        >
          + Add finding
        </button>
      </div>

      @if (error()) {
        <p class="editor-message error" role="alert">{{ error() }}</p>
      }
      @if (success()) {
        <p class="editor-message success" role="status">{{ success() }}</p>
      }

      @if (loading()) {
        <div class="findings-loading">
          <span class="editor-spinner"></span>Loading job findings…
        </div>
      } @else {
        <div class="findings-list">
          @for (finding of findings(); track finding.clientFindingId; let index = $index) {
            <article class="finding-entry">
              <div class="finding-entry-heading">
                <strong>Finding {{ index + 1 }}</strong>
                @if (finding.photoMediaIds.length) {
                  <span
                    >{{ finding.photoMediaIds.length }} image{{
                      finding.photoMediaIds.length === 1 ? '' : 's'
                    }}</span
                  >
                }
              </div>
              <div class="finding-grid">
                <label>
                  <span>Title</span>
                  <input
                    [value]="finding.title"
                    placeholder="What was found?"
                    (input)="updateText(finding.clientFindingId, 'title', $event)"
                  />
                </label>
                <label>
                  <span>Category</span>
                  <select
                    [value]="finding.category"
                    (change)="updateCategory(finding.clientFindingId, $event)"
                  >
                    @for (category of categories; track category) {
                      <option [value]="category">{{ category }}</option>
                    }
                  </select>
                </label>
                <label>
                  <span>Severity</span>
                  <select
                    [value]="finding.severity"
                    (change)="updateSeverity(finding.clientFindingId, $event)"
                  >
                    @for (severity of severities; track severity) {
                      <option [value]="severity">{{ severity }}</option>
                    }
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select
                    [value]="finding.status"
                    (change)="updateStatus(finding.clientFindingId, $event)"
                  >
                    @for (status of statuses; track status) {
                      <option [value]="status">{{ status }}</option>
                    }
                  </select>
                </label>
                <label class="finding-description">
                  <span>Description</span>
                  <textarea
                    [value]="finding.description || ''"
                    placeholder="Optional details or context"
                    (input)="updateText(finding.clientFindingId, 'description', $event)"
                  ></textarea>
                </label>
              </div>
              <section
                class="finding-images"
                [attr.aria-label]="'Images for ' + (finding.title || 'finding ' + (index + 1))"
              >
                <div class="finding-images-heading">
                  <strong>Evidence images</strong>
                  <label
                    class="button secondary compact image-picker"
                    [class.disabled]="
                      saving() ||
                      mediaBusy().has(finding.clientFindingId) ||
                      finding.photoMediaIds.length >= 50
                    "
                  >
                    Add images
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      [disabled]="
                        saving() ||
                        mediaBusy().has(finding.clientFindingId) ||
                        finding.photoMediaIds.length >= 50
                      "
                      (change)="uploadImages(finding, $event)"
                    />
                  </label>
                </div>
                @if (mediaBusy().has(finding.clientFindingId)) {
                  <p class="image-progress" role="status">Processing image…</p>
                }
                <div class="image-grid">
                  @for (image of mediaFor(finding); track image.id) {
                    <article class="image-card">
                      @if (imageUrls()[image.id]; as imageUrl) {
                        <img
                          [src]="imageUrl"
                          [alt]="image.caption || finding.title || 'Finding evidence'"
                        />
                      } @else {
                        <div class="image-placeholder" aria-label="Image preview loading">
                          Loading preview…
                        </div>
                      }
                      <label>
                        <span>Caption</span>
                        <input
                          maxlength="500"
                          [value]="captionDrafts()[image.id] || ''"
                          (input)="updateCaptionDraft(image.id, $event)"
                        />
                      </label>
                      <div class="image-actions">
                        <button
                          class="button secondary compact"
                          type="button"
                          [disabled]="
                            mediaBusy().has(image.id) || !captionDrafts()[image.id]?.trim()
                          "
                          (click)="saveCaption(finding.clientFindingId, image.id)"
                        >
                          Save caption
                        </button>
                        <button
                          class="button danger compact"
                          type="button"
                          [disabled]="mediaBusy().has(image.id)"
                          (click)="removeImage(finding.clientFindingId, image.id)"
                        >
                          Remove image
                        </button>
                      </div>
                    </article>
                  } @empty {
                    <p class="images-empty">No images attached.</p>
                  }
                </div>
              </section>
              <button
                class="button danger compact"
                type="button"
                [disabled]="saving() || mediaBusy().size > 0"
                (click)="deleteFinding(finding.clientFindingId)"
              >
                Delete
              </button>
            </article>
          } @empty {
            <p class="findings-empty">No job findings have been recorded.</p>
          }
        </div>
        @if (findings().length) {
          <div class="findings-footer">
            <button
              class="button primary"
              type="button"
              [disabled]="saving() || mediaBusy().size > 0"
              (click)="save()"
            >
              {{ saving() ? 'Saving…' : 'Save findings' }}
            </button>
          </div>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .visit-findings {
      display: grid;
      gap: 1rem;
      padding: 1rem;
      border: 1px solid var(--oa-line);
      border-radius: 0.8rem;
      background: white;
    }
    .findings-heading,
    .finding-entry,
    .findings-footer {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }
    .findings-heading h3,
    .findings-heading p {
      margin: 0;
    }
    .findings-heading .eyebrow {
      margin-bottom: 0.25rem;
    }
    .findings-list {
      display: grid;
      gap: 0.75rem;
    }
    .finding-entry {
      padding: 0.9rem;
      border: 1px solid var(--oa-line);
      border-radius: 0.65rem;
      background: var(--oa-canvas);
      flex-wrap: wrap;
    }
    .finding-entry-heading {
      display: grid;
      align-content: start;
      gap: 0.15rem;
      min-width: 6.5rem;
      color: var(--oa-navy-950);
    }
    .finding-entry-heading span {
      color: var(--oa-ink-muted);
      font-size: 0.7rem;
    }
    .finding-grid {
      min-width: 0;
      flex: 1;
      display: grid;
      grid-template-columns: minmax(0, 2fr) repeat(3, minmax(7.5rem, 0.75fr));
      gap: 0.75rem;
    }
    .finding-images {
      flex: 1 1 100%;
      min-width: 0;
      display: grid;
      gap: 0.65rem;
    }
    .finding-images-heading,
    .image-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .image-picker {
      cursor: pointer;
    }
    .image-picker.disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    .image-picker input {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
    }
    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
      gap: 0.75rem;
    }
    .image-card {
      display: grid;
      align-content: start;
      gap: 0.55rem;
      padding: 0.65rem;
      border: 1px solid var(--oa-line);
      border-radius: 0.6rem;
      background: white;
    }
    .image-card img,
    .image-placeholder {
      width: 100%;
      aspect-ratio: 4 / 3;
      border-radius: 0.4rem;
      object-fit: cover;
      background: var(--oa-canvas);
    }
    .image-placeholder {
      display: grid;
      place-items: center;
      color: var(--oa-ink-muted);
      font-size: 0.75rem;
    }
    .image-card label {
      display: grid;
      gap: 0.3rem;
      color: var(--oa-ink-muted);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .image-card input {
      width: 100%;
    }
    .image-actions {
      align-items: stretch;
      flex-wrap: wrap;
    }
    .images-empty,
    .image-progress {
      margin: 0;
      color: var(--oa-ink-muted);
      font-size: 0.8rem;
    }
    .finding-grid label {
      display: grid;
      gap: 0.3rem;
      color: var(--oa-ink-muted);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .finding-grid input,
    .finding-grid select,
    .finding-grid textarea {
      width: 100%;
    }
    .finding-description {
      grid-column: 1 / -1;
    }
    .finding-description textarea {
      min-height: 5rem;
      resize: vertical;
    }
    .findings-empty,
    .findings-loading {
      margin: 0;
      padding: 1rem;
      color: var(--oa-ink-muted);
      text-align: center;
    }
    .findings-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.65rem;
    }
    .findings-footer {
      justify-content: flex-end;
    }
    .editor-message {
      margin: 0;
      padding: 0.65rem 0.8rem;
      border-radius: 0.55rem;
    }
    .editor-message.error {
      color: var(--oa-danger);
      background: color-mix(in srgb, var(--oa-danger) 10%, white);
    }
    .editor-message.success {
      color: var(--oa-success);
      background: color-mix(in srgb, var(--oa-success) 10%, white);
    }
    .editor-spinner {
      width: 1.1rem;
      height: 1.1rem;
      border: 2px solid var(--oa-line);
      border-top-color: var(--oa-teal-600);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (max-width: 850px) {
      .finding-entry {
        flex-direction: column;
      }
      .finding-grid {
        width: 100%;
        grid-template-columns: 1fr 1fr;
      }
      .finding-images {
        width: 100%;
      }
    }
    @media (max-width: 600px) {
      .findings-heading,
      .finding-entry {
        align-items: stretch;
        flex-direction: column;
      }
      .finding-grid {
        grid-template-columns: 1fr;
      }
      .finding-description {
        grid-column: auto;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitFindingsEditorComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  readonly organisationId = input.required<string>();
  readonly visitId = input.required<string>();
  protected readonly findings = signal<VisitFinding[]>([]);
  protected readonly media = signal<AssetMedia[]>([]);
  protected readonly imageUrls = signal<Record<string, string>>({});
  protected readonly captionDrafts = signal<Record<string, string>>({});
  protected readonly mediaBusy = signal<ReadonlySet<string>>(new Set());
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly categories: VisitFindingCategory[] = ['ADVICE', 'NOTE', 'FAULT', 'CONDITION'];
  protected readonly severities: VisitFindingSeverity[] = [
    'ADVISORY',
    'MINOR',
    'MAJOR',
    'DANGEROUS',
  ];
  protected readonly statuses: VisitFinding['status'][] = [
    'OPEN',
    'ACKNOWLEDGED',
    'RESOLVED',
    'DISMISSED',
  ];
  private loadedVisitId = '';

  constructor() {
    effect(() => void this.load(this.visitId()));
  }

  ngOnDestroy(): void {
    this.revokeImageUrls();
  }

  protected addFinding(): void {
    this.findings.update((rows) => [
      ...rows,
      {
        clientFindingId: crypto.randomUUID(),
        category: 'NOTE',
        title: '',
        severity: 'ADVISORY',
        status: 'OPEN',
        photoMediaIds: [],
      },
    ]);
    this.success.set('');
  }

  protected updateText(id: string, field: 'title' | 'description', event: Event): void {
    this.update(id, { [field]: this.controlValue(event) });
  }

  protected updateCategory(id: string, event: Event): void {
    this.update(id, { category: this.controlValue(event) as VisitFindingCategory });
  }

  protected updateSeverity(id: string, event: Event): void {
    this.update(id, { severity: this.controlValue(event) as VisitFindingSeverity });
  }

  protected updateStatus(id: string, event: Event): void {
    this.update(id, { status: this.controlValue(event) as VisitFinding['status'] });
  }

  protected async deleteFinding(id: string): Promise<void> {
    if (!confirm('Delete this job finding? This cannot be undone.')) return;
    const remaining = this.findings().filter(({ clientFindingId }) => clientFindingId !== id);
    if (remaining.some(({ title }) => title.trim() === '')) {
      this.error.set('Add a title to each remaining job finding before deleting this one.');
      return;
    }
    const target = this.findings().find(({ clientFindingId }) => clientFindingId === id);
    if (target === undefined) return;
    this.saving.set(true);
    this.error.set('');
    try {
      for (const mediaId of target.photoMediaIds) {
        await this.api.deleteVisitFindingImage(this.organisationId(), this.visitId(), id, mediaId);
        this.findings.update((rows) =>
          rows.map((finding) =>
            finding.clientFindingId === id
              ? {
                  ...finding,
                  photoMediaIds: finding.photoMediaIds.filter((item) => item !== mediaId),
                }
              : finding,
          ),
        );
        this.removeLocalMedia([mediaId]);
      }
      await this.persist(remaining, 'Job finding deleted.', true);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to delete the job finding.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.findings().some(({ title }) => title.trim() === '')) {
      this.error.set('Add a title to each job finding before saving.');
      return;
    }
    await this.persist(this.findings(), 'Job findings saved.');
  }

  protected mediaFor(finding: VisitFinding): AssetMedia[] {
    const byId = new Map(this.media().map((item) => [item.id, item]));
    return finding.photoMediaIds.flatMap((id) => {
      const item = byId.get(id);
      return item === undefined ? [] : [item];
    });
  }

  protected updateCaptionDraft(mediaId: string, event: Event): void {
    this.captionDrafts.update((captions) => ({ ...captions, [mediaId]: this.controlValue(event) }));
  }

  protected async uploadImages(finding: VisitFinding, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) return;
    if (finding.title.trim() === '') {
      this.error.set('Add a finding title before attaching images.');
      return;
    }
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      this.error.set('Choose JPEG, PNG or WebP images.');
      return;
    }
    if (finding.photoMediaIds.length + files.length > 50) {
      this.error.set('A finding can have no more than 50 images.');
      return;
    }
    this.setMediaBusy(finding.clientFindingId, true);
    this.error.set('');
    this.success.set('');
    try {
      for (const file of files) {
        const image = await compressPhoto(file);
        const uploaded = await this.api.uploadVisitFindingImage(
          this.organisationId(),
          this.visitId(),
          finding.clientFindingId,
          image,
          crypto.randomUUID(),
          finding.title.trim(),
        );
        const next = this.findings().map((row) =>
          row.clientFindingId === finding.clientFindingId
            ? { ...row, photoMediaIds: [...row.photoMediaIds, uploaded.media.id] }
            : row,
        );
        if (!(await this.persist(next, 'Image attached.'))) {
          await this.api
            .deleteVisitFindingImage(
              this.organisationId(),
              this.visitId(),
              finding.clientFindingId,
              uploaded.media.id,
            )
            .catch(() => undefined);
          return;
        }
      }
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to attach the image.');
    } finally {
      this.setMediaBusy(finding.clientFindingId, false);
    }
  }

  protected async saveCaption(findingId: string, mediaId: string): Promise<void> {
    const caption = this.captionDrafts()[mediaId]?.trim() ?? '';
    if (caption.length < 1 || caption.length > 500) {
      this.error.set('Image captions must be between 1 and 500 characters.');
      return;
    }
    this.setMediaBusy(mediaId, true);
    this.error.set('');
    try {
      const { media } = await this.api.updateVisitFindingImageCaption(
        this.organisationId(),
        this.visitId(),
        findingId,
        mediaId,
        caption,
      );
      this.media.update((items) => items.map((item) => (item.id === mediaId ? media : item)));
      this.captionDrafts.update((captions) => ({ ...captions, [mediaId]: caption }));
      this.success.set('Image caption saved.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save the image caption.');
    } finally {
      this.setMediaBusy(mediaId, false);
    }
  }

  protected async removeImage(findingId: string, mediaId: string): Promise<void> {
    if (!confirm('Remove this image? This cannot be undone.')) return;
    this.setMediaBusy(mediaId, true);
    this.error.set('');
    try {
      await this.api.deleteVisitFindingImage(
        this.organisationId(),
        this.visitId(),
        findingId,
        mediaId,
      );
      this.findings.update((rows) =>
        rows.map((finding) =>
          finding.clientFindingId === findingId
            ? { ...finding, photoMediaIds: finding.photoMediaIds.filter((id) => id !== mediaId) }
            : finding,
        ),
      );
      this.removeLocalMedia([mediaId]);
      this.success.set('Image removed.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to remove the image.');
    } finally {
      this.setMediaBusy(mediaId, false);
    }
  }

  private async load(visitId: string): Promise<void> {
    if (!visitId || visitId === this.loadedVisitId) return;
    this.loadedVisitId = visitId;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.api.listVisitFindings(this.organisationId(), visitId);
      this.findings.set(result.findings);
      await this.loadMedia(result.media);
    } catch (error: unknown) {
      this.loadedVisitId = '';
      this.error.set(error instanceof Error ? error.message : 'Unable to load job findings.');
    } finally {
      this.loading.set(false);
    }
  }

  private update(id: string, patch: Partial<VisitFinding>): void {
    this.findings.update((rows) =>
      rows.map((finding) => (finding.clientFindingId === id ? { ...finding, ...patch } : finding)),
    );
    this.success.set('');
  }

  private async persist(
    findings: VisitFinding[],
    success: string,
    alreadySaving = false,
  ): Promise<boolean> {
    if (this.saving() && !alreadySaving) return false;
    const input: VisitFindingInput[] = findings.map((finding) => ({
      clientFindingId: finding.clientFindingId,
      category: finding.category,
      title: finding.title.trim(),
      ...(finding.description?.trim() ? { description: finding.description.trim() } : {}),
      severity: finding.severity,
      status: finding.status,
      photoMediaIds: finding.photoMediaIds,
    }));
    if (!alreadySaving) this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const result = await this.api.upsertVisitFindings(
        this.organisationId(),
        this.visitId(),
        input,
      );
      this.findings.set(result.findings);
      await this.loadMedia(result.media);
      if (success) this.success.set(success);
      return true;
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save job findings.');
      return false;
    } finally {
      if (!alreadySaving) this.saving.set(false);
    }
  }

  private async loadMedia(media: AssetMedia[]): Promise<void> {
    this.revokeImageUrls();
    this.media.set(media);
    this.captionDrafts.set(Object.fromEntries(media.map((item) => [item.id, item.caption ?? ''])));
    const urls = await Promise.all(
      media.map(async (item) => {
        try {
          const blob = await this.api.downloadMedia(this.organisationId(), item.id);
          return [item.id, URL.createObjectURL(blob)] as const;
        } catch {
          return undefined;
        }
      }),
    );
    this.imageUrls.set(Object.fromEntries(urls.filter((item) => item !== undefined)));
  }

  private removeLocalMedia(mediaIds: string[]): void {
    const removed = new Set(mediaIds);
    const urls = { ...this.imageUrls() };
    const captions = { ...this.captionDrafts() };
    for (const mediaId of removed) {
      if (urls[mediaId]) URL.revokeObjectURL(urls[mediaId]);
      delete urls[mediaId];
      delete captions[mediaId];
    }
    this.imageUrls.set(urls);
    this.captionDrafts.set(captions);
    this.media.update((items) => items.filter(({ id }) => !removed.has(id)));
  }

  private revokeImageUrls(): void {
    for (const url of Object.values(this.imageUrls())) URL.revokeObjectURL(url);
    this.imageUrls.set({});
  }

  private setMediaBusy(id: string, busy: boolean): void {
    this.mediaBusy.update((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private controlValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }
}
