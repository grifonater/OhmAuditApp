import type { AuthenticatedActor } from '../../src/auth/auth.types';
import { defaultRoles, type Capability } from '../../src/authorization/capabilities';
import type { IdentityStore } from '../../src/identity/identity.store';
import type {
  InternalUser,
  MemberSummary,
  MembershipSummary,
  OrganisationSummary,
} from '../../src/identity/identity.types';

export class MemoryIdentityStore implements IdentityStore {
  readonly users: InternalUser[] = [];
  readonly memberships: MembershipSummary[] = [];
  readonly membershipUsers = new Map<string, string>();

  upsertUser(actor: AuthenticatedActor): Promise<InternalUser> {
    let user = this.users.find((item) => item.authSubject === actor.authSubject);
    if (user === undefined) {
      const created: InternalUser = {
        id: crypto.randomUUID(),
        authSubject: actor.authSubject,
        email: actor.email,
        ...(actor.displayName === undefined ? {} : { displayName: actor.displayName }),
        platformRole: 'USER',
        status: 'ACTIVE',
      };
      this.users.push(created);
      user = created;
    }
    return Promise.resolve(user);
  }

  listMemberships(userId: string): Promise<MembershipSummary[]> {
    return Promise.resolve(
      this.memberships.filter((item) => this.membershipUsers.get(item.id) === userId),
    );
  }

  createOrganisation(input: { name: string; ownerUserId: string }): Promise<OrganisationSummary> {
    const organisation: OrganisationSummary = {
      id: crypto.randomUUID(),
      name: input.name,
      slug: `${input.name.toLowerCase().replace(/\s+/gu, '-')}-test`,
      status: 'ACTIVE',
      requireMfaForPrivilegedRoles: false,
    };
    const owner = defaultRoles[0];
    const membership: MembershipSummary = {
      id: crypto.randomUUID(),
      organisation,
      status: 'ACTIVE',
      role: {
        key: owner.key,
        name: owner.name,
        privileged: owner.privileged,
        capabilities: [...owner.capabilities] as Capability[],
      },
    };
    this.memberships.push(membership);
    this.membershipUsers.set(membership.id, input.ownerUserId);
    return Promise.resolve(organisation);
  }

  async findMembership(
    userId: string,
    organisationId: string,
  ): Promise<MembershipSummary | undefined> {
    return (await this.listMemberships(userId)).find(
      (item) => item.organisation.id === organisationId,
    );
  }

  listMembers(organisationId: string): Promise<MemberSummary[]> {
    const members = this.memberships
      .filter((item) => item.organisation.id === organisationId)
      .map((item) => {
        const user = this.users.find(
          (candidate) => candidate.id === this.membershipUsers.get(item.id),
        );
        if (user === undefined) throw new Error('Test membership has no user.');
        return {
          id: item.id,
          user: {
            id: user.id,
            email: user.email,
            ...(user.displayName === undefined ? {} : { displayName: user.displayName }),
          },
          role: { key: item.role.key, name: item.role.name },
          status: item.status,
        };
      });
    return Promise.resolve(members);
  }

  setMfaPolicy(organisationId: string, required: boolean): Promise<OrganisationSummary> {
    const membership = this.memberships.find((item) => item.organisation.id === organisationId);
    if (membership === undefined) throw new Error('Organisation not found.');
    membership.organisation.requireMfaForPrivilegedRoles = required;
    return Promise.resolve(membership.organisation);
  }
}
