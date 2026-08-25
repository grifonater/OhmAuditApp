import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, type Entitlement, type OnboardingState } from '../core/api.service';

@Component({
  selector: 'oa-onboarding',
  imports: [ReactiveFormsModule],
  templateUrl: './onboarding.component.html',
  styleUrl: './organisation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly state = signal<OnboardingState | undefined>(undefined);
  protected readonly entitlements = signal<Entitlement[]>([]);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly logoUrl = signal('');
  protected readonly activeSection = signal<
    'details' | 'brand' | 'accreditations' | 'team' | 'modules'
  >('details');
  protected readonly profileForm = new FormGroup({
    tradingName: new FormControl('', { nonNullable: true, validators: Validators.required }),
    registeredName: new FormControl('', { nonNullable: true }),
    addressLine1: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
    postcode: new FormControl('', { nonNullable: true }),
    countryCode: new FormControl('GB', { nonNullable: true }),
    telephone: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: Validators.email }),
    website: new FormControl('', { nonNullable: true }),
    primaryColour: new FormControl('#006B66', { nonNullable: true }),
    secondaryColour: new FormControl('#243B53', { nonNullable: true }),
    timezone: new FormControl('Europe/London', { nonNullable: true }),
    dateFormat: new FormControl('DD/MM/YYYY', { nonNullable: true }),
    onboardingStep: new FormControl('accreditations', { nonNullable: true }),
  });
  protected readonly accreditationForm = new FormGroup({
    scheme: new FormControl('', { nonNullable: true, validators: Validators.required }),
    registrationNumber: new FormControl('', { nonNullable: true, validators: Validators.required }),
  });
  protected readonly invitationForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    roleKey: new FormControl('engineer', { nonNullable: true }),
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeLogo());
    void this.load();
  }

  protected async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) return;
    const saved = await this.run(
      async () => this.api.saveBrandProfile(this.organisationId, this.profileForm.getRawValue()),
      'Organisation details saved.',
    );
    if (saved) window.dispatchEvent(new Event('ohmaudit:account-changed'));
    if (saved && this.activeSection() === 'details') this.activeSection.set('brand');
  }
  protected async uploadLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return;
    this.error.set('');
    try {
      const logo = await this.logoAsJpeg(file);
      const result = await this.api.registerMedia(this.organisationId, {
        entityType: 'Organisation',
        entityId: this.organisationId,
        category: 'contractor-logo',
        originalFilename: file.name,
        mimeType: 'image/jpeg',
        size: logo.size,
      });
      await this.api.uploadMedia(this.organisationId, result.media.id, logo);
      await this.api.setBrandLogo(this.organisationId, result.media.id);
      this.message.set('Logo uploaded.');
      input.value = '';
      await this.load();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to upload the logo.');
    }
  }
  protected async addAccreditation(): Promise<void> {
    if (this.accreditationForm.invalid) return;
    await this.run(
      async () =>
        this.api.addAccreditation(this.organisationId, this.accreditationForm.getRawValue()),
      'Accreditation added.',
    );
  }
  protected async invite(): Promise<void> {
    if (this.invitationForm.invalid) return;
    this.error.set('');
    try {
      const result = await this.api.inviteMember(
        this.organisationId,
        this.invitationForm.getRawValue(),
      );
      this.message.set(`Invitation link: ${location.origin}${result.inviteUrl}`);
      await this.load();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to create the invitation.');
    }
  }
  private async run(operation: () => Promise<unknown>, message: string): Promise<boolean> {
    this.error.set('');
    try {
      await operation();
      this.message.set(message);
      await this.load();
      return true;
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save.');
      return false;
    }
  }
  private async load(): Promise<void> {
    try {
      const [state, entitlementResult] = await Promise.all([
        this.api.onboarding(this.organisationId),
        this.api.entitlements(this.organisationId),
      ]);
      this.state.set(state);
      this.entitlements.set(entitlementResult.entitlements);
      const profile = state.profile;
      if (profile !== undefined) {
        for (const key of Object.keys(this.profileForm.controls)) {
          const value = profile[key];
          if (typeof value === 'string') this.profileForm.get(key)?.patchValue(value);
        }
        await this.loadLogo(profile['logoMediaId']);
      }
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load onboarding.');
    }
  }

  private async loadLogo(mediaId: string | null | undefined): Promise<void> {
    this.revokeLogo();
    if (!mediaId) return;
    await this.api
      .downloadMedia(this.organisationId, mediaId)
      .then((blob) => this.logoUrl.set(URL.createObjectURL(blob)))
      .catch(() => undefined);
  }

  private revokeLogo(): void {
    const url = this.logoUrl();
    if (url) URL.revokeObjectURL(url);
    this.logoUrl.set('');
  }

  private async logoAsJpeg(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser cannot prepare the organisation logo.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error('The organisation logo could not be prepared.')),
          'image/jpeg',
          0.9,
        ),
      );
    } finally {
      bitmap.close();
    }
  }
}
