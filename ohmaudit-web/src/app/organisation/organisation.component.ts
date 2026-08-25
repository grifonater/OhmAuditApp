import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, type CurrentUserResponse, type OrganisationMember } from '../core/api.service';
import { OrganisationContextService } from '../core/organisation-context.service';

@Component({
  selector: 'oa-organisation',
  imports: [RouterLink],
  templateUrl: './organisation.component.html',
  styleUrl: './organisation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganisationComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly context = inject(OrganisationContextService);
  protected readonly membership = signal<CurrentUserResponse['memberships'][number] | undefined>(
    undefined,
  );
  protected readonly members = signal<OrganisationMember[]>([]);
  protected readonly error = signal('');

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const organisationId = this.route.snapshot.paramMap.get('organisationId');
    if (organisationId === null) return;
    this.context.select(organisationId);
    try {
      const account = await this.api.currentUser();
      const membership = account.memberships.find(
        (item) => item.organisation.id === organisationId,
      );
      if (membership === undefined) throw new Error('Organisation access is not available.');
      this.membership.set(membership);
      if (membership.role.capabilities.includes('organisation.users.manage')) {
        this.members.set((await this.api.listMembers(organisationId)).members);
      }
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to open the Organisation.');
    }
  }
}
