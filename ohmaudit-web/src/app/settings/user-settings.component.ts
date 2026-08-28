import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmation')?.value
    ? null
    : { passwordsDoNotMatch: true };
}

@Component({
  selector: 'oa-user-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './user-settings.component.html',
  styleUrl: './user-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSettingsComponent {
  private readonly auth = inject(AuthService);
  protected readonly loading = signal(true);
  protected readonly profileBusy = signal(false);
  protected readonly passwordBusy = signal(false);
  protected readonly profileMessage = signal('');
  protected readonly passwordMessage = signal('');
  protected readonly profileError = signal('');
  protected readonly passwordError = signal('');

  protected readonly profileForm = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    email: new FormControl({ value: '', disabled: true }, { nonNullable: true }),
    mobile: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(30), Validators.pattern(/^[+\d][\d\s().-]*$/u)],
    }),
  });

  protected readonly passwordForm = new FormGroup(
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

  constructor() {
    void this.loadProfile();
  }

  protected async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.profileBusy.set(true);
    this.profileMessage.set('');
    this.profileError.set('');
    try {
      const { displayName, mobile } = this.profileForm.getRawValue();
      await this.auth.updateProfile(displayName.trim(), mobile.trim());
      this.profileForm.controls.displayName.setValue(displayName.trim());
      this.profileForm.controls.mobile.setValue(mobile.trim());
      this.profileMessage.set('Your profile has been updated.');
      window.dispatchEvent(new Event('ohmaudit:account-changed'));
    } catch (error: unknown) {
      this.profileError.set(
        error instanceof Error ? error.message : 'Unable to update your profile.',
      );
    } finally {
      this.profileBusy.set(false);
    }
  }

  protected async changePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.passwordBusy.set(true);
    this.passwordMessage.set('');
    this.passwordError.set('');
    try {
      await this.auth.updatePassword(this.passwordForm.controls.password.value);
      this.passwordForm.reset();
      this.passwordMessage.set('Your password has been changed.');
    } catch (error: unknown) {
      this.passwordError.set(
        error instanceof Error ? error.message : 'Unable to change your password.',
      );
    } finally {
      this.passwordBusy.set(false);
    }
  }

  private async loadProfile(): Promise<void> {
    try {
      this.profileForm.setValue(await this.auth.userProfile());
    } catch (error: unknown) {
      this.profileError.set(
        error instanceof Error ? error.message : 'Unable to load your profile.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
