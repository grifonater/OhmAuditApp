import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ApiService,
  type AssetSummary,
  type JobCategory,
  type VisitSummary,
} from '../core/api.service';

@Component({
  selector: 'oa-job-overview',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './job-overview.component.html',
  styleUrl: './job-overview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobOverviewComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly visitId = this.route.snapshot.paramMap.get('visitId') ?? '';
  protected readonly job = signal<VisitSummary | undefined>(undefined);
  protected readonly categories = signal<JobCategory[]>([]);
  protected readonly capabilities = signal<string[]>([]);
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly canEdit = computed(() => this.capabilities().includes('visits.create'));
  protected readonly canAssign = computed(() => this.capabilities().includes('visits.assign'));
  protected readonly linkedAssets = computed(() => {
    const assets = new Map<string, AssetSummary>();
    for (const task of this.job()?.tasks ?? []) {
      if (task.asset) assets.set(task.asset.id, task.asset);
    }
    return [...assets.values()];
  });
  protected readonly inspectionCount = computed(
    () => this.job()?.tasks.filter((task) => task.inspection !== undefined).length ?? 0,
  );
  protected readonly completedTaskCount = computed(
    () => this.job()?.tasks.filter((task) => task.status === 'COMPLETED').length ?? 0,
  );
  protected readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    reference: new FormControl('', { nonNullable: true }),
    externalReference: new FormControl('', { nonNullable: true }),
    jobCategoryId: new FormControl('', { nonNullable: true }),
    jobType: new FormControl('', { nonNullable: true }),
    scheduledStart: new FormControl('', { nonNullable: true, validators: Validators.required }),
    scheduledEnd: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    exclusions: new FormControl('', { nonNullable: true }),
    engineerNotes: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    void this.load();
  }

  protected startEditing(): void {
    const job = this.job();
    if (!job || !this.canEdit()) return;
    this.form.setValue({
      title: job.title,
      reference: job.reference ?? '',
      externalReference: job.externalReference ?? '',
      jobCategoryId: job.jobCategoryId ?? '',
      jobType: job.jobType ?? '',
      scheduledStart: this.localDateTime(job.scheduledStart),
      scheduledEnd: job.scheduledEnd ? this.localDateTime(job.scheduledEnd) : '',
      description: job.description ?? '',
      exclusions: job.exclusions ?? '',
      engineerNotes: job.engineerNotes ?? '',
    });
    this.editing.set(true);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || !this.canEdit()) return;
    const value = this.form.getRawValue();
    await this.run(async () => {
      await this.api.updateVisit(this.organisationId, this.visitId, {
        title: value.title,
        reference: value.reference || null,
        externalReference: value.externalReference || null,
        jobCategoryId: value.jobCategoryId || null,
        jobType: value.jobType || null,
        scheduledStart: new Date(value.scheduledStart).toISOString(),
        scheduledEnd: value.scheduledEnd ? new Date(value.scheduledEnd).toISOString() : null,
        description: value.description || null,
        exclusions: value.exclusions || null,
        engineerNotes: value.engineerNotes || null,
      });
      this.editing.set(false);
      await this.loadJob();
      this.notice.set('Job details updated.');
    });
  }

  protected async shareJob(): Promise<void> {
    if (!this.canAssign()) return;
    await this.run(async () => {
      const result = await this.api.createGuestLink(this.organisationId, this.visitId);
      const url = `${location.origin}${result.guestUrl}`;
      await navigator.clipboard.writeText(url);
      this.notice.set('Engineer Job link copied to the clipboard.');
    });
  }

  protected formatDate(value: string | undefined, includeTime = false): string {
    if (!value) return 'Not set';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(new Date(value));
  }

  protected statusLabel(status: string): string {
    return status
      .toLocaleLowerCase('en-GB')
      .replaceAll('_', ' ')
      .replace(/^./u, (value) => value.toLocaleUpperCase('en-GB'));
  }

  protected personName(person: { displayName?: string; email: string } | undefined): string {
    return person?.displayName || person?.email || 'Not recorded';
  }

  private async load(): Promise<void> {
    await this.run(async () => {
      const [account, categories] = await Promise.all([
        this.api.currentUser(),
        this.api.listJobCategories(this.organisationId),
      ]);
      this.capabilities.set(
        account.memberships.find((item) => item.organisation.id === this.organisationId)?.role
          .capabilities ?? [],
      );
      this.categories.set(categories.categories);
      await this.loadJob();
    });
  }

  private async loadJob(): Promise<void> {
    this.job.set((await this.api.getVisit(this.organisationId, this.visitId)).visit);
  }

  private localDateTime(value: string): string {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update the job.');
    } finally {
      this.busy.set(false);
    }
  }
}
