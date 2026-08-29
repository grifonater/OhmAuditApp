import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { OfflineVisitService, type StoredVisitPack } from '../core/offline-visit.service';

@Component({
  selector: 'oa-offline-jobs',
  imports: [RouterLink],
  templateUrl: './offline-jobs.component.html',
  styleUrls: ['./operations.css', './offline-jobs.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineJobsComponent {
  private readonly router = inject(Router);
  protected readonly offline = inject(OfflineVisitService);
  protected readonly packs = signal<StoredVisitPack[]>([]);

  constructor() {
    void this.load();
  }

  protected jobLink(pack: StoredVisitPack): string[] {
    return pack.guestToken === undefined
      ? ['/app/org', pack.organisationId, 'visits', pack.visit.id]
      : ['/guest/job', pack.guestToken];
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  private async load(): Promise<void> {
    if (this.offline.online()) {
      await this.router.navigate(['/app']);
      return;
    }
    this.packs.set(await this.offline.allPacks());
  }
}
