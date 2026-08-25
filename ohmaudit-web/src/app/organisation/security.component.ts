import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'oa-security',
  imports: [ReactiveFormsModule],
  templateUrl: './security.component.html',
  styleUrl: './organisation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly enrolment = signal<{ id: string; qrCode: string; secret: string } | undefined>(
    undefined,
  );
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{6}$/u)],
  });
  protected readonly notificationForm = new FormGroup({
    inAppEnabled: new FormControl(true, { nonNullable: true }),
    emailEnabled: new FormControl(true, { nonNullable: true }),
    defaultLeadDays: new FormControl(30, { nonNullable: true, validators: [Validators.min(0)] }),
    overdueReminders: new FormControl(true, { nonNullable: true }),
    inspectionSubmitted: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    void this.loadNotificationPreferences();
  }

  protected get organisationId(): string {
    return this.route.snapshot.paramMap.get('organisationId') ?? '';
  }

  protected async startMfa(): Promise<void> {
    this.error.set('');
    try {
      this.enrolment.set(await this.auth.enrollMfa());
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to start MFA setup.');
    }
  }

  protected async verifyMfa(): Promise<void> {
    const enrolment = this.enrolment();
    if (enrolment === undefined || this.code.invalid) return;
    try {
      await this.auth.verifyMfa(enrolment.id, this.code.value);
      this.message.set('MFA is verified for this session.');
      this.enrolment.set(undefined);
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'The verification code was not accepted.',
      );
    }
  }

  protected async requireMfa(): Promise<void> {
    try {
      await this.api.setMfaPolicy(this.organisationId, true);
      this.message.set('Privileged roles now require MFA.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to change the MFA policy.');
    }
  }

  protected async saveNotificationPreferences(): Promise<void> {
    if (this.notificationForm.invalid) return;
    try {
      await this.api.updateNotificationPreferences(
        this.organisationId,
        this.notificationForm.getRawValue(),
      );
      this.message.set('Notification preferences saved.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save preferences.');
    }
  }

  private async loadNotificationPreferences(): Promise<void> {
    try {
      this.notificationForm.setValue(
        (await this.api.notificationPreferences(this.organisationId)).preferences,
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load preferences.');
    }
  }
}
