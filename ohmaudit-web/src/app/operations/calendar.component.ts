import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected readonly occurrences = signal<ScheduleOccurrence[]>([]);
  protected readonly sites = signal<SiteSummary[]>([]);
  protected readonly entitlements = signal<Entitlement[]>([]);
  protected readonly activeModules = computed(() =>
    this.entitlements().filter((item) => item.entitled),
  );
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showCreate = signal(false);
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
      await this.api.createSchedule(this.organisationId, this.scheduleForm.getRawValue());
      this.showCreate.set(false);
      await this.loadCalendar();
    });
  }
  private async initialise(): Promise<void> {
    await this.run(async () => {
      const [sites, entitlements] = await Promise.all([
        this.api.listSites(this.organisationId),
        this.api.entitlements(this.organisationId),
      ]);
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
