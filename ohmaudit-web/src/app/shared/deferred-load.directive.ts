import { DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

@Directive({ selector: '[oaDeferredLoad]' })
export class DeferredLoadDirective {
  readonly oaDeferredLoad = output<void>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private observer?: IntersectionObserver;

  constructor() {
    if (typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => this.emit());
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.emit();
      },
      { rootMargin: '200px' },
    );
    this.observer.observe(this.element.nativeElement);
    this.destroyRef.onDestroy(() => this.observer?.disconnect());
  }

  private emit(): void {
    if (this.destroyRef.destroyed) return;
    this.observer?.disconnect();
    this.oaDeferredLoad.emit();
  }
}
