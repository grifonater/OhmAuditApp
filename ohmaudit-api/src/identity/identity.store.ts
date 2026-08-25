import type { AuthenticatedActor } from '../auth/auth.types';
import type { Capability } from '../authorization/capabilities';
import type {
  InternalUser,
  MemberSummary,
  MembershipSummary,
  OrganisationSummary,
} from './identity.types';

export interface IdentityStore {
  upsertUser(actor: AuthenticatedActor): Promise<InternalUser>;
  listMemberships(userId: string): Promise<MembershipSummary[]>;
  createOrganisation(input: {
    name: string;
    ownerUserId: string;
    correlationId: string;
  }): Promise<OrganisationSummary>;
  findMembership(userId: string, organisationId: string): Promise<MembershipSummary | undefined>;
  listMembers(organisationId: string): Promise<MemberSummary[]>;
  setMfaPolicy(
    organisationId: string,
    required: boolean,
    actorUserId: string,
    correlationId: string,
  ): Promise<OrganisationSummary>;
}

export function hasCapability(membership: MembershipSummary, capability: Capability): boolean {
  return membership.status === 'ACTIVE' && membership.role.capabilities.includes(capability);
}
