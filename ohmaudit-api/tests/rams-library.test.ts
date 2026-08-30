import { describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { RamsLibraryService } from '../src/rams/rams-library.service';
import { normalizeRamsDraft, RamsService } from '../src/rams/rams.service';

const draft = normalizeRamsDraft({
  overview: { title: 'Board replacement', category: 'Electrical' },
  scope: {
    workAreas: ['Main switch room'],
    workBoundaries: 'Barriered work area',
    responsibilities: [
      {
        id: 'person-a',
        name: 'Site engineer',
        role: 'Engineer',
        organisation: 'OhmAudit',
        responsibility: 'Control the work area',
        contact: '07000 000000',
      },
    ],
  },
  requirements: {
    ppe: ['Site-mandated PPE'],
    emergencyDetails: { contactName: 'Site control', assemblyPoint: 'Main gate' },
  },
  supportingInformation: {
    siteAccess: 'Use the north gate and park in bay 4',
    permits: 'Complete the site induction',
  },
  methodStatement: {
    steps: [{ id: 'step-a', title: 'Isolate', required: true }],
  },
});

describe('RAMS library', () => {
  it('tenant-scopes active template and method-group listings', async () => {
    const templateFindMany = vi.fn(() => Promise.resolve([]));
    const groupFindMany = vi.fn(() => Promise.resolve([]));
    const prisma = {
      ramsTemplate: { findMany: templateFindMany },
      ramsMethodStatementGroup: { findMany: groupFindMany },
    } as unknown as PrismaClient;
    const service = new RamsLibraryService(prisma);

    await service.listTemplates('organisation-a');
    await service.listMethodGroups('organisation-a');

    expect(templateFindMany).toHaveBeenCalledWith({
      where: { organisationId: 'organisation-a', status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
    expect(groupFindMany).toHaveBeenCalledWith({
      where: { organisationId: 'organisation-a', status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  });

  it('cleans names, normalizes complete template data, and audits creation atomically', async () => {
    let createInput: unknown;
    let auditInput: unknown;
    const transaction = {
      ramsTemplate: {
        create: (input: unknown) => {
          createInput = input;
          return Promise.resolve({ id: 'template-a', name: 'Board replacement', data: {} });
        },
      },
      auditEvent: {
        create: (input: unknown) => {
          auditInput = input;
          return Promise.resolve({ id: 'audit-a' });
        },
      },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    const template = await new RamsLibraryService(prisma).createTemplate(
      'organisation-a',
      'user-a',
      'correlation-a',
      { name: '  Board   replacement ', description: ' Reusable work ', data: draft },
    );

    expect(createInput).toMatchObject({
      data: {
        organisationId: 'organisation-a',
        name: 'Board replacement',
        normalisedName: 'board replacement',
        description: 'Reusable work',
        data: {
          schemaVersion: 2,
          overview: { title: '', category: '' },
          scope: { workAreas: [], workBoundaries: '', responsibilities: [] },
          requirements: { ppe: [], emergencyDetails: { contactName: '', assemblyPoint: '' } },
          supportingInformation: { siteAccess: '', permits: '' },
        },
      },
    });
    expect(template.data).toMatchObject({
      schemaVersion: 2,
      methodStatement: {
        steps: [
          {
            id: 'step-a',
            title: 'Isolate',
            required: true,
            detail: '',
            responsibility: '',
            estimatedMinutes: 0,
          },
        ],
      },
    });
    expect(auditInput).toMatchObject({
      data: {
        organisationId: 'organisation-a',
        eventType: 'RamsTemplateCreated',
        entityType: 'RamsTemplate',
        entityId: 'template-a',
      },
    });
  });

  it('normalizes all method-step fields when creating a group', async () => {
    let createInput: unknown;
    const transaction = {
      ramsMethodStatementGroup: {
        create: (input: unknown) => {
          createInput = input;
          return Promise.resolve({ id: 'group-a', name: 'Isolation', steps: [] });
        },
      },
      auditEvent: { create: () => Promise.resolve({ id: 'audit-a' }) },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    const group = await new RamsLibraryService(prisma).createMethodGroup(
      'organisation-a',
      'user-a',
      'correlation-a',
      {
        name: 'Isolation',
        description: '',
        steps: [
          {
            id: 'step-a',
            title: 'Isolate',
            required: true,
            detail: undefined as unknown as string,
            responsibility: undefined as unknown as string,
            estimatedMinutes: undefined as unknown as number,
          },
        ],
      },
    );

    expect(createInput).toMatchObject({
      data: {
        steps: [
          {
            id: 'step-a',
            title: 'Isolate',
            required: true,
            detail: '',
            responsibility: '',
            estimatedMinutes: 0,
          },
        ],
      },
    });
    expect(group.steps).toEqual(
      expect.arrayContaining([expect.objectContaining({ detail: '', estimatedMinutes: 0 })]),
    );
  });

  it('archives only an active template in the tenant and records its audit event', async () => {
    let lookup: unknown;
    let updateInput: unknown;
    let auditInput: unknown;
    const transaction = {
      ramsTemplate: {
        update: (input: unknown) => {
          updateInput = input;
          return Promise.resolve({ id: 'template-a' });
        },
      },
      auditEvent: {
        create: (input: unknown) => {
          auditInput = input;
          return Promise.resolve({ id: 'audit-a' });
        },
      },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      ramsTemplate: {
        findFirst: (input: unknown) => {
          lookup = input;
          return Promise.resolve({
            id: 'template-a',
            name: 'Isolation',
            normalisedName: 'isolation',
          });
        },
      },
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    await new RamsLibraryService(prisma).archiveTemplate(
      'organisation-a',
      'template-a',
      'user-a',
      'correlation-a',
    );

    expect(lookup).toEqual({
      where: { id: 'template-a', organisationId: 'organisation-a', status: 'ACTIVE' },
    });
    expect(updateInput).toEqual({
      where: { id: 'template-a' },
      data: {
        status: 'ARCHIVED',
        normalisedName: 'isolation#archived#template-a',
      },
    });
    expect(auditInput).toMatchObject({
      data: { eventType: 'RamsTemplateArchived', entityId: 'template-a' },
    });
  });

  it('rejects cross-tenant group updates before opening a transaction', async () => {
    const transaction = vi.fn();
    const prisma = {
      ramsMethodStatementGroup: { findFirst: () => Promise.resolve(null) },
      $transaction: transaction,
    } as unknown as PrismaClient;

    await expect(
      new RamsLibraryService(prisma).updateMethodGroup(
        'organisation-a',
        'group-b',
        'user-a',
        'correlation-a',
        { name: 'Isolation', description: '', steps: [] },
      ),
    ).rejects.toMatchObject({ code: 'RAMS_METHOD_GROUP_NOT_FOUND', status: 404 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('translates duplicate normalized names into a 409 domain error', async () => {
    const prisma = {
      $transaction: () => Promise.reject(Object.assign(new Error('Duplicate'), { code: 'P2002' })),
    } as unknown as PrismaClient;

    await expect(
      new RamsLibraryService(prisma).createTemplate('organisation-a', 'user-a', 'correlation-a', {
        name: 'Isolation',
        description: '',
        data: draft,
      }),
    ).rejects.toMatchObject({ code: 'RAMS_TEMPLATE_EXISTS', status: 409 });
  });

  it('selects tenant-wide RAMS summaries with job and workflow people context', async () => {
    let query: unknown;
    const prisma = {
      rams: {
        findMany: (input: unknown) => {
          query = input;
          return Promise.resolve([]);
        },
      },
    } as unknown as PrismaClient;

    await new RamsService(prisma).listOrganisation('organisation-a');

    expect(query).toMatchObject({
      where: { organisationId: 'organisation-a' },
      select: {
        visit: {
          select: {
            customer: { select: { id: true, name: true } },
            site: { select: { id: true, name: true } },
          },
        },
        preparedBy: { select: { id: true, displayName: true, email: true } },
        reviewedBy: { select: { id: true, displayName: true, email: true } },
        approvedBy: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  });
});
