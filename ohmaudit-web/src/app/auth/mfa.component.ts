import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'oa-mfa',
  imports: [ReactiveFormsModule],
  templateUrl: './mfa.component.html',
  styleUrl: './auth.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MfaComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{6}$/u)],
  });
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.code.invalid) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const factorId = await this.auth.verifiedTotpFactorId();
      await this.auth.verifyMfa(factorId, this.code.value);
      await this.router.navigateByUrl('/app');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to verify MFA.');
    } finally {
      this.busy.set(false);
    }
  }
}
