import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ApiService,
  type PlatformEmail,
  type PlatformEmailDetail,
  type PlatformEmailPagination,
} from '../core/api.service';

const EMPTY_PAGINATION: PlatformEmailPagination = {
  page: 1,
  pageSize: 20,
  total: 0,
  pageCount: 0,
};

@Component({
  selector: 'oa-platform-emails',
  imports: [ReactiveFormsModule],
  templateUrl: './platform-emails.component.html',
  styleUrl: './platform-emails.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformEmailsComponent {
  private readonly api = inject(ApiService);
  private listRequest = 0;
  private detailRequest = 0;
  private modalTrigger: HTMLElement | null = null;

  protected readonly emails = signal<PlatformEmail[]>([]);
  protected readonly pagination = signal<PlatformEmailPagination>(EMPTY_PAGINATION);
  protected readonly selectedId = signal('');
  protected readonly detail = signal<PlatformEmailDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly detailLoading = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal('');
  protected readonly detailError = signal('');
  protected readonly success = signal('');
  protected readonly modalOpen = signal(false);
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly status = new FormControl('', { nonNullable: true });
  protected readonly pageSize = new FormControl(20, { nonNullable: true });
  protected readonly testEmailForm = new FormGroup({
    to: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    subject: new FormControl('OhmAudit email test', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/u)],
    }),
    html: new FormControl(
      '<h1>Email delivery test</h1><p>This message confirms that OhmAudit email delivery is working.</p>',
      { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/u)] },
    ),
    text: new FormControl(
      'Email delivery test\n\nThis message confirms that OhmAudit email delivery is working.',
      { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/u)] },
    ),
  });
  protected readonly previewHtml = toSignal(this.testEmailForm.controls.html.valueChanges, {
    initialValue: this.testEmailForm.controls.html.value,
  });
  protected readonly pageStart = computed(() => {
    const pagination = this.pagination();
    return pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  });
  protected readonly pageEnd = computed(() => {
    const pagination = this.pagination();
    return Math.min(pagination.page * pagination.pageSize, pagination.total);
  });

  constructor() {
    void this.loadEmails(1);
  }

  protected async applyFilters(): Promise<void> {
    await this.loadEmails(1);
  }

  protected async changeStatus(): Promise<void> {
    await this.loadEmails(1);
  }

  protected async changePageSize(): Promise<void> {
    await this.loadEmails(1);
  }

  protected async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.pagination().pageCount || page === this.pagination().page) return;
    await this.loadEmails(page);
  }

  protected async selectEmail(email: PlatformEmail): Promise<void> {
    if (this.selectedId() === email.id && this.detail() !== null) return;
    const request = ++this.detailRequest;
    this.selectedId.set(email.id);
    this.detail.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);
    try {
      const result = await this.api.platformEmail(email.id);
      if (request === this.detailRequest) this.detail.set(result);
    } catch (error: unknown) {
      if (request === this.detailRequest) {
        this.detailError.set(
          error instanceof Error ? error.message : 'The email details could not be loaded.',
        );
      }
    } finally {
      if (request === this.detailRequest) this.detailLoading.set(false);
    }
  }

  protected closeDetail(): void {
    this.detailRequest += 1;
    this.selectedId.set('');
    this.detail.set(null);
    this.detailError.set('');
    this.detailLoading.set(false);
  }

  protected openTestEmail(): void {
    this.success.set('');
    this.modalTrigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.modalOpen.set(true);
    queueMicrotask(() => document.getElementById('test-email-to')?.focus());
  }

  protected closeTestEmail(): void {
    if (this.sending()) return;
    this.modalOpen.set(false);
    const trigger = this.modalTrigger;
    this.modalTrigger = null;
    queueMicrotask(() => trigger?.focus());
  }

  protected async sendTestEmail(): Promise<void> {
    if (this.testEmailForm.invalid) {
      this.testEmailForm.markAllAsTouched();
      return;
    }
    this.sending.set(true);
    this.error.set('');
    try {
      const result = await this.api.sendPlatformTestEmail(this.testEmailForm.getRawValue());
      this.modalOpen.set(false);
      this.success.set(`Test email queued for ${this.recipient(result.email)}.`);
      await this.loadEmails(1);
      await this.selectEmail(result.email);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The test email could not be sent.');
    } finally {
      this.sending.set(false);
    }
  }

  protected recipient(email: PlatformEmail): string {
    if (email.toAddresses?.length) return email.toAddresses.join(', ');
    if (Array.isArray(email.to)) return email.to.join(', ');
    return email.to ?? email.recipient ?? email.recipients?.join(', ') ?? 'Unknown recipient';
  }

  protected sender(email: PlatformEmail): string {
    if (email.fromAddress) {
      return email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
    }
    return email.from ?? email.sender ?? 'Ohm Audit';
  }

  protected emailDate(email: PlatformEmail): string | null {
    return email.datetime ?? email.createdAt ?? email.sentAt ?? email.updatedAt ?? null;
  }

  protected formatDate(value: string | null | undefined): string {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  protected statusLabel(status: string): string {
    return status
      .replace(/([a-z])([A-Z])/gu, '$1 $2')
      .replace(/[_-]+/gu, ' ')
      .trim()
      .replace(/^./u, (letter) => letter.toUpperCase());
  }

  protected statusTone(status: string): string {
    const normalised = status.toLowerCase().replace(/[_ -]/gu, '');
    if (normalised === 'delivered') return 'delivered';
    if (normalised === 'sent' || normalised === 'queued' || normalised === 'pending') return 'sent';
    if (normalised === 'rejected' || normalised.includes('failed') || normalised === 'bounced')
      return 'failed';
    return 'neutral';
  }

  protected closeFromBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeTestEmail();
  }

  @HostListener('document:keydown', ['$event'])
  protected handleDialogKey(event: KeyboardEvent): void {
    if (!this.modalOpen()) return;
    if (event.key === 'Escape') {
      this.closeTestEmail();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = document.querySelector<HTMLElement>('.test-modal');
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private async loadEmails(page: number): Promise<void> {
    const request = ++this.listRequest;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.api.listPlatformEmails({
        status: this.status.value,
        search: this.search.value.trim(),
        page,
        pageSize: this.pageSize.value,
      });
      if (request !== this.listRequest) return;
      this.emails.set(result.emails);
      this.pagination.set(result.pagination);
      if (
        this.selectedId() !== '' &&
        !result.emails.some((email) => email.id === this.selectedId())
      ) {
        this.closeDetail();
      }
    } catch (error: unknown) {
      if (request === this.listRequest) {
        this.emails.set([]);
        this.pagination.set({ ...EMPTY_PAGINATION, pageSize: this.pageSize.value });
        this.error.set(
          error instanceof Error ? error.message : 'Email activity could not be loaded.',
        );
      }
    } finally {
      if (request === this.listRequest) this.loading.set(false);
    }
  }
}
