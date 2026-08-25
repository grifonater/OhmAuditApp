import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ApiService,
  type CurrentUserResponse,
  type Entitlement,
  type OnboardingState,
} from '../core/api.service';
import { OrganisationContextService } from '../core/organisation-context.service';

@Component({
  selector: 'oa-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly api = inject(ApiService);
  private readonly context = inject(OrganisationContextService);
  protected readonly account = signal<CurrentUserResponse | undefined>(undefined);
  protected readonly onboarding = signal<OnboardingState | undefined>(undefined);
  protected readonly entitlements = signal<Entitlement[]>([]);
  protected readonly metrics = signal({ customers: 0, sites: 0, assets: 0, attention: 0 });
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly greeting =
    new Date().getHours() < 12
      ? 'Good morning'
      : new Date().getHours() < 18
        ? 'Good afternoon'
        : 'Good evening';

  protected get organisationId(): string | null {
    return this.context.activeOrganisationId();
  }

  protected get currentMembership(): CurrentUserResponse['memberships'][number] | undefined {
    return this.account()?.memberships.find(
      (item) => item.organisation.id === this.context.activeOrganisationId(),
    );
  }

  protected get checklistProgress(): number {
    const values = Object.values(this.onboarding()?.checklist ?? {});
    return values.length === 0
      ? 0
      : Math.round((values.filter(Boolean).length / values.length) * 100);
  }

  constructor() {
    effect(() => {
      const organisationId = this.context.activeOrganisationId();
      if (organisationId !== null) void this.loadOrganisation(organisationId);
    });
    void this.loadAccount();
  }

  private async loadAccount(): Promise<void> {
    try {
      this.account.set(await this.api.currentUser());
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load your dashboard.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadOrganisation(organisationId: string): Promise<void> {
    this.loading.set(true);
    try {
      const [portfolio, onboarding, entitlements] = await Promise.all([
        this.api.portfolioSummary(organisationId),
        this.api.onboarding(organisationId),
        this.api.entitlements(organisationId),
      ]);
      this.onboarding.set(onboarding);
      this.entitlements.set(entitlements.entitlements);
      this.metrics.set({
        customers: portfolio.summary.customers,
        sites: portfolio.summary.sites,
        assets: portfolio.summary.assets,
        attention: 0,
      });
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load Organisation data.');
    } finally {
      this.loading.set(false);
    }
  }
}
