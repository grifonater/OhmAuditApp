import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs';
import {
  ApiService,
  type CurrentUserResponse,
  type CustomerSummary,
  type SiteSummary,
} from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { OrganisationContextService } from '../core/organisation-context.service';

interface DeploymentMetadata {
  id: string;
  tag: string | null;
  createdAt: string;
}

function isDeploymentMetadata(value: unknown): value is DeploymentMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'tag' in value &&
    (value.tag === null || typeof value.tag === 'string') &&
    'createdAt' in value &&
    typeof value.createdAt === 'string'
  );
}

@Component({
  selector: 'oa-app-shell',
  imports: [ReactiveFormsModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly context = inject(OrganisationContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly updates = inject(SwUpdate);

  protected readonly account = signal<CurrentUserResponse | undefined>(undefined);
  protected readonly routeOrganisationId = signal<string | null>(
    this.readOrganisationId(this.router.url),
  );
  protected readonly drawerOpen = signal(false);
  protected readonly organisationMenuOpen = signal(false);
  protected readonly creatingOrganisation = signal(false);
  protected readonly error = signal('');
  protected readonly searchOpen = signal(false);
  protected readonly searching = signal(false);
  protected readonly searchError = signal('');
  protected readonly clientResults = signal<CustomerSummary[]>([]);
  protected readonly siteResults = signal<SiteSummary[]>([]);
  protected readonly organisationLogoUrls = signal<Record<string, string>>({});
  protected readonly deployment = signal<DeploymentMetadata | undefined>(undefined);
  protected readonly deploymentError = signal('');
  protected readonly cacheStatus = signal<'checking' | 'latest' | 'update' | 'unavailable'>(
    'checking',
  );
  protected readonly deploymentCopied = signal(false);
  private searchRequest = 0;
  protected readonly organisationName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
  });
  protected readonly globalSearch = new FormControl('', { nonNullable: true });

  protected readonly activeMembership = computed(() => {
    const account = this.account();
    const organisationId = this.routeOrganisationId() ?? this.context.activeOrganisationId();
    return account?.memberships.find((item) => item.organisation.id === organisationId);
  });
  protected readonly userInitials = computed(() => {
    const user = this.account()?.user;
    const source = user?.displayName ?? user?.email ?? 'OA';
    return source
      .split(/\s|@/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  });
  protected readonly supportSession = computed(() => this.account()?.supportSession);

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeOrganisationLogos());
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        const organisationId = this.readOrganisationId(event.urlAfterRedirects);
        this.routeOrganisationId.set(organisationId);
        if (organisationId !== null) this.context.select(organisationId);
        this.drawerOpen.set(false);
        this.clearSearch();
      });
    this.globalSearch.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => void this.searchPortfolio(query));
    this.updates.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event.type === 'VERSION_DETECTED') this.cacheStatus.set('checking');
      if (event.type === 'VERSION_READY') this.cacheStatus.set('update');
      if (event.type === 'NO_NEW_VERSION_DETECTED') this.cacheStatus.set('latest');
      if (event.type === 'VERSION_INSTALLATION_FAILED') this.cacheStatus.set('unavailable');
    });
    void this.loadAccount();
    void this.loadDeploymentStatus();
  }

  protected organisationLink(suffix = ''): string {
    const id = this.activeMembership()?.organisation.id;
    return id === undefined ? '/app' : `/app/org/${id}${suffix}`;
  }

  protected hasCapability(capability: string): boolean {
    return this.activeMembership()?.role.capabilities.includes(capability) ?? false;
  }

  protected organisationLogoUrl(organisationId: string | undefined): string {
    return organisationId === undefined ? '' : (this.organisationLogoUrls()[organisationId] ?? '');
  }

  protected toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  protected toggleOrganisationMenu(): void {
    this.organisationMenuOpen.update((open) => !open);
  }

  protected async switchOrganisation(organisationId: string): Promise<void> {
    this.context.select(organisationId);
    this.organisationMenuOpen.set(false);
    this.clearSearch();
    await this.router.navigate(['/app/org', organisationId]);
  }

  protected showSearch(): void {
    if (this.globalSearch.value.trim().length >= 2) this.searchOpen.set(true);
  }

  @HostListener('document:click', ['$event'])
  protected closeSearchFromOutside(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('.global-search') === null)
      this.searchOpen.set(false);
  }

  @HostListener('window:ohmaudit:account-changed')
  protected refreshAccount(): void {
    void this.loadAccount();
  }

  protected clearSearch(): void {
    this.searchRequest += 1;
    this.globalSearch.setValue('', { emitEvent: false });
    this.clientResults.set([]);
    this.siteResults.set([]);
    this.searchError.set('');
    this.searchOpen.set(false);
    this.searching.set(false);
  }

  protected async openClient(customerId: string): Promise<void> {
    const organisationId = this.activeMembership()?.organisation.id;
    if (organisationId === undefined) return;
    this.clearSearch();
    await this.router.navigate(['/app/org', organisationId, 'portfolio', 'clients', customerId]);
  }

  protected async openSite(site: SiteSummary): Promise<void> {
    const organisationId = this.activeMembership()?.organisation.id;
    const customerId = site.customer?.id ?? site.customerId;
    if (organisationId === undefined || customerId === undefined) return;
    this.clearSearch();
    await this.router.navigate([
      '/app/org',
      organisationId,
      'portfolio',
      'clients',
      customerId,
      'sites',
      site.id,
    ]);
  }

  protected async createOrganisation(event: Event): Promise<void> {
    event.preventDefault();
    if (this.organisationName.invalid) return;
    this.creatingOrganisation.set(true);
    this.error.set('');
    try {
      const result = await this.api.createOrganisation(this.organisationName.value);
      this.organisationName.reset();
      await this.loadAccount();
      this.context.select(result.organisation.id);
      this.organisationMenuOpen.set(false);
      await this.router.navigate(['/app/org', result.organisation.id, 'onboarding']);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to create the Organisation.');
    } finally {
      this.creatingOrganisation.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    sessionStorage.removeItem('ohmaudit.supportSession');
    this.context.clear();
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }

  protected async leaveSupportMode(): Promise<void> {
    const sessionId = this.supportSession()?.sessionId;
    try {
      if (sessionId) await this.api.endPlatformSupportSession(sessionId);
    } finally {
      sessionStorage.removeItem('ohmaudit.supportSession');
      location.assign('/app/platform');
    }
  }

  protected supportExpiry(value: string): string {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(value),
    );
  }

  protected deploymentTime(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  protected async copyDeploymentId(): Promise<void> {
    const id = this.deployment()?.id;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      this.deploymentCopied.set(true);
      setTimeout(() => this.deploymentCopied.set(false), 1800);
    } catch {
      this.deploymentCopied.set(false);
    }
  }

  protected reloadLatestVersion(): void {
    document.location.reload();
  }

  private async loadAccount(): Promise<void> {
    try {
      const account = await this.api.currentUser();
      this.account.set(account);
      void this.loadOrganisationLogos(account);
      const selected = this.context.activeOrganisationId();
      if (
        this.routeOrganisationId() === null &&
        (selected === null ||
          !account.memberships.some((item) => item.organisation.id === selected)) &&
        account.memberships[0] !== undefined
      ) {
        this.context.select(account.memberships[0].organisation.id);
      }
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load your workspace.');
    }
  }

  private async loadDeploymentStatus(): Promise<void> {
    try {
      const response = await fetch(`/deployment.json?checked=${Date.now()}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Deployment metadata is unavailable.');
      const metadata: unknown = await response.json();
      if (!isDeploymentMetadata(metadata)) throw new Error('Deployment metadata is invalid.');
      this.deployment.set({
        id: metadata.id,
        tag: metadata.tag,
        createdAt: metadata.createdAt,
      });
    } catch {
      this.deploymentError.set('Deployment ID unavailable while offline.');
    }

    if (!this.updates.isEnabled) {
      this.cacheStatus.set('latest');
      return;
    }
    try {
      await navigator.serviceWorker.ready;
      this.cacheStatus.set((await this.updates.checkForUpdate()) ? 'update' : 'latest');
    } catch {
      this.cacheStatus.set('unavailable');
    }
  }

  private async loadOrganisationLogos(account: CurrentUserResponse): Promise<void> {
    const entries = await Promise.all(
      account.memberships.flatMap((membership) =>
        membership.organisation.logoMediaId
          ? [
              this.api
                .downloadMedia(membership.organisation.id, membership.organisation.logoMediaId)
                .then((blob) => [membership.organisation.id, URL.createObjectURL(blob)] as const)
                .catch(() => undefined),
            ]
          : [],
      ),
    );
    this.revokeOrganisationLogos();
    this.organisationLogoUrls.set(
      Object.fromEntries(entries.filter((entry) => entry !== undefined)),
    );
  }

  private revokeOrganisationLogos(): void {
    Object.values(this.organisationLogoUrls()).forEach((url) => URL.revokeObjectURL(url));
    this.organisationLogoUrls.set({});
  }

  private async searchPortfolio(rawQuery: string): Promise<void> {
    const query = rawQuery.trim();
    const organisationId = this.activeMembership()?.organisation.id;
    const request = ++this.searchRequest;
    if (query.length < 2 || organisationId === undefined) {
      this.clientResults.set([]);
      this.siteResults.set([]);
      this.searchError.set('');
      this.searchOpen.set(false);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.searchOpen.set(true);
    this.searchError.set('');
    try {
      const result = await this.api.search(organisationId, query);
      if (request !== this.searchRequest || query !== this.globalSearch.value.trim()) return;
      this.clientResults.set(result.customers);
      this.siteResults.set(result.sites);
    } catch (error: unknown) {
      if (request !== this.searchRequest) return;
      this.clientResults.set([]);
      this.siteResults.set([]);
      this.searchError.set(error instanceof Error ? error.message : 'Search is unavailable.');
    } finally {
      if (request === this.searchRequest) this.searching.set(false);
    }
  }

  private readOrganisationId(url: string): string | null {
    return /\/app\/org\/([^/?#]+)/u.exec(url)?.[1] ?? null;
  }
}
