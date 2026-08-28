import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value as string | undefined;
  const confirmation = control.get('confirmation')?.value as string | undefined;
  return password === confirmation ? null : { passwordsDoNotMatch: true };
}

@Component({
  selector: 'oa-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './auth.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent {
  private readonly auth = inject(AuthService);
  protected readonly error = signal('');
  protected readonly complete = signal(false);
  protected readonly busy = signal(false);
  protected readonly hasRecoverySession = this.auth.signedIn;
  protected readonly form = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(10)],
      }),
      confirmation: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordsMatch },
  );

  protected async submit(): Promise<void> {
    if (this.form.invalid || !this.hasRecoverySession()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.updatePassword(this.form.controls.password.value);
      await this.auth.signOut();
      this.complete.set(true);
      this.form.reset();
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Your password could not be updated.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
