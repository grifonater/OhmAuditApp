import { capabilityCatalogue, type Capability } from '../authorization/capabilities';
import type { PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

type ActorAccess = {
  userId: string;
  roleKey: string;
  capabilities: Capability[];
};

type RoleInput = {
  name: string;
  description?: string | undefined;
  capabilityKeys: Capability[];
};

const privilegedCapabilities = new Set(
  capabilityCatalogue.filter((item) => item.sensitive).map((item) => item.key),
);

function roleKey(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '')
      .slice(0, 40) || 'custom-role';
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export class AccessService {
  constructor(private readonly prisma: PrismaClient) {}

  async overview(organisationId: string, actor: ActorAccess) {
    await this.ensureCapabilities();
    const [roles, members, invitations] = await Promise.all([
      this.prisma.role.findMany({
        where: { organisationId },
        include: {
          capabilities: { include: { capability: true } },
          _count: { select: { memberships: true, invitations: true } },
        },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.organisationMembership.findMany({
        where: { organisationId },
        include: { user: true, role: true },
        orderBy: { user: { email: 'asc' } },
      }),
      this.prisma.organisationInvitation.findMany({
        where: { organisationId, status: 'PENDING' },
        include: { role: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      capabilities: capabilityCatalogue,
      assignableCapabilityKeys: actor.capabilities,
      roles: roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        isPrivileged: role.isPrivileged,
        capabilityKeys: role.capabilities.map((item) => item.capability.key as Capability),
        memberCount: role._count.memberships,
        invitationCount: role._count.invitations,
      })),
      members: members.map((membership) => ({
        id: membership.id,
        user: {
          id: membership.user.id,
          email: membership.user.email,
          displayName: membership.user.displayName,
        },
        role: { id: membership.role.id, key: membership.role.key, name: membership.role.name },
        status: membership.status,
        isCurrentUser: membership.userId === actor.userId,
      })),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: { key: invitation.role.key, name: invitation.role.name },
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      })),
    };
  }

  async assertRoleKeyAssignable(
    organisationId: string,
    key: string,
    actor: ActorAccess,
  ): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { organisationId_key: { organisationId, key } },
      include: { capabilities: { include: { capability: true } } },
    });
    if (role === null)
      throw new DomainError('ROLE_NOT_FOUND', 'The selected role was not found.', 422);
    this.assertAssignable(
      actor,
      role.capabilities.map((item) => item.capability.key as Capability),
    );
  }

  async createRole(
    organisationId: string,
    actor: ActorAccess,
    input: RoleInput,
    correlationId: string,
  ) {
    this.assertAssignable(actor, input.capabilityKeys);
    await this.ensureCapabilities();
    const role = await this.prisma.role.create({
      data: {
        organisationId,
        key: roleKey(input.name),
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
        isPrivileged: input.capabilityKeys.some((key) => privilegedCapabilities.has(key)),
        capabilities: {
          create: input.capabilityKeys.map((key) => ({ capability: { connect: { key } } })),
        },
      },
      include: { capabilities: { include: { capability: true } } },
    });
    await this.audit(
      organisationId,
      actor.userId,
      'OrganisationRoleCreated',
      role.id,
      correlationId,
      {
        name: role.name,
        capabilityKeys: input.capabilityKeys,
      },
    );
    return role;
  }

  async updateRole(
    organisationId: string,
    roleId: string,
    actor: ActorAccess,
    input: RoleInput,
    correlationId: string,
  ) {
    this.assertAssignable(actor, input.capabilityKeys);
    const role = await this.findRole(organisationId, roleId);
    if (role.isSystem)
      throw new DomainError('SYSTEM_ROLE_IMMUTABLE', 'Built-in roles cannot be edited.', 409);
    if (!input.capabilityKeys.includes('organisation.users.manage')) {
      await this.assertAdministratorRemains(organisationId, roleId);
    }
    await this.ensureCapabilities();
    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.roleCapability.deleteMany({ where: { roleId } });
      return transaction.role.update({
        where: { id: roleId },
        data: {
          name: input.name,
          description: input.description ?? null,
          isPrivileged: input.capabilityKeys.some((key) => privilegedCapabilities.has(key)),
          capabilities: {
            create: input.capabilityKeys.map((key) => ({ capability: { connect: { key } } })),
          },
        },
      });
    });
    await this.audit(
      organisationId,
      actor.userId,
      'OrganisationRoleUpdated',
      roleId,
      correlationId,
      {
        name: input.name,
        capabilityKeys: input.capabilityKeys,
      },
    );
    return updated;
  }

  async deleteRole(
    organisationId: string,
    roleId: string,
    actor: ActorAccess,
    correlationId: string,
  ) {
    const role = await this.findRole(organisationId, roleId);
    if (role.isSystem)
      throw new DomainError('SYSTEM_ROLE_IMMUTABLE', 'Built-in roles cannot be deleted.', 409);
    const [members, invitations] = await Promise.all([
      this.prisma.organisationMembership.count({ where: { organisationId, roleId } }),
      this.prisma.organisationInvitation.count({
        where: { organisationId, roleId, status: 'PENDING' },
      }),
    ]);
    if (members > 0 || invitations > 0)
      throw new DomainError(
        'ROLE_IN_USE',
        'Move members and revoke pending invitations before deleting this role.',
        409,
      );
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.audit(
      organisationId,
      actor.userId,
      'OrganisationRoleDeleted',
      roleId,
      correlationId,
      {
        name: role.name,
      },
    );
  }

  async setMemberRole(
    organisationId: string,
    membershipId: string,
    targetRoleId: string,
    actor: ActorAccess,
    correlationId: string,
  ) {
    const [membership, role] = await Promise.all([
      this.prisma.organisationMembership.findFirst({
        where: { id: membershipId, organisationId },
        include: {
          role: { include: { capabilities: { include: { capability: true } } } },
        },
      }),
      this.prisma.role.findFirst({
        where: { id: targetRoleId, organisationId },
        include: { capabilities: { include: { capability: true } } },
      }),
    ]);
    if (membership === null)
      throw new DomainError('MEMBER_NOT_FOUND', 'The member was not found.', 404);
    if (role === null)
      throw new DomainError('ROLE_NOT_FOUND', 'The selected role was not found.', 422);
    this.assertAssignable(
      actor,
      membership.role.capabilities.map((item) => item.capability.key as Capability),
    );
    const targetCapabilities = role.capabilities.map((item) => item.capability.key as Capability);
    this.assertAssignable(actor, targetCapabilities);
    if (membership.role.key === 'organisation-owner' && role.key !== 'organisation-owner')
      await this.assertAdministratorRemains(organisationId, membership.roleId, membershipId);
    if (membership.roleId !== role.id && !targetCapabilities.includes('organisation.users.manage'))
      await this.assertAdministratorRemains(organisationId, membership.roleId, membershipId);
    const updated = await this.prisma.organisationMembership.update({
      where: { id: membershipId },
      data: { roleId: role.id },
      include: { user: true, role: true },
    });
    await this.audit(
      organisationId,
      actor.userId,
      'OrganisationMemberRoleChanged',
      membershipId,
      correlationId,
      {
        userId: membership.userId,
        previousRole: membership.role.key,
        role: role.key,
      },
    );
    return updated;
  }

  async setMemberStatus(
    organisationId: string,
    membershipId: string,
    status: 'ACTIVE' | 'INACTIVE',
    actor: ActorAccess,
    correlationId: string,
  ) {
    const membership = await this.prisma.organisationMembership.findFirst({
      where: { id: membershipId, organisationId },
      include: { role: { include: { capabilities: { include: { capability: true } } } } },
    });
    if (membership === null)
      throw new DomainError('MEMBER_NOT_FOUND', 'The member was not found.', 404);
    this.assertAssignable(
      actor,
      membership.role.capabilities.map((item) => item.capability.key as Capability),
    );
    if (status === 'INACTIVE' && membership.status === 'ACTIVE')
      await this.assertAdministratorRemains(organisationId, membership.roleId, membershipId);
    const updated = await this.prisma.organisationMembership.update({
      where: { id: membershipId },
      data: { status },
    });
    await this.audit(
      organisationId,
      actor.userId,
      'OrganisationMemberStatusChanged',
      membershipId,
      correlationId,
      {
        userId: membership.userId,
        status,
      },
    );
    return updated;
  }

  private assertAssignable(actor: ActorAccess, requested: Capability[]): void {
    const unavailable = requested.filter((key) => !actor.capabilities.includes(key));
    if (unavailable.length > 0)
      throw new DomainError(
        'CAPABILITY_ESCALATION',
        'You cannot grant permissions that you do not hold.',
        403,
      );
  }

  private async findRole(organisationId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, organisationId } });
    if (role === null)
      throw new DomainError('ROLE_NOT_FOUND', 'The selected role was not found.', 404);
    return role;
  }

  private async assertAdministratorRemains(
    organisationId: string,
    affectedRoleId: string,
    excludedMembershipId?: string,
  ) {
    const affectedHasAdmin = await this.prisma.roleCapability.count({
      where: { roleId: affectedRoleId, capability: { key: 'organisation.users.manage' } },
    });
    if (affectedHasAdmin === 0) return;
    const otherAdministrators = await this.prisma.organisationMembership.count({
      where: {
        organisationId,
        status: 'ACTIVE',
        ...(excludedMembershipId === undefined
          ? { roleId: { not: affectedRoleId } }
          : { id: { not: excludedMembershipId } }),
        role: { capabilities: { some: { capability: { key: 'organisation.users.manage' } } } },
      },
    });
    if (otherAdministrators === 0)
      throw new DomainError(
        'LAST_ADMINISTRATOR',
        'An organisation must retain at least one active user administrator.',
        409,
      );
  }

  private async ensureCapabilities(): Promise<void> {
    await Promise.all(
      capabilityCatalogue.map((definition) =>
        this.prisma.capability.upsert({
          where: { key: definition.key },
          create: { key: definition.key, description: definition.description },
          update: { description: definition.description },
        }),
      ),
    );
  }

  private async audit(
    organisationId: string,
    actorUserId: string,
    eventType: string,
    entityId: string,
    correlationId: string,
    data: object,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        organisationId,
        actorUserId,
        eventType,
        entityType: 'OrganisationAccess',
        entityId,
        correlationId,
        data,
      },
    });
  }
}
