import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  ApiService,
  type ChargerDataPlateCandidate,
  type ChargerDataPlateDebug,
  type ChargerDataPlateField,
} from '../core/api.service';
import { compressImage } from '../core/image-compression';

@Component({
  selector: 'oa-feature-testing',
  templateUrl: './feature-testing.component.html',
  styleUrl: './feature-testing.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeatureTestingComponent {
  private readonly api = inject(ApiService);

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly previewUrl = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<ChargerDataPlateDebug | null>(null);

  protected onDataPlateFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    const validationError = this.validate(file);
    if (validationError !== '') {
      this.error.set(validationError);
      this.selectedFile.set(null);
      this.previewUrl.set('');
      return;
    }
    this.error.set('');
    this.result.set(null);
    this.selectedFile.set(file);
    this.revokePreview();
    this.previewUrl.set(file ? URL.createObjectURL(file) : '');
  }

  protected async analyse(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      this.error.set('Choose a data plate image to analyse.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.result.set(null);
    try {
      const image = await compressImage(file, { maxDimension: 3072, targetBytes: 1_000_000 });
      if (image.size > 2_000_000) throw new Error('The photo is too large. Try a closer crop.');
      this.result.set(await this.api.debugDataPlateExtraction(image));
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'The data plate could not be analysed.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected clear(): void {
    this.selectedFile.set(null);
    this.result.set(null);
    this.error.set('');
    this.revokePreview();
    this.previewUrl.set('');
  }

  protected fieldLabel(field: ChargerDataPlateField): string {
    return {
      manufacturer: 'Make',
      model: 'Model',
      serialNumber: 'Serial number',
      maximumPowerKw: 'Power output (kW)',
    }[field];
  }

  protected candidateSummary(candidate: ChargerDataPlateCandidate): string {
    return `${this.fieldLabel(candidate.field)}: ${candidate.value}`;
  }

  protected confidencePercent(confidence?: number): string {
    if (confidence === undefined) return 'n/a';
    return `${Math.round(confidence * 100)}%`;
  }

  protected rawLines(raw: string): string[] {
    return raw.split('\n');
  }

  private revokePreview(): void {
    const current = this.previewUrl();
    if (current) URL.revokeObjectURL(current);
  }

  private validate(file: File | null): string {
    if (file === null) return '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return 'Use a JPEG, PNG, or WebP image.';
    if (file.size > 2_000_000) return 'The image must be smaller than 2 MB.';
    return '';
  }
}
