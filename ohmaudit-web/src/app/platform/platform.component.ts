import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ApiService,
  type EvStockImage,
  type PlatformEntitlementStatus,
  type PlatformOrganisationDetail,
  type PlatformOrganisationSummary,
  type PlatformUser,
} from '../core/api.service';
import { compressPhoto } from '../core/image-compression';
import { EvTestInstructionsComponent } from './ev-test-instructions.component';

@Component({
  selector: 'oa-platform',
  imports: [ReactiveFormsModule, EvTestInstructionsComponent],
  templateUrl: './platform.component.html',
  styleUrl: './platform.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformComponent {
  private readonly api = inject(ApiService);

  protected readonly role = signal<'USER' | 'PLATFORM_ADMIN'>('USER');
  protected readonly bootstrapAvailable = signal(false);
  protected readonly activeTab = signal<'organisations' | 'catalogue' | 'users' | 'instructions'>(
    'organisations',
  );
  protected readonly users = signal<PlatformUser[]>([]);
  protected readonly organisations = signal<PlatformOrganisationSummary[]>([]);
  protected readonly selectedOrganisation = signal<PlatformOrganisationDetail | null>(null);
  protected readonly unmatched = signal<
    Array<{ manufacturer: string; model: string; count: number }>
  >([]);
  protected readonly stocked = signal<EvStockImage[]>([]);
  protected readonly totalModels = signal(0);
  protected readonly imageCount = signal(0);
  protected readonly organisationId = signal('');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly uploadModels = signal<string[]>([]);
  protected readonly aliasModels = signal<string[]>([]);
  protected readonly selectedImageId = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');

  protected readonly bootstrapToken = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly userSearch = new FormControl('', { nonNullable: true });
  protected readonly organisationSearch = new FormControl('', { nonNullable: true });
  protected readonly supportReason = new FormControl('Customer support investigation', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(5)],
  });
  protected readonly uploadModelInput = new FormControl('', { nonNullable: true });
  protected readonly aliasModelInput = new FormControl('', { nonNullable: true });
  protected readonly uploadForm = new FormGroup({
    manufacturer: new FormControl('', { nonNullable: true, validators: Validators.required }),
  });
  protected readonly aliasForm = new FormGroup({
    manufacturer: new FormControl('', { nonNullable: true, validators: Validators.required }),
  });

  constructor() {
    void this.loadStatus();
  }

  protected setTab(tab: 'organisations' | 'catalogue' | 'users' | 'instructions'): void {
    this.activeTab.set(tab);
    if (tab === 'users' && this.users().length === 0) void this.loadUsers();
    if (tab === 'organisations' && this.organisations().length === 0) void this.loadOrganisations();
    if (tab === 'catalogue' && this.stocked().length === 0) void this.loadCatalogue();
  }

  protected async loadOrganisations(): Promise<void> {
    await this.run(async () => {
      this.organisations.set(
        (await this.api.listPlatformOrganisations(this.organisationSearch.value.trim()))
          .organisations,
      );
    });
  }

  protected async openOrganisation(organisationId: string): Promise<void> {
    await this.run(async () => {
      this.selectedOrganisation.set(
        (await this.api.platformOrganisation(organisationId)).organisation,
      );
    });
  }

  protected closeOrganisation(): void {
    this.selectedOrganisation.set(null);
  }

  protected moduleExpiry(module: PlatformOrganisationDetail['modules'][number]): string {
    const value =
      module.entitlement?.status === 'TRIAL'
        ? module.entitlement.trialEndsAt
        : module.entitlement?.currentPeriodEndsAt;
    return value ? value.slice(0, 10) : '';
  }

  protected async saveModule(moduleKey: string, statusValue: string, expiryValue: string) {
    const organisation = this.selectedOrganisation();
    if (organisation === null) return;
    const status = statusValue as PlatformEntitlementStatus;
    await this.run(async () => {
      await this.api.setPlatformOrganisationModule(
        organisation.id,
        moduleKey,
        status,
        expiryValue ? new Date(`${expiryValue}T23:59:59.999Z`).toISOString() : null,
      );
      this.success.set('Module access updated.');
      await this.openOrganisation(organisation.id);
      await this.loadOrganisations();
    });
  }

  protected async changeMemberRole(membershipId: string, roleId: string): Promise<void> {
    const organisation = this.selectedOrganisation();
    if (organisation === null) return;
    await this.run(async () => {
      await this.api.setPlatformOrganisationMember(organisation.id, membershipId, { roleId });
      this.success.set('Organisation role updated.');
      await this.openOrganisation(organisation.id);
    });
  }

  protected async toggleMember(
    membership: PlatformOrganisationDetail['memberships'][number],
  ): Promise<void> {
    const organisation = this.selectedOrganisation();
    if (organisation === null) return;
    const status = membership.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (
      !confirm(
        `${status === 'ACTIVE' ? 'Restore' : 'Suspend'} access for ${membership.user.email}?`,
      )
    )
      return;
    await this.run(async () => {
      await this.api.setPlatformOrganisationMember(organisation.id, membership.id, { status });
      this.success.set(
        status === 'ACTIVE' ? 'Member access restored.' : 'Member access suspended.',
      );
      await this.openOrganisation(organisation.id);
    });
  }

  protected async sendPasswordReset(userId: string, email: string): Promise<void> {
    const organisation = this.selectedOrganisation();
    if (organisation === null || !confirm(`Send a secure password reset email to ${email}?`))
      return;
    await this.run(async () => {
      await this.api.requestPlatformPasswordReset(organisation.id, userId);
      this.success.set(`Password reset email sent to ${email}.`);
    });
  }

  protected async startSupport(userId: string, email: string): Promise<void> {
    const organisation = this.selectedOrganisation();
    if (organisation === null || this.supportReason.invalid) return;
    if (!confirm(`Open ${organisation.name} as ${email} for up to 30 minutes?`)) return;
    await this.run(async () => {
      const result = await this.api.startPlatformSupportSession(
        organisation.id,
        userId,
        this.supportReason.value,
      );
      sessionStorage.setItem('ohmaudit.supportSession', result.supportSession.token);
      location.assign(`/app/org/${organisation.id}`);
    });
  }

  protected async claimSuperadmin(): Promise<void> {
    if (this.bootstrapToken.invalid) return;
    await this.run(async () => {
      await this.api.bootstrapSuperadmin(this.bootstrapToken.value);
      this.role.set('PLATFORM_ADMIN');
      this.bootstrapAvailable.set(false);
      this.success.set('You are now a superadmin.');
      await this.loadCatalogue();
    });
  }

  protected async loadUsers(): Promise<void> {
    await this.run(async () => {
      this.users.set((await this.api.listPlatformUsers(this.userSearch.value.trim())).users);
    });
  }

  protected async toggleUser(user: PlatformUser): Promise<void> {
    const next = user.platformRole === 'PLATFORM_ADMIN' ? 'USER' : 'PLATFORM_ADMIN';
    const verb = next === 'PLATFORM_ADMIN' ? 'promote' : 'remove superadmin access from';
    if (!confirm(`Are you sure you want to ${verb} ${user.email}?`)) return;
    await this.run(async () => {
      await this.api.setPlatformRole(user.id, next);
      this.success.set(
        next === 'PLATFORM_ADMIN' ? 'Superadmin added.' : 'Superadmin access removed.',
      );
      await this.loadUsers();
    });
  }

  protected async loadCatalogue(): Promise<void> {
    await this.run(async () => {
      const result = await this.api.evStockCatalogue(this.search.value.trim(), 20);
      this.unmatched.set(result.unmatched);
      this.stocked.set(result.stocked);
      this.totalModels.set(result.totalMatchedModels);
      this.imageCount.set(result.availableImageCount);
    });
  }

  protected selectSuggestion(item: { manufacturer: string; model: string }): void {
    this.uploadForm.setValue({ manufacturer: item.manufacturer });
    this.uploadModels.set([item.model]);
    document
      .getElementById('stock-upload')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  protected chooseFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    const validationError = this.validateImage(file);
    if (validationError !== '') {
      this.error.set(validationError);
      this.selectedFile.set(null);
      return;
    }
    this.selectedFile.set(file);
  }

  protected async upload(): Promise<void> {
    const file = this.selectedFile();
    if (
      this.uploadForm.invalid ||
      this.uploadModels().length === 0 ||
      file === null ||
      this.organisationId() === ''
    )
      return;
    const value = this.uploadForm.getRawValue();
    const models = this.uploadModels();
    const compressed = await compressPhoto(file);
    await this.run(async () => {
      const result = await this.api.registerEvStockImage(
        this.organisationId(),
        value.manufacturer,
        models,
        compressed,
      );
      await this.api.uploadEvStockImage(result.media.id, compressed);
      this.uploadForm.reset({ manufacturer: '' });
      this.uploadModels.set([]);
      this.uploadModelInput.setValue('');
      this.selectedFile.set(null);
      this.success.set(
        `Stock image added for ${models.length} model${models.length === 1 ? '' : 's'}.`,
      );
      await this.loadCatalogue();
    });
  }

  protected prepareAlias(image: EvStockImage): void {
    this.selectedImageId.set(image.mediaId);
    this.aliasForm.setValue({
      manufacturer: image.models[0]?.manufacturer ?? '',
    });
    this.aliasModels.set([]);
    this.aliasModelInput.setValue('');
  }

  protected async addAliases(): Promise<void> {
    this.commitModelInput('alias');
    if (this.aliasForm.invalid || this.aliasModels().length === 0 || this.selectedImageId() === '')
      return;
    const value = this.aliasForm.getRawValue();
    await this.run(async () => {
      await this.api.addEvStockModels(
        this.selectedImageId(),
        value.manufacturer,
        this.aliasModels(),
      );
      this.selectedImageId.set('');
      this.aliasModels.set([]);
      this.success.set('The existing image was linked to the additional model numbers.');
      await this.loadCatalogue();
    });
  }

  protected cancelAlias(): void {
    this.selectedImageId.set('');
    this.aliasModels.set([]);
    this.aliasModelInput.setValue('');
  }

  protected modelKeydown(event: KeyboardEvent, target: 'upload' | 'alias'): void {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    this.commitModelInput(target);
  }

  protected modelPaste(event: ClipboardEvent, target: 'upload' | 'alias'): void {
    const pasted = event.clipboardData?.getData('text') ?? '';
    if (!/[,;\n]/u.test(pasted)) return;
    event.preventDefault();
    this.addModels(target, this.parseModels(pasted));
  }

  protected commitModelInput(target: 'upload' | 'alias'): void {
    const control = target === 'upload' ? this.uploadModelInput : this.aliasModelInput;
    this.addModels(target, this.parseModels(control.value));
    control.setValue('');
  }

  protected removeModel(target: 'upload' | 'alias', index: number): void {
    const models = target === 'upload' ? this.uploadModels : this.aliasModels;
    models.update((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  protected stockImageUrl(image: EvStockImage): string {
    return this.api.evStockImageUrl(image.mediaId, image.createdAt);
  }

  protected async replaceImage(image: EvStockImage, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    const validationError = this.validateImage(file);
    if (validationError !== '') {
      this.error.set(validationError);
      return;
    }
    if (file === null) return;
    const modelNames = image.models.map(({ model }) => model).join(', ');
    if (
      !confirm(
        'Replace the image used by ' + image.models.length + ' model(s): ' + modelNames + '?',
      )
    )
      return;
    const compressed = await compressPhoto(file);
    await this.run(async () => {
      await this.api.uploadEvStockImage(image.mediaId, compressed);
      this.success.set(
        'Image replaced for all ' +
          image.models.length +
          ' linked model' +
          (image.models.length === 1 ? '' : 's') +
          '.',
      );
      await this.loadCatalogue();
    });
  }

  protected async unlinkModel(model: EvStockImage['models'][number]): Promise<void> {
    if (!confirm(`Stop using this image for ${model.manufacturer} ${model.model}?`)) return;
    await this.run(async () => {
      await this.api.unlinkEvStockModel(model.id);
      this.success.set('Model unlinked. It is available in the priority list again.');
      await this.loadCatalogue();
    });
  }

  protected async deleteImage(image: EvStockImage): Promise<void> {
    if (!confirm(`Delete this stock image and unlink all ${image.models.length} model entries?`))
      return;
    await this.run(async () => {
      await this.api.deleteEvStockImage(image.mediaId);
      this.success.set('Stock image deleted.');
      await this.loadCatalogue();
    });
  }

  private async loadStatus(): Promise<void> {
    await this.run(async () => {
      const [status, account] = await Promise.all([
        this.api.platformStatus(),
        this.api.currentUser(),
      ]);
      this.role.set(status.status.platformRole);
      this.bootstrapAvailable.set(status.status.bootstrapAvailable);
      if (status.status.bootstrapToken !== undefined)
        this.bootstrapToken.setValue(status.status.bootstrapToken);
      this.organisationId.set(account.memberships[0]?.organisation.id ?? '');
      if (status.status.platformRole === 'PLATFORM_ADMIN') await this.loadOrganisations();
    });
  }

  private parseModels(value: string): string[] {
    return [
      ...new Set(
        value
          .split(/[\n,;]/u)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }

  private addModels(target: 'upload' | 'alias', additions: string[]): void {
    const models = target === 'upload' ? this.uploadModels : this.aliasModels;
    models.update((current) => {
      const unique = new Map(current.map((model) => [model.toLocaleLowerCase('en-GB'), model]));
      for (const model of additions) unique.set(model.toLocaleLowerCase('en-GB'), model);
      return [...unique.values()];
    });
  }

  private validateImage(file: File | null): string {
    if (file === null) return '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return 'Use a JPEG, PNG, or WebP image.';
    if (file.size > 2_000_000) return 'The image must be smaller than 2 MB.';
    return '';
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The platform action failed.');
    } finally {
      this.busy.set(false);
    }
  }
}
