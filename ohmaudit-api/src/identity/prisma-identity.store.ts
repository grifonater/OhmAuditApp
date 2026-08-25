import { capabilities, defaultRoles, type Capability } from '../authorization/capabilities';
import type { PrismaClient } from '../generated/prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import type { IdentityStore } from './identity.store';
import type {
  InternalUser,
  MemberSummary,
  MembershipSummary,
  OrganisationSummary,
} from './identity.types';
import { moduleCatalogue } from '../entitlements/module-catalogue';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 48);
}

export class PrismaIdentityStore implements IdentityStore {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertUser(actor: AuthenticatedActor): Promise<InternalUser> {
    const user = await this.prisma.user.upsert({
      where: { authSubject: actor.authSubject },
      create: {
        authSubject: actor.authSubject,
        email: actor.email,
        ...(actor.displayName === undefined ? {} : { displayName: actor.displayName }),
      },
      update: {
        email: actor.email,
        ...(actor.displayName === undefined ? {} : { displayName: actor.displayName }),
      },
    });
    return {
      ...user,
      ...(user.displayName === null ? { displayName: undefined } : {}),
    } as InternalUser;
  }

  async listMemberships(userId: string): Promise<MembershipSummary[]> {
    const memberships = await this.prisma.organisationMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        organisation: { include: { brandProfile: { select: { logoMediaId: true } } } },
        role: { include: { capabilities: { include: { capability: true } } } },
      },
      orderBy: { organisation: { name: 'asc' } },
    });
    return memberships.map((membership) => ({
      id: membership.id,
      organisation: {
        id: membership.organisation.id,
        name: membership.organisation.name,
        slug: membership.organisation.slug,
        status: membership.organisation.status,
        requireMfaForPrivilegedRoles: membership.organisation.requireMfaForPrivilegedRoles,
        logoMediaId: membership.organisation.brandProfile?.logoMediaId ?? null,
      },
      status: membership.status,
      role: {
        key: membership.role.key,
        name: membership.role.name,
        privileged: membership.role.isPrivileged,
        capabilities: membership.role.capabilities.map((item) => item.capability.key as Capability),
      },
    }));
  }

  async createOrganisation(input: {
    name: string;
    ownerUserId: string;
    correlationId: string;
  }): Promise<OrganisationSummary> {
    const baseSlug = slugify(input.name) || 'organisation';
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
    return this.prisma.$transaction(async (transaction) => {
      await Promise.all(
        capabilities.map((key) =>
          transaction.capability.upsert({ where: { key }, create: { key }, update: {} }),
        ),
      );
      const organisation = await transaction.organisation.create({
        data: { name: input.name, slug },
      });
      for (const [displayOrder, definition] of moduleCatalogue.entries()) {
        const module = await transaction.moduleDefinition.upsert({
          where: { key: definition.key },
          create: {
            key: definition.key,
            name: definition.name,
            description: definition.description,
            displayOrder,
            capabilities: [...definition.capabilities],
          },
          update: {
            name: definition.name,
            description: definition.description,
            displayOrder,
            capabilities: [...definition.capabilities],
          },
        });
        await transaction.organisationModuleEntitlement.create({
          data: {
            organisationId: organisation.id,
            moduleId: module.id,
            status: 'CANCELLED',
          },
        });
      }
      await transaction.organisationBrandProfile.create({
        data: { organisationId: organisation.id, tradingName: organisation.name },
      });
      for (const definition of defaultRoles) {
        await transaction.role.create({
          data: {
            organisationId: organisation.id,
            key: definition.key,
            name: definition.name,
            isPrivileged: definition.privileged,
            capabilities: {
              create: definition.capabilities.map((key) => ({ capability: { connect: { key } } })),
            },
          },
        });
      }
      const ownerRole = await transaction.role.findUniqueOrThrow({
        where: {
          organisationId_key: { organisationId: organisation.id, key: 'organisation-owner' },
        },
      });
      await transaction.organisationMembership.create({
        data: { organisationId: organisation.id, userId: input.ownerUserId, roleId: ownerRole.id },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId: organisation.id,
          actorUserId: input.ownerUserId,
          eventType: 'OrganisationCreated',
          entityType: 'Organisation',
          entityId: organisation.id,
          correlationId: input.correlationId,
          data: { name: organisation.name },
        },
      });
      return organisation;
    });
  }

  async findMembership(
    userId: string,
    organisationId: string,
  ): Promise<MembershipSummary | undefined> {
    return (await this.listMemberships(userId)).find(
      (item) => item.organisation.id === organisationId,
    );
  }

  async listMembers(organisationId: string): Promise<MemberSummary[]> {
    const members = await this.prisma.organisationMembership.findMany({
      where: { organisationId },
      include: { user: true, role: true },
      orderBy: { user: { email: 'asc' } },
    });
    return members.map((membership) => ({
      id: membership.id,
      user: {
        id: membership.user.id,
        email: membership.user.email,
        ...(membership.user.displayName === null
          ? {}
          : { displayName: membership.user.displayName }),
      },
      role: { key: membership.role.key, name: membership.role.name },
      status: membership.status,
    }));
  }

  async setMfaPolicy(
    organisationId: string,
    required: boolean,
    actorUserId: string,
    correlationId: string,
  ): Promise<OrganisationSummary> {
    return this.prisma.$transaction(async (transaction) => {
      const organisation = await transaction.organisation.update({
        where: { id: organisationId },
        data: { requireMfaForPrivilegedRoles: required },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          eventType: 'OrganisationMfaPolicyChanged',
          entityType: 'Organisation',
          entityId: organisationId,
          correlationId,
          data: { requireMfaForPrivilegedRoles: required },
        },
      });
      return organisation;
    });
  }
}
