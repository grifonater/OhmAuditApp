import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';
import {
  normalizeRamsDraft,
  type RamsDraft,
  type RamsHazard,
  type RamsMethodStep,
} from './rams.service';

export interface RamsTemplateInput {
  name: string;
  description: string;
  data: RamsDraft;
}

export interface RamsMethodStatementGroupInput {
  name: string;
  description: string;
  steps: RamsMethodStep[];
}

export interface RamsLibraryHazardInput {
  name: string;
  description: string;
  isDefault: boolean;
  data: RamsHazard;
}

function cleanName(name: string): string {
  return name.trim().replaceAll(/\s+/g, ' ');
}

function normaliseName(name: string): string {
  return cleanName(name).toLocaleLowerCase('en-GB');
}

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function normalizeSteps(steps: RamsMethodStep[]): RamsMethodStep[] {
  return normalizeRamsDraft({ methodStatement: { steps } }).methodStatement.steps;
}

function normalizeHazard(hazard: RamsHazard): RamsHazard {
  return normalizeRamsDraft({ riskAssessment: { hazards: [hazard] } }).riskAssessment.hazards[0]!;
}

function normalizeTemplateData(value: RamsDraft): RamsDraft {
  const data = normalizeRamsDraft(value);
  data.overview.title = '';
  data.overview.category = '';
  data.overview.effectiveFrom = '';
  data.overview.reviewBy = '';
  data.overview.revisionSummary = '';
  data.scope.workAreas = [];
  data.scope.workBoundaries = '';
  data.scope.responsibilities = [];
  data.requirements.ppe = [];
  data.requirements.emergencyDetails = {
    contactName: '',
    contactNumber: '',
    nearestHospital: '',
    hospitalAddress: '',
    assemblyPoint: '',
    additionalInfo: '',
  };
  data.supportingInformation.siteAccess = '';
  data.supportingInformation.permits = '';
  data.review.internalNotes = '';
  data.review.revisionReason = '';
  data.review.changeSummary = '';
  return data;
}

export class RamsLibraryService {
  constructor(private readonly prisma: PrismaClient) {}

  async listTemplates(organisationId: string, includeArchived = false) {
    const templates = await this.prisma.ramsTemplate.findMany({
      where: { organisationId, ...(includeArchived ? {} : { status: 'ACTIVE' as const }) },
      orderBy: { name: 'asc' },
    });
    return templates.map((template) => ({
      ...template,
      data: normalizeTemplateData(normalizeRamsDraft(template.data)),
    }));
  }

  async createTemplate(
    organisationId: string,
    actorUserId: string,
    correlationId: string,
    input: RamsTemplateInput,
  ) {
    const name = cleanName(input.name);
    const data = normalizeTemplateData(input.data);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const template = await transaction.ramsTemplate.create({
          data: {
            organisationId,
            name,
            normalisedName: normaliseName(name),
            description: input.description.trim(),
            data: data as unknown as Prisma.InputJsonValue,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'RamsTemplateCreated',
            entityType: 'RamsTemplate',
            entityId: template.id,
            data: { name: template.name },
          },
        });
        return { ...template, data };
      });
    } catch (error: unknown) {
      this.translateDuplicate(
        error,
        'RAMS_TEMPLATE_EXISTS',
        'A RAMS template with this name already exists.',
      );
    }
  }

  async updateTemplate(
    organisationId: string,
    templateId: string,
    actorUserId: string,
    correlationId: string,
    input: RamsTemplateInput,
  ) {
    const current = await this.requireTemplate(organisationId, templateId);
    const name = cleanName(input.name);
    const data = normalizeTemplateData(input.data);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const template = await transaction.ramsTemplate.update({
          where: { id: templateId },
          data: {
            name,
            normalisedName: normaliseName(name),
            description: input.description.trim(),
            data: data as unknown as Prisma.InputJsonValue,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'RamsTemplateUpdated',
            entityType: 'RamsTemplate',
            entityId: template.id,
            data: { previousName: current.name, name: template.name },
          },
        });
        return { ...template, data };
      });
    } catch (error: unknown) {
      this.translateDuplicate(
        error,
        'RAMS_TEMPLATE_EXISTS',
        'A RAMS template with this name already exists.',
      );
    }
  }

  async archiveTemplate(
    organisationId: string,
    templateId: string,
    actorUserId: string,
    correlationId: string,
  ): Promise<void> {
    const current = await this.requireTemplate(organisationId, templateId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.ramsTemplate.update({
        where: { id: templateId },
        data: {
          status: 'ARCHIVED',
          normalisedName: `${current.normalisedName}#archived#${templateId}`,
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'RamsTemplateArchived',
          entityType: 'RamsTemplate',
          entityId: templateId,
          data: { name: current.name },
        },
      });
    });
  }

  async listMethodGroups(organisationId: string, includeArchived = false) {
    const groups = await this.prisma.ramsMethodStatementGroup.findMany({
      where: { organisationId, ...(includeArchived ? {} : { status: 'ACTIVE' as const }) },
      orderBy: { name: 'asc' },
    });
    return groups.map((group) => ({
      ...group,
      steps: normalizeSteps(group.steps as unknown as RamsMethodStep[]),
    }));
  }

  async createMethodGroup(
    organisationId: string,
    actorUserId: string,
    correlationId: string,
    input: RamsMethodStatementGroupInput,
  ) {
    const name = cleanName(input.name);
    const steps = normalizeSteps(input.steps);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const group = await transaction.ramsMethodStatementGroup.create({
          data: {
            organisationId,
            name,
            normalisedName: normaliseName(name),
            description: input.description.trim(),
            steps: steps as unknown as Prisma.InputJsonValue,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'RamsMethodStatementGroupCreated',
            entityType: 'RamsMethodStatementGroup',
            entityId: group.id,
            data: { name: group.name },
          },
        });
        return { ...group, steps };
      });
    } catch (error: unknown) {
      this.translateDuplicate(
        error,
        'RAMS_METHOD_GROUP_EXISTS',
        'A RAMS method statement group with this name already exists.',
      );
    }
  }

  async updateMethodGroup(
    organisationId: string,
    groupId: string,
    actorUserId: string,
    correlationId: string,
    input: RamsMethodStatementGroupInput,
  ) {
    const current = await this.requireMethodGroup(organisationId, groupId);
    const name = cleanName(input.name);
    const steps = normalizeSteps(input.steps);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const group = await transaction.ramsMethodStatementGroup.update({
          where: { id: groupId },
          data: {
            name,
            normalisedName: normaliseName(name),
            description: input.description.trim(),
            steps: steps as unknown as Prisma.InputJsonValue,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'RamsMethodStatementGroupUpdated',
            entityType: 'RamsMethodStatementGroup',
            entityId: group.id,
            data: { previousName: current.name, name: group.name },
          },
        });
        return { ...group, steps };
      });
    } catch (error: unknown) {
      this.translateDuplicate(
        error,
        'RAMS_METHOD_GROUP_EXISTS',
        'A RAMS method statement group with this name already exists.',
      );
    }
  }

  async archiveMethodGroup(
    organisationId: string,
    groupId: string,
    actorUserId: string,
    correlationId: string,
  ): Promise<void> {
    const current = await this.requireMethodGroup(organisationId, groupId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.ramsMethodStatementGroup.update({
        where: { id: groupId },
        data: {
          status: 'ARCHIVED',
          normalisedName: `${current.normalisedName}#archived#${groupId}`,
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'RamsMethodStatementGroupArchived',
          entityType: 'RamsMethodStatementGroup',
          entityId: groupId,
          data: { name: current.name },
        },
      });
    });
  }

  async listHazards(organisationId: string, includeArchived = false) {
    const hazards = await this.prisma.ramsHazardLibraryItem.findMany({
      where: { organisationId, ...(includeArchived ? {} : { status: 'ACTIVE' as const }) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return hazards.map((hazard) => ({
      ...hazard,
      data: normalizeHazard(hazard.data as unknown as RamsHazard),
    }));
  }

  async createHazard(
    organisationId: string,
    actorUserId: string,
    correlationId: string,
    input: RamsLibraryHazardInput,
  ) {
    const name = cleanName(input.name);
    const data = normalizeHazard(input.data);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const hazard = await transaction.ramsHazardLibraryItem.create({
          data: {
            organisationId,
            name,
            normalisedName: normaliseName(name),
            description: input.description.trim(),
            isDefault: input.isDefault,
            data: data as unknown as Prisma.InputJsonValue,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'RamsLibraryHazardCreated',
            entityType: 'RamsHazardLibraryItem',
            entityId: hazard.id,
            data: { name: hazard.name },
          },
        });
        return { ...hazard, data };
      });
    } catch (error: unknown) {
      this.translateDuplicate(
        error,
        'RAMS_HAZARD_EXISTS',
        'A library hazard with this name already exists.',
      );
    }
  }

  async updateHazard(
    organisationId: string,
    hazardId: string,
    actorUserId: string,
    correlationId: string,
    input: RamsLibraryHazardInput,
  ) {
    const current = await this.requireHazard(organisationId, hazardId);
    const name = cleanName(input.name);
    const data = normalizeHazard(input.data);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const hazard = await transaction.ramsHazardLibraryItem.update({
          where: { id: hazardId },
          data: {
            name,
            normalisedName: normaliseName(name),
            description: input.description.trim(),
            isDefault: input.isDefault,
            data: data as unknown as Prisma.InputJsonValue,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'RamsLibraryHazardUpdated',
            entityType: 'RamsHazardLibraryItem',
            entityId: hazard.id,
            data: { previousName: current.name, name: hazard.name },
          },
        });
        return { ...hazard, data };
      });
    } catch (error: unknown) {
      this.translateDuplicate(
        error,
        'RAMS_HAZARD_EXISTS',
        'A library hazard with this name already exists.',
      );
    }
  }

  async archiveHazard(
    organisationId: string,
    hazardId: string,
    actorUserId: string,
    correlationId: string,
  ): Promise<void> {
    const current = await this.requireHazard(organisationId, hazardId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.ramsHazardLibraryItem.update({
        where: { id: hazardId },
        data: {
          status: 'ARCHIVED',
          normalisedName: `${current.normalisedName}#archived#${hazardId}`,
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'RamsLibraryHazardArchived',
          entityType: 'RamsHazardLibraryItem',
          entityId: hazardId,
          data: { name: current.name },
        },
      });
    });
  }

  private async requireTemplate(organisationId: string, templateId: string) {
    const template = await this.prisma.ramsTemplate.findFirst({
      where: { id: templateId, organisationId, status: 'ACTIVE' },
    });
    if (template === null)
      throw new DomainError('RAMS_TEMPLATE_NOT_FOUND', 'The RAMS template was not found.', 404);
    return template;
  }

  private async requireMethodGroup(organisationId: string, groupId: string) {
    const group = await this.prisma.ramsMethodStatementGroup.findFirst({
      where: { id: groupId, organisationId, status: 'ACTIVE' },
    });
    if (group === null)
      throw new DomainError(
        'RAMS_METHOD_GROUP_NOT_FOUND',
        'The RAMS method statement group was not found.',
        404,
      );
    return group;
  }

  private async requireHazard(organisationId: string, hazardId: string) {
    const hazard = await this.prisma.ramsHazardLibraryItem.findFirst({
      where: { id: hazardId, organisationId, status: 'ACTIVE' },
    });
    if (hazard === null)
      throw new DomainError('RAMS_HAZARD_NOT_FOUND', 'The library hazard was not found.', 404);
    return hazard;
  }

  private translateDuplicate(error: unknown, code: string, message: string): never {
    if (isUniqueConstraintError(error)) throw new DomainError(code, message, 409);
    throw error;
  }
}
