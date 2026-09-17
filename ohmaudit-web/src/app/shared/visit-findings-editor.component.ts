import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import {
  ApiService,
  type VisitFinding,
  type VisitFindingCategory,
  type VisitFindingInput,
  type VisitFindingSeverity,
} from '../core/api.service';

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
          [disabled]="loading() || saving()"
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
              <button
                class="button danger compact"
                type="button"
                [disabled]="saving()"
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
            <button class="button primary" type="button" [disabled]="saving()" (click)="save()">
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
export class VisitFindingsEditorComponent {
  private readonly api = inject(ApiService);
  readonly organisationId = input.required<string>();
  readonly visitId = input.required<string>();
  protected readonly findings = signal<VisitFinding[]>([]);
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
    await this.persist(
      this.findings().filter(({ clientFindingId }) => clientFindingId !== id),
      'Job finding deleted.',
    );
  }

  protected async save(): Promise<void> {
    if (this.findings().some(({ title }) => title.trim() === '')) {
      this.error.set('Add a title to each job finding before saving.');
      return;
    }
    await this.persist(this.findings(), 'Job findings saved.');
  }

  private async load(visitId: string): Promise<void> {
    if (!visitId || visitId === this.loadedVisitId) return;
    this.loadedVisitId = visitId;
    this.loading.set(true);
    this.error.set('');
    try {
      const { findings } = await this.api.listVisitFindings(this.organisationId(), visitId);
      this.findings.set(findings);
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

  private async persist(findings: VisitFinding[], success: string): Promise<void> {
    if (this.saving()) return;
    const input: VisitFindingInput[] = findings.map((finding) => ({
      clientFindingId: finding.clientFindingId,
      category: finding.category,
      title: finding.title.trim(),
      ...(finding.description?.trim() ? { description: finding.description.trim() } : {}),
      severity: finding.severity,
      status: finding.status,
      photoMediaIds: finding.photoMediaIds,
    }));
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const result = await this.api.upsertVisitFindings(
        this.organisationId(),
        this.visitId(),
        input,
      );
      this.findings.set(result.findings);
      this.success.set(success);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save job findings.');
    } finally {
      this.saving.set(false);
    }
  }

  private controlValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }
}
