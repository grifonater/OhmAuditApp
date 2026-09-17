import { describe, expect, it } from 'vitest';
import { GenerationProgressService } from '../src/app/core/generation-progress.service';

describe('GenerationProgressService', () => {
  it('shows progress until an operation settles', async () => {
    const service = new GenerationProgressService();
    let resolve!: (value: string) => void;
    const pending = service.run(
      'Generating report',
      () => new Promise<string>((done) => (resolve = done)),
      'Building the PDF.',
    );

    expect(service.progress()).toEqual({
      title: 'Generating report',
      detail: 'Building the PDF.',
    });
    resolve('ready');
    await expect(pending).resolves.toBe('ready');
    expect(service.progress()).toBeNull();
  });

  it('keeps another concurrent operation visible', async () => {
    const service = new GenerationProgressService();
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const first = service.run(
      'First report',
      () => new Promise<void>((done) => (finishFirst = done)),
    );
    const second = service.run(
      'Second report',
      () => new Promise<void>((done) => (finishSecond = done)),
    );

    finishSecond();
    await second;
    expect(service.progress()?.title).toBe('First report');
    finishFirst();
    await first;
    expect(service.progress()).toBeNull();
  });
});
