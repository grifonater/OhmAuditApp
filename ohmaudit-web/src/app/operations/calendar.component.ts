import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  ApiService,
  type Entitlement,
  type ScheduleOccurrence,
  type SiteSummary,
} from '../core/api.service';

@Component({
  selector: 'oa-calendar',
  imports: [ReactiveFormsModule],
  templateUrl: './calendar.component.html',
  styleUrl: './operations.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly capabilities = signal<string[]>([]);
  protected readonly canManageSchedules = computed(() =>
    this.capabilities().includes('sites.manage'),
  );
  protected readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected readonly occurrences = signal<ScheduleOccurrence[]>([]);
  protected readonly sites = signal<SiteSummary[]>([]);
  protected readonly siteAssets = signal<Array<{ id: string; displayName: string }>>([]);
  protected readonly entitlements = signal<Entitlement[]>([]);
  protected readonly activeModules = computed(() =>
    this.entitlements().filter((item) => item.entitled),
  );
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showCreate = signal(false);
  protected readonly selectedOccurrence = signal<ScheduleOccurrence | undefined>(undefined);
  protected readonly agenda = computed(() =>
    [...this.occurrences()].sort((left, right) => left.dueDate.localeCompare(right.dueDate)),
  );
  protected readonly days = computed(() => {
    const month = this.month();
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const first = new Date(start);
    first.setDate(1 - ((start.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(first);
      date.setDate(first.getDate() + index);
      const key = this.dateKey(date);
      return {
        date,
        key,
        current: date.getMonth() === month.getMonth(),
        occurrences: this.occurrences().filter((item) => item.dueDate.slice(0, 10) === key),
      };
    });
  });
  protected readonly scheduleForm = new FormGroup({
    siteId: new FormControl('', { nonNullable: true, validators: Validators.required }),
    assetId: new FormControl('', { nonNullable: true }),
    title: new FormControl('Annual inspection', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    moduleKey: new FormControl('ev-charging', {
      nonNullable: true,
      validators: Validators.required,
    }),
    frequencyMonths: new FormControl(12, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    startDate: new FormControl(this.dateKey(new Date()), {
      nonNullable: true,
      validators: Validators.required,
    }),
    notificationLeadDays: new FormControl(30, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
  });
  constructor() {
    this.scheduleForm.controls.siteId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((siteId) => void this.loadSiteAssets(siteId));
    void this.initialise();
  }
  protected monthLabel(): string {
    return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
      this.month(),
    );
  }
  protected moveMonth(offset: number): void {
    const value = this.month();
    this.month.set(new Date(value.getFullYear(), value.getMonth() + offset, 1));
    void this.loadCalendar();
  }
  protected async createSchedule(): Promise<void> {
    if (this.scheduleForm.invalid) return;
    await this.run(async () => {
      const { assetId, ...input } = this.scheduleForm.getRawValue();
      await this.api.createSchedule(this.organisationId, {
        ...input,
        ...(assetId === '' ? {} : { assetId }),
      });
      this.showCreate.set(false);
      await this.loadCalendar();
    });
  }
  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }
  protected statusLabel(status: string): string {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }
  private async initialise(): Promise<void> {
    await this.run(async () => {
      const [account, sites, entitlements] = await Promise.all([
        this.api.currentUser(),
        this.api.listSites(this.organisationId),
        this.api.entitlements(this.organisationId),
      ]);
      const membership = account.memberships.find(
        (item) => item.organisation.id === this.organisationId,
      );
      this.capabilities.set(membership?.role.capabilities ?? []);
      this.sites.set(sites.sites);
      this.entitlements.set(entitlements.entitlements);
      if (
        !this.activeModules().some(
          (item) => item.module.key === this.scheduleForm.controls.moduleKey.value,
        )
      )
        this.scheduleForm.controls.moduleKey.setValue('core');
      await this.loadCalendar();
    });
  }
  private async loadCalendar(): Promise<void> {
    const month = this.month();
    const from = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 2, 0).toISOString();
    this.occurrences.set((await this.api.calendar(this.organisationId, from, to)).occurrences);
  }
  private async loadSiteAssets(siteId: string): Promise<void> {
    this.scheduleForm.controls.assetId.setValue('', { emitEvent: false });
    if (!siteId) {
      this.siteAssets.set([]);
      return;
    }
    try {
      const result = await this.api.getSite(this.organisationId, siteId);
      this.siteAssets.set(
        result.site.assets
          .filter((asset) => asset.status !== 'REMOVED')
          .map(({ id, displayName }) => ({ id, displayName })),
      );
    } catch {
      this.siteAssets.set([]);
    }
  }
  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load the schedule.');
    } finally {
      this.busy.set(false);
    }
  }
}
