import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ApiService,
  type EvTestCoverage,
  type EvTestInstructionDraft,
  type EvTestInstructionSet,
  type EvTestStep,
} from '../core/api.service';

const EV_STEP_LABELS: Record<EvTestStep, string> = {
  unit: 'Confirm the unit',
  supplies: 'Test each supply',
  connectors: 'Test each connector',
  condition: 'Were any faults found?',
  submit: 'Review & submit',
};

const EV_STEP_SHORT_LABELS: Record<EvTestStep, string> = {
  unit: 'Unit',
  supplies: 'Supplies',
  connectors: 'Connectors',
  condition: 'Faults',
  submit: 'Submit',
};

const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'image/gif'];
const MAX_VIDEO_BYTES = 50_000_000;

@Component({
  selector: 'oa-ev-test-instructions',
  imports: [ReactiveFormsModule],
  templateUrl: './ev-test-instructions.component.html',
  styleUrl: './ev-test-instructions.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvTestInstructionsComponent {
  private readonly api = inject(ApiService);

  protected readonly Math = Math;

  protected readonly steps = Object.keys(EV_STEP_LABELS) as EvTestStep[];

  protected readonly organisationId = signal('');
  protected readonly coverage = signal<EvTestCoverage | null>(null);
  protected readonly loading = signal(false);
  protected readonly sets = signal<EvTestInstructionSet[]>([]);
  protected readonly setsLoading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');

  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<EvTestInstructionSet | null>(null);
  protected readonly draftFile = signal<File | null>(null);
  protected readonly videoBusy = signal(false);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly draftForm = new FormGroup({
    step: new FormControl<EvTestStep>('unit', {
      nonNullable: true,
      validators: Validators.required,
    }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(160)],
    }),
    manufacturers: new FormControl('', { nonNullable: true }),
    steps: new FormControl('', { nonNullable: true, validators: Validators.required }),
    notes: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    void this.load();
    this.search.valueChanges.subscribe(() => void this.loadCoverage());
  }

  protected stepLabel(step: EvTestStep): string {
    return EV_STEP_LABELS[step];
  }

  protected stepShortLabel(step: EvTestStep): string {
    return EV_STEP_SHORT_LABELS[step];
  }

  protected currentlyEditingTitle(): string {
    return this.editing() === null ? 'New set' : this.editing()!.title;
  }

  protected isGenericDraft(): boolean {
    return this.draftForm.controls.manufacturers.value.trim() === '';
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const account = await this.api.currentUser();
      this.organisationId.set(account.memberships[0]?.organisation.id ?? '');
      await this.loadCoverage();
      await this.loadSets();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Unable to load the instruction sets.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadCoverage(): Promise<void> {
    this.coverage.set(await this.api.evTestInstructionCoverage(this.search.value.trim()));
  }

  protected async loadSets(): Promise<void> {
    this.setsLoading.set(true);
    try {
      this.sets.set((await this.api.evTestInstructionSets()).sets);
    } finally {
      this.setsLoading.set(false);
    }
  }

  protected startFor(manufacturer: string, step: EvTestStep): void {
    this.editing.set(null);
    this.editorOpen.set(true);
    this.error.set('');
    this.draftFile.set(null);
    this.draftForm.setValue({
      step,
      title: `${manufacturer} — ${EV_STEP_LABELS[step]}`,
      manufacturers: manufacturer,
      steps: '',
      notes: '',
    });
    void this.scrollToEditor();
  }

  protected openEditor(set: EvTestInstructionSet | null): void {
    this.editing.set(set);
    this.editorOpen.set(true);
    this.error.set('');
    this.draftFile.set(null);
    if (set === null) {
      this.draftForm.setValue({ step: 'unit', title: '', manufacturers: '', steps: '', notes: '' });
    } else {
      this.draftForm.setValue({
        step: set.step,
        title: set.title,
        manufacturers: set.manufacturers.join(', '),
        steps: set.steps.join('\n'),
        notes: set.notes ?? '',
      });
    }
    void this.scrollToEditor();
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
    this.editing.set(null);
    this.draftFile.set(null);
  }

  protected chooseVideo(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.draftFile.set(null);
    if (file === null) return;
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      this.error.set('Only MP4, WebM or GIF files are supported.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      this.error.set('Videos must be 50 MB or smaller.');
      return;
    }
    this.error.set('');
    this.draftFile.set(file);
  }

  protected draftFileLabel(): string {
    return this.draftFile()?.name ?? '';
  }

  protected async save(): Promise<void> {
    if (this.draftForm.invalid) return;
    const raw = this.draftForm.getRawValue();
    const input: EvTestInstructionDraft = {
      step: raw.step,
      title: raw.title.trim(),
      manufacturers: raw.manufacturers
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== ''),
      steps: raw.steps
        .split('\n')
        .map((item) => item.trim())
        .filter((item) => item !== ''),
      ...(raw.notes.trim() !== '' ? { notes: raw.notes.trim() } : {}),
    };
    if (input.steps.length === 0) {
      this.error.set('Provide at least one instruction on its own line.');
      return;
    }
    const existing = this.editing();
    await this.run(async () => {
      const result =
        existing === null
          ? await this.api.createEvTestInstruction(input)
          : await this.api.updateEvTestInstruction(existing.id, input);
      if (this.draftFile() !== null)
        await this.api.uploadEvTestInstructionVideo(
          this.organisationId(),
          result.id,
          this.draftFile()!,
        );
      this.success.set(existing === null ? 'Instruction set created.' : 'Instruction set updated.');
      this.closeEditor();
      await this.loadCoverage();
      await this.loadSets();
    });
  }

  protected async remove(set: EvTestInstructionSet): Promise<void> {
    if (!window.confirm(`Delete “${set.title}”? This cannot be undone.`)) return;
    await this.run(async () => {
      await this.api.deleteEvTestInstruction(set.id);
      if (this.editing()?.id === set.id) this.closeEditor();
      this.success.set('Instruction set deleted.');
      await this.loadCoverage();
      await this.loadSets();
    });
  }

  protected async removeVideo(): Promise<void> {
    const set = this.editing();
    if (set === null || set.video === null) return;
    this.videoBusy.set(true);
    this.error.set('');
    try {
      await this.api.deleteEvTestInstructionVideo(set.id);
      this.success.set('Video removed from this set.');
      await this.loadSets();
      this.editing.set(this.sets().find((item) => item.id === set.id) ?? null);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Unable to remove the video from this set.',
      );
    } finally {
      this.videoBusy.set(false);
    }
  }

  protected existingVideoUrl(): string {
    const video = this.editing()?.video;
    return video === null || video === undefined || video.status !== 'AVAILABLE'
      ? ''
      : this.api.evTestInstructionVideoUrl(video.mediaId);
  }

  private async scrollToEditor(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    document
      .getElementById('ev-instructions-editor')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Unable to save the instruction set.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
