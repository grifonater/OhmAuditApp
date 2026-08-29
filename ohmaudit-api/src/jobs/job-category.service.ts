import type { PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

function normaliseName(name: string): string {
  return name.trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase('en-GB');
}

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export class JobCategoryService {
  constructor(private readonly prisma: PrismaClient) {}

  list(organisationId: string) {
    return this.prisma.jobCategory.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ organisationId: null }, { organisationId }],
      },
      orderBy: [{ organisationId: 'asc' }, { name: 'asc' }],
    });
  }

  async create(organisationId: string, actorUserId: string, correlationId: string, name: string) {
    const cleanName = name.trim().replaceAll(/\s+/g, ' ');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.jobCategory.create({
          data: {
            organisationId,
            name: cleanName,
            normalisedName: normaliseName(cleanName),
          },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'JobCategoryCreated',
            entityType: 'JobCategory',
            entityId: category.id,
            data: { name: category.name },
          },
        });
        return category;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error))
        throw new DomainError(
          'JOB_CATEGORY_EXISTS',
          'A job category with this name already exists.',
          409,
        );
      throw error;
    }
  }

  async update(
    organisationId: string,
    categoryId: string,
    actorUserId: string,
    correlationId: string,
    name: string,
  ) {
    const current = await this.requireCustomCategory(organisationId, categoryId);
    const cleanName = name.trim().replaceAll(/\s+/g, ' ');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.jobCategory.update({
          where: { id: categoryId },
          data: { name: cleanName, normalisedName: normaliseName(cleanName) },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'JobCategoryUpdated',
            entityType: 'JobCategory',
            entityId: category.id,
            data: { previousName: current.name, name: category.name },
          },
        });
        return category;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error))
        throw new DomainError(
          'JOB_CATEGORY_EXISTS',
          'A job category with this name already exists.',
          409,
        );
      throw error;
    }
  }

  async archive(
    organisationId: string,
    categoryId: string,
    actorUserId: string,
    correlationId: string,
  ) {
    const current = await this.requireCustomCategory(organisationId, categoryId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.jobCategory.update({
        where: { id: categoryId },
        data: { status: 'ARCHIVED' },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'JobCategoryArchived',
          entityType: 'JobCategory',
          entityId: categoryId,
          data: { name: current.name },
        },
      });
    });
  }

  private async requireCustomCategory(organisationId: string, categoryId: string) {
    const category = await this.prisma.jobCategory.findFirst({
      where: { id: categoryId, organisationId },
    });
    if (category === null)
      throw new DomainError('JOB_CATEGORY_NOT_FOUND', 'The job category was not found.', 404);
    return category;
  }
}
