import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'oa-signup',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './auth.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly error = signal('');
  protected readonly sent = signal(false);
  protected readonly busy = signal(false);
  protected readonly form = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(10)],
    }),
  });
  protected async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const invitation = this.route.snapshot.queryParamMap.get('invitation');
      if (invitation !== null) localStorage.setItem('ohmaudit.pendingInvitation', invitation);
      const active = await this.auth.signUp(
        this.form.controls.email.value,
        this.form.controls.password.value,
        this.form.controls.displayName.value,
      );
      if (active) await this.router.navigateByUrl('/app');
      else this.sent.set(true);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to create your account.');
    } finally {
      this.busy.set(false);
    }
  }
}
