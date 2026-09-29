import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  inject,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'oa-image-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="backdrop" (click)="closeFromBackdrop($event)">
      <div
        class="viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-viewer-title"
        [attr.aria-describedby]="caption() ? 'image-viewer-caption' : null"
      >
        <header>
          <h2 id="image-viewer-title">Image preview</h2>
          <button type="button" aria-label="Close image preview" (click)="closed.emit()">
            Close
          </button>
        </header>
        @if (safeSrc(); as imageSrc) {
          <img [src]="imageSrc" [alt]="caption() || 'Inspection evidence'" />
        }
        @if (caption()) {
          <p id="image-viewer-caption">{{ caption() }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 200;
    }
    .backdrop {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      padding: clamp(0.75rem, 3vw, 2rem);
      background: rgb(5 19 25 / 88%);
    }
    .viewer {
      width: min(100%, 90rem);
      max-height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      overflow: hidden;
      border-radius: 0.8rem;
      background: #101c21;
      box-shadow: 0 1.5rem 5rem rgb(0 0 0 / 45%);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.7rem 0.8rem;
      color: white;
    }
    h2 {
      margin: 0;
      font-size: 0.9rem;
    }
    button {
      min-height: 2.4rem;
      padding: 0.45rem 0.8rem;
      border: 1px solid rgb(255 255 255 / 35%);
      border-radius: 0.5rem;
      color: white;
      background: rgb(255 255 255 / 10%);
      font: inherit;
      font-weight: 750;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 3px solid #63d2c0;
      outline-offset: 2px;
    }
    img {
      min-height: 0;
      max-width: 100%;
      max-height: calc(100vh - 9rem);
      display: block;
      justify-self: center;
      object-fit: contain;
    }
    p {
      margin: 0;
      padding: 0.75rem 1rem;
      color: #e4ecef;
      background: #17272e;
      font-size: 0.82rem;
    }
  `,
})
export class ImageViewerComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  readonly src = input.required<string>();
  readonly caption = input<string | null>();
  readonly closed = output<void>();
  protected readonly safeSrc = computed(() => this.safeImageSource(this.src()));

  constructor() {
    inject(DestroyRef).onDestroy(() => queueMicrotask(() => this.trigger?.focus()));
    afterNextRender(() => this.element.nativeElement.querySelector('button')?.focus());
  }

  protected closeFromBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = this.element.nativeElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private safeImageSource(value: string): string | null {
    if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return value;
    if (/^data:image\/(?:gif|jpe?g|png|webp);base64,/iu.test(value)) return value;
    try {
      const url = new URL(value);
      return ['blob:', 'http:', 'https:'].includes(url.protocol) ? value : null;
    } catch {
      return null;
    }
  }
}
