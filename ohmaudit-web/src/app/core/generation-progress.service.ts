import { Injectable, signal } from '@angular/core';

export interface GenerationProgress {
  title: string;
  detail: string;
}

@Injectable({ providedIn: 'root' })
export class GenerationProgressService {
  readonly progress = signal<GenerationProgress | null>(null);
  private nextOperation = 0;
  private readonly operations = new Map<number, GenerationProgress>();

  async run<T>(
    title: string,
    task: () => Promise<T>,
    detail = 'Preparing your document…',
  ): Promise<T> {
    const operation = ++this.nextOperation;
    const progress = { title, detail };
    this.operations.set(operation, progress);
    this.progress.set(progress);
    try {
      return await task();
    } finally {
      this.operations.delete(operation);
      this.progress.set([...this.operations.values()].at(-1) ?? null);
    }
  }
}
