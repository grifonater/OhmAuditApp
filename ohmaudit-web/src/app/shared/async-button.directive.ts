import { Directive, DestroyRef, HostListener, effect, inject, input, signal } from '@angular/core';
import { asyncButtonResultState } from './async-button-state';

type AsyncButtonState = 'idle' | 'loading' | 'success' | 'error';

@Directive({
  selector: 'button[oaAsyncButton]',
  standalone: true,
  host: {
    class: 'oa-async-button',
    '[class.oa-async-loading]': "state() === 'loading'",
    '[class.oa-async-success]': "state() === 'success'",
    '[class.oa-async-error]': "state() === 'error'",
    '[attr.aria-busy]': "state() === 'loading' ? 'true' : null",
  },
})
export class AsyncButtonDirective {
  readonly oaAsyncPending = input(false);
  readonly oaAsyncError = input('');
  protected readonly state = signal<AsyncButtonState>('idle');

  private readonly destroyRef = inject(DestroyRef);
  private armed = false;
  private wasPending = false;
  private armTimer: ReturnType<typeof setTimeout> | undefined;
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const pending = this.oaAsyncPending();
      const error = this.oaAsyncError();
      if (!this.armed) return;
      if (pending) {
        if (this.armTimer !== undefined) clearTimeout(this.armTimer);
        this.armTimer = undefined;
        this.wasPending = true;
        this.setState('loading');
        return;
      }
      if (!this.wasPending) return;
      this.wasPending = false;
      this.setState(asyncButtonResultState(error));
      this.resetTimer = setTimeout(() => {
        this.armed = false;
        this.state.set('idle');
      }, 1400);
    });
    this.destroyRef.onDestroy(() => {
      if (this.armTimer !== undefined) clearTimeout(this.armTimer);
      if (this.resetTimer !== undefined) clearTimeout(this.resetTimer);
    });
  }

  @HostListener('click')
  protected arm(): void {
    this.armed = true;
    this.wasPending = false;
    this.setState('idle');
    if (this.armTimer !== undefined) clearTimeout(this.armTimer);
    this.armTimer = setTimeout(() => {
      if (this.wasPending) return;
      this.armed = false;
      this.state.set('idle');
    }, 750);
  }

  private setState(state: AsyncButtonState): void {
    if (this.resetTimer !== undefined) clearTimeout(this.resetTimer);
    this.resetTimer = undefined;
    this.state.set(state);
  }
}
