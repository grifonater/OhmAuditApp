import type { PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

export interface BrandProfileInput {
  tradingName?: string | undefined;
  registeredName?: string | undefined;
  addressLine1?: string | undefined;
  addressLine2?: string | undefined;
  city?: string | undefined;
  county?: string | undefined;
  postcode?: string | undefined;
  countryCode: string;
  telephone?: string | undefined;
  email?: string | undefined;
  website?: string | undefined;
  primaryColour: string;
  secondaryColour: string;
  timezone: string;
  dateFormat: string;
  onboardingStep: string;
}

export class OnboardingService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(organisationId: string) {
    const [profile, accreditations, invitations, customerCount, siteCount, assetCount] =
      await Promise.all([
        this.prisma.organisationBrandProfile.findUnique({ where: { organisationId } }),
        this.prisma.organisationAccreditation.findMany({ where: { organisationId } }),
        this.prisma.organisationInvitation.findMany({
          where: { organisationId },
          include: { role: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.customer.count({ where: { organisationId } }),
        this.prisma.site.count({ where: { organisationId } }),
        this.prisma.asset.count({ where: { organisationId } }),
      ]);
    return {
      profile,
      accreditations,
      invitations: invitations.map((item) => ({
        id: item.id,
        email: item.email,
        role: { key: item.role.key, name: item.role.name },
        status: item.status,
        expiresAt: item.expiresAt,
      })),
      checklist: {
        organisationCreated: true,
        brandingConfigured: profile?.tradingName !== null && profile?.tradingName !== undefined,
        accreditationAdded: accreditations.length > 0,
        teamInvited: invitations.length > 0,
        customerAdded: customerCount > 0,
        siteAdded: siteCount > 0,
        assetAdded: assetCount > 0,
      },
    };
  }

  async saveProfile(organisationId: string, input: BrandProfileInput) {
    const data = {
      countryCode: input.countryCode,
      primaryColour: input.primaryColour,
      secondaryColour: input.secondaryColour,
      timezone: input.timezone,
      dateFormat: input.dateFormat,
      onboardingStep: input.onboardingStep,
      ...(input.tradingName === undefined ? {} : { tradingName: input.tradingName }),
      ...(input.registeredName === undefined ? {} : { registeredName: input.registeredName }),
      ...(input.addressLine1 === undefined ? {} : { addressLine1: input.addressLine1 }),
      ...(input.addressLine2 === undefined ? {} : { addressLine2: input.addressLine2 }),
      ...(input.city === undefined ? {} : { city: input.city }),
      ...(input.county === undefined ? {} : { county: input.county }),
      ...(input.postcode === undefined ? {} : { postcode: input.postcode }),
      ...(input.telephone === undefined ? {} : { telephone: input.telephone }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.website === undefined ? {} : { website: input.website }),
    };
    return this.prisma.$transaction(async (transaction) => {
      const profile = await transaction.organisationBrandProfile.upsert({
        where: { organisationId },
        create: { organisationId, ...data },
        update: data,
      });
      if (input.tradingName !== undefined) {
        await transaction.organisation.update({
          where: { id: organisationId },
          data: { name: input.tradingName },
        });
      }
      return profile;
    });
  }

  addAccreditation(organisationId: string, input: { scheme: string; registrationNumber: string }) {
    return this.prisma.organisationAccreditation.create({ data: { organisationId, ...input } });
  }

  async setLogo(organisationId: string, mediaId: string) {
    const media = await this.prisma.media.findFirst({
      where: {
        id: mediaId,
        organisationId,
        entityType: 'Organisation',
        entityId: organisationId,
        category: 'contractor-logo',
        mimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] },
        status: 'AVAILABLE',
      },
    });
    if (media === null)
      throw new DomainError('MEDIA_NOT_FOUND', 'The logo media was not found.', 404);
    return this.prisma.organisationBrandProfile.update({
      where: { organisationId },
      data: { logoMediaId: mediaId },
    });
  }

  async invite(
    organisationId: string,
    inviterUserId: string,
    input: { email: string; roleKey: string },
  ) {
    const role = await this.prisma.role.findUnique({
      where: { organisationId_key: { organisationId, key: input.roleKey } },
    });
    if (role === null)
      throw new DomainError('ROLE_NOT_FOUND', 'The selected role was not found.', 422);
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/gu, '');
    const tokenHash = await hashToken(token);
    const invitation = await this.prisma.organisationInvitation.create({
      data: {
        organisationId,
        invitedByUserId: inviterUserId,
        email: input.email.toLowerCase(),
        roleId: role.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    return { invitation, token };
  }

  revoke(organisationId: string, invitationId: string) {
    return this.prisma.organisationInvitation.update({
      where: { id: invitationId, organisationId },
      data: { status: 'REVOKED' },
    });
  }

  async acceptInvitation(
    token: string,
    user: { id: string; email: string },
    correlationId: string,
  ) {
    const tokenHash = await hashToken(token);
    const invitation = await this.prisma.organisationInvitation.findUnique({
      where: { tokenHash },
      include: { organisation: true },
    });
    if (
      invitation === null ||
      invitation.status !== 'PENDING' ||
      invitation.expiresAt <= new Date()
    )
      throw new DomainError(
        'INVITATION_INVALID',
        'This invitation is invalid or has expired.',
        410,
      );
    if (invitation.email.toLowerCase() !== user.email.toLowerCase())
      throw new DomainError(
        'INVITATION_EMAIL_MISMATCH',
        'Sign in using the email address that was invited.',
        403,
      );
    const existingMembership = await this.prisma.organisationMembership.findUnique({
      where: {
        organisationId_userId: { organisationId: invitation.organisationId, userId: user.id },
      },
      select: { status: true },
    });
    if (existingMembership?.status === 'INACTIVE')
      throw new DomainError(
        'MEMBERSHIP_INACTIVE',
        'An Organisation administrator must restore this suspended membership.',
        403,
      );
    await this.prisma.$transaction(async (transaction) => {
      await transaction.organisationMembership.upsert({
        where: {
          organisationId_userId: { organisationId: invitation.organisationId, userId: user.id },
        },
        create: {
          organisationId: invitation.organisationId,
          userId: user.id,
          roleId: invitation.roleId,
        },
        update: { roleId: invitation.roleId, status: 'ACTIVE' },
      });
      await transaction.organisationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedByUserId: user.id, acceptedAt: new Date() },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId: invitation.organisationId,
          actorUserId: user.id,
          correlationId,
          eventType: 'OrganisationInvitationAccepted',
          entityType: 'OrganisationMembership',
          entityId: user.id,
          data: { invitationId: invitation.id },
        },
      });
    });
    return invitation.organisation;
  }
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
