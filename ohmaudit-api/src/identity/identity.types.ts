import type { Capability } from '../authorization/capabilities';

export type PlatformRole = 'USER' | 'PLATFORM_ADMIN';

export interface InternalUser {
  id: string;
  authSubject: string;
  email: string;
  displayName?: string;
  platformRole: PlatformRole;
  status: 'ACTIVE' | 'DISABLED';
}

export interface OrganisationSummary {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  requireMfaForPrivilegedRoles: boolean;
  logoMediaId?: string | null;
}

export interface MembershipSummary {
  id: string;
  organisation: OrganisationSummary;
  role: { key: string; name: string; privileged: boolean; capabilities: Capability[] };
  status: 'ACTIVE' | 'INACTIVE';
}

export interface MemberSummary {
  id: string;
  user: { id: string; email: string; displayName?: string };
  role: { key: string; name: string };
  status: 'ACTIVE' | 'INACTIVE';
}
