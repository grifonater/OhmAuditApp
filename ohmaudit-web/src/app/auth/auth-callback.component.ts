import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'oa-auth-callback',
  template: '<main class="callback-page" role="status">Completing secure sign-in…</main>',
  styles: `
    .callback-page {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      color: #405c6b;
      background: #f1f5f7;
      font-weight: 750;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.navigate();
  }

  private async navigate(): Promise<void> {
    await this.router.navigateByUrl(this.auth.recoveringPassword() ? '/reset-password' : '/app');
  }
}
