import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ApiService,
  type AssetSummary,
  type Entitlement,
  type OrganisationMember,
  type SiteSummary,
  type VisitSummary,
} from '../core/api.service';

@Component({
  selector: 'oa-visits',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './visits.component.html',
  styleUrls: ['./operations.css', './visits.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitsComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly visits = signal<VisitSummary[]>([]);
  protected readonly sites = signal<SiteSummary[]>([]);
  protected readonly assets = signal<AssetSummary[]>([]);
  protected readonly members = signal<OrganisationMember[]>([]);
  protected readonly entitlements = signal<Entitlement[]>([]);
  protected readonly showCreate = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly guestLink = signal('');
  protected readonly siteQuery = signal('');
  protected readonly assetQuery = signal('');
  protected readonly assetType = signal('ALL');
  protected readonly allowDiscovery = signal(true);
  protected readonly siteSearching = signal(false);
  protected readonly selectedAssetIds = signal<Set<string>>(new Set());
  protected readonly visitQuery = signal('');
  protected readonly visitStatus = signal('ALL');
  protected readonly visitDateField = signal<'scheduled' | 'completed'>('scheduled');
  protected readonly visitFrom = signal('');
  protected readonly visitTo = signal('');
  protected readonly visitSort = signal('scheduled-desc');
  protected readonly visitPageSize = signal(20);
  protected readonly visitPagination = signal({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  protected readonly listBusy = signal(false);
  private siteSearchTimer: ReturnType<typeof setTimeout> | undefined;
  private siteSearchRequest = 0;
  private visitSearchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly filteredSites = computed(() => {
    const query = this.siteQuery().trim().toLowerCase();
    return this.sites()
      .filter((site) =>
        !query
          ? true
          : [site.name, site.reference, site.postcode, site.customer?.name]
              .filter(Boolean)
              .some((value) => value?.toLowerCase().includes(query)),
      )
      .slice(0, query ? 30 : 12);
  });
  protected readonly selectedSite = signal<SiteSummary | undefined>(undefined);
  protected readonly assetTypes = computed(() =>
    [...new Set(this.assets().map(({ assetType }) => assetType))].sort(),
  );
  protected readonly filteredAssets = computed(() => {
    const query = this.assetQuery().trim().toLowerCase();
    const type = this.assetType();
    return this.assets().filter(
      (asset) =>
        (type === 'ALL' || asset.assetType === type) &&
        (!query ||
          [
            asset.displayName,
            asset.assetReference,
            asset.manufacturer,
            asset.model,
            asset.serialNumber,
          ]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(query))),
    );
  });
  protected readonly visitRange = computed(() => {
    const pagination = this.visitPagination();
    if (pagination.total === 0) return '0 visits';
    const first = (pagination.page - 1) * pagination.pageSize + 1;
    const last = Math.min(pagination.total, pagination.page * pagination.pageSize);
    return `${first}–${last} of ${pagination.total} visits`;
  });
  protected readonly visitFiltersActive = computed(
    () =>
      this.visitQuery().trim() !== '' ||
      this.visitStatus() !== 'ALL' ||
      this.visitFrom() !== '' ||
      this.visitTo() !== '',
  );
  protected readonly evEnabled = computed(
    () => this.entitlements().find((item) => item.module.key === 'ev-charging')?.entitled ?? false,
  );
  protected readonly thermalEnabled = computed(
    () =>
      this.entitlements().find((item) => item.module.key === 'thermal-imaging')?.entitled ?? false,
  );

  protected readonly form = new FormGroup({
    siteId: new FormControl('', { nonNullable: true, validators: Validators.required }),
    title: new FormControl('Planned inspection visit', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    scheduledStart: new FormControl(this.localDateTime(), {
      nonNullable: true,
      validators: Validators.required,
    }),
    assignedUserId: new FormControl('', { nonNullable: true }),
    guestEngineerName: new FormControl('', { nonNullable: true }),
    guestEmail: new FormControl('', { nonNullable: true }),
    engineerNotes: new FormControl('', { nonNullable: true }),
    moduleKey: new FormControl('ev-charging', { nonNullable: true }),
  });

  constructor() {
    void this.load();
  }

  protected async selectSite(site: SiteSummary): Promise<void> {
    this.form.controls.siteId.setValue(site.id);
    this.selectedSite.set(site);
    this.siteQuery.set('');
    this.selectedAssetIds.set(new Set());
    this.assetQuery.set('');
    this.assetType.set('ALL');
    await this.run(async () =>
      this.assets.set((await this.api.getSite(this.organisationId, site.id)).site.assets),
    );
  }

  protected searchSites(value: string): void {
    this.siteQuery.set(value);
    if (this.siteSearchTimer !== undefined) clearTimeout(this.siteSearchTimer);
    this.siteSearching.set(true);
    const request = ++this.siteSearchRequest;
    this.siteSearchTimer = setTimeout(() => {
      void this.api
        .listSites(this.organisationId, value.trim())
        .then((result) => {
          if (request === this.siteSearchRequest) this.sites.set(result.sites);
        })
        .catch((error: unknown) => {
          if (request === this.siteSearchRequest)
            this.error.set(error instanceof Error ? error.message : 'Unable to search sites.');
        })
        .finally(() => {
          if (request === this.siteSearchRequest) this.siteSearching.set(false);
        });
    }, 250);
  }

  protected clearSite(): void {
    this.form.controls.siteId.setValue('');
    this.selectedSite.set(undefined);
    this.assets.set([]);
    this.selectedAssetIds.set(new Set());
  }

  protected toggleAsset(id: string, selected: boolean): void {
    const next = new Set(this.selectedAssetIds());
    if (selected) next.add(id);
    else next.delete(id);
    this.selectedAssetIds.set(next);
  }

  protected selectFiltered(): void {
    const next = new Set(this.selectedAssetIds());
    for (const asset of this.filteredAssets()) next.add(asset.id);
    this.selectedAssetIds.set(next);
  }

  protected clearAssets(): void {
    this.selectedAssetIds.set(new Set());
  }

  protected async create(): Promise<void> {
    const isThermal = this.form.controls.moduleKey.value === 'thermal-imaging';
    if (
      this.form.invalid ||
      (!isThermal && this.selectedAssetIds().size === 0 && !this.allowDiscovery())
    )
      return;
    const value = this.form.getRawValue();
    const selected = this.assets().filter(({ id }) => this.selectedAssetIds().has(id));
    await this.run(async () => {
      const result = await this.api.createVisit(this.organisationId, {
        siteId: value.siteId,
        title: value.title,
        scheduledStart: new Date(value.scheduledStart).toISOString(),
        ...(value.assignedUserId ? { assignedUserId: value.assignedUserId } : {}),
        ...(value.guestEngineerName ? { guestEngineerName: value.guestEngineerName } : {}),
        ...(value.guestEmail ? { guestEmail: value.guestEmail } : {}),
        engineerNotes: value.engineerNotes,
        tasks: isThermal
          ? [{ moduleKey: 'thermal-imaging', title: 'Thermal imaging survey' }]
          : selected.map((asset) => ({
              assetId: asset.id,
              moduleKey: value.moduleKey,
              title: `${asset.displayName} inspection`,
            })),
      });
      this.showCreate.set(false);
      await this.router.navigate(['/app/org', this.organisationId, 'visits', result.visit.id]);
    });
  }

  protected async createGuestLink(visitId: string): Promise<void> {
    await this.run(async () => {
      const result = await this.api.createGuestLink(this.organisationId, visitId);
      const url = `${location.origin}${result.guestUrl}`;
      this.guestLink.set(url);
      await navigator.clipboard.writeText(url);
    });
  }

  protected searchVisits(value: string): void {
    this.visitQuery.set(value);
    if (this.visitSearchTimer !== undefined) clearTimeout(this.visitSearchTimer);
    this.visitSearchTimer = setTimeout(() => void this.loadVisits(1), 300);
  }

  protected setVisitStatus(value: string): void {
    this.visitStatus.set(value);
    void this.loadVisits(1);
  }

  protected setVisitDateField(value: string): void {
    this.visitDateField.set(value === 'completed' ? 'completed' : 'scheduled');
    void this.loadVisits(1);
  }

  protected setVisitDate(boundary: 'from' | 'to', value: string): void {
    if (boundary === 'from') this.visitFrom.set(value);
    else this.visitTo.set(value);
    void this.loadVisits(1);
  }

  protected setVisitSort(value: string): void {
    this.visitSort.set(value);
    void this.loadVisits(1);
  }

  protected setVisitPageSize(value: string): void {
    this.visitPageSize.set(Number(value));
    void this.loadVisits(1);
  }

  protected clearVisitFilters(): void {
    this.visitQuery.set('');
    this.visitStatus.set('ALL');
    this.visitDateField.set('scheduled');
    this.visitFrom.set('');
    this.visitTo.set('');
    this.visitSort.set('scheduled-desc');
    void this.loadVisits(1);
  }

  protected goToVisitPage(page: number): void {
    if (page < 1 || page > this.visitPagination().pageCount || this.listBusy()) return;
    void this.loadVisits(page);
  }

  protected completedTasks(visit: VisitSummary): number {
    return visit.tasks.filter(({ status }) => status === 'COMPLETED').length;
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private async load(): Promise<void> {
    await this.run(async () => {
      const [visits, sites, members, entitlements] = await Promise.all([
        this.fetchVisits(1),
        this.api.listSites(this.organisationId),
        this.api.listMembers(this.organisationId),
        this.api.entitlements(this.organisationId),
      ]);
      this.visits.set(visits.visits);
      this.visitPagination.set(visits.pagination);
      this.sites.set(sites.sites);
      this.members.set(members.members);
      this.entitlements.set(entitlements.entitlements);
      if (!this.evEnabled() && this.form.controls.moduleKey.value === 'ev-charging')
        this.form.controls.moduleKey.setValue(this.thermalEnabled() ? 'thermal-imaging' : 'core');
    });
    const requestedSiteId = this.route.snapshot.queryParamMap.get('siteId');
    if (requestedSiteId !== null) {
      const site = this.sites().find(({ id }) => id === requestedSiteId);
      if (site !== undefined) {
        await this.selectSite(site);
        this.form.controls.title.setValue(
          `${site.name} ${this.evEnabled() ? 'EV inspection' : this.thermalEnabled() ? 'thermal imaging' : 'inspection'} visit`,
        );
        this.showCreate.set(true);
      }
    }
  }

  private async loadVisits(page: number): Promise<void> {
    this.listBusy.set(true);
    this.error.set('');
    try {
      const result = await this.fetchVisits(page);
      this.visits.set(result.visits);
      this.visitPagination.set(result.pagination);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load visits.');
    } finally {
      this.listBusy.set(false);
    }
  }

  private fetchVisits(page: number) {
    const [sort, direction] = this.visitSort().split('-') as [
      'scheduled' | 'completed' | 'title' | 'status',
      'asc' | 'desc',
    ];
    return this.api.listVisits(this.organisationId, {
      query: this.visitQuery().trim(),
      status: this.visitStatus(),
      dateField: this.visitDateField(),
      from: this.visitFrom(),
      to: this.visitTo(),
      sort,
      direction,
      page,
      pageSize: this.visitPageSize(),
    });
  }

  private localDateTime(): string {
    const date = new Date(Date.now() + 86400000);
    date.setMinutes(0, 0, 0);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update visits.');
    } finally {
      this.busy.set(false);
    }
  }
}
