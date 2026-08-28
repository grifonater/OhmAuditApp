import type { AuthenticatedActor } from '../auth/auth.types';
import type { Capability } from '../authorization/capabilities';
import { DomainError } from '../shared/domain-error';
import type { IdentityStore } from './identity.store';
import { hasCapability } from './identity.store';

export class IdentityService {
  constructor(private readonly store: IdentityStore) {}

  async currentUser(actor: AuthenticatedActor) {
    const user = await this.store.upsertUser(actor);
    if (user.status !== 'ACTIVE')
      throw new DomainError('USER_DISABLED', 'This account has been disabled.', 403);
    const memberships = await this.store.listMemberships(user.id);
    return {
      user,
      memberships:
        actor.support === undefined
          ? memberships
          : memberships.filter(
              (membership) => membership.organisation.id === actor.support?.organisationId,
            ),
      assuranceLevel: actor.assuranceLevel,
      ...(actor.support === undefined ? {} : { supportSession: actor.support }),
    };
  }

  async createOrganisation(actor: AuthenticatedActor, name: string, correlationId: string) {
    if (actor.support !== undefined)
      throw new DomainError(
        'SUPPORT_MODE_RESTRICTED',
        'Organisation creation is unavailable in support mode.',
        403,
      );
    const user = await this.store.upsertUser(actor);
    if (user.status !== 'ACTIVE')
      throw new DomainError('USER_DISABLED', 'This account has been disabled.', 403);
    return this.store.createOrganisation({ name, ownerUserId: user.id, correlationId });
  }

  async requirePlatformAdmin(actor: AuthenticatedActor) {
    if (actor.support !== undefined)
      throw new DomainError(
        'SUPPORT_MODE_RESTRICTED',
        'Leave support mode before using platform administration.',
        403,
      );
    const user = await this.store.upsertUser(actor);
    if (user.platformRole !== 'PLATFORM_ADMIN' || user.status !== 'ACTIVE') {
      throw new DomainError(
        'PLATFORM_ADMIN_REQUIRED',
        'Platform administrator access is required.',
        403,
      );
    }
    return user;
  }

  async requireMembership(
    actor: AuthenticatedActor,
    organisationId: string,
    capability?: Capability,
  ) {
    if (actor.support !== undefined && actor.support.organisationId !== organisationId)
      throw new DomainError('ORGANISATION_NOT_FOUND', 'The organisation was not found.', 404);
    const user = await this.store.upsertUser(actor);
    if (user.status !== 'ACTIVE')
      throw new DomainError('USER_DISABLED', 'This account has been disabled.', 403);
    const membership = await this.store.findMembership(user.id, organisationId);
    if (membership === undefined || membership.status !== 'ACTIVE') {
      throw new DomainError('ORGANISATION_NOT_FOUND', 'The organisation was not found.', 404);
    }
    if (membership.organisation.status !== 'ACTIVE')
      throw new DomainError(
        'ORGANISATION_UNAVAILABLE',
        'This Organisation is suspended or archived.',
        403,
      );
    if (capability !== undefined && !hasCapability(membership, capability)) {
      throw new DomainError('CAPABILITY_REQUIRED', `This action requires ${capability}.`, 403);
    }
    if (
      membership.organisation.requireMfaForPrivilegedRoles &&
      membership.role.privileged &&
      actor.assuranceLevel !== 'aal2'
    ) {
      throw new DomainError('MFA_REQUIRED', 'Verify your second factor to continue.', 403);
    }
    return { user, membership };
  }

  async requireAnyCapability(
    actor: AuthenticatedActor,
    organisationId: string,
    required: Capability[],
  ) {
    const result = await this.requireMembership(actor, organisationId);
    if (!required.some((capability) => hasCapability(result.membership, capability))) {
      throw new DomainError(
        'CAPABILITY_REQUIRED',
        `This action requires one of: ${required.join(', ')}.`,
        403,
      );
    }
    return result;
  }

  async requireAllCapabilities(
    actor: AuthenticatedActor,
    organisationId: string,
    required: Capability[],
  ) {
    const result = await this.requireMembership(actor, organisationId);
    if (!required.every((capability) => hasCapability(result.membership, capability))) {
      throw new DomainError(
        'CAPABILITY_REQUIRED',
        `This action requires: ${required.join(', ')}.`,
        403,
      );
    }
    return result;
  }

  async listMembers(actor: AuthenticatedActor, organisationId: string) {
    await this.requireMembership(actor, organisationId, 'organisation.users.manage');
    return this.store.listMembers(organisationId);
  }

  async setMfaPolicy(
    actor: AuthenticatedActor,
    organisationId: string,
    required: boolean,
    correlationId: string,
  ) {
    const { user } = await this.requireMembership(
      actor,
      organisationId,
      'organisation.users.manage',
    );
    if (required && actor.assuranceLevel !== 'aal2') {
      throw new DomainError(
        'MFA_ENROLMENT_REQUIRED',
        'Enable and verify MFA before requiring it for privileged roles.',
        403,
      );
    }
    return this.store.setMfaPolicy(organisationId, required, user.id, correlationId);
  }
}
