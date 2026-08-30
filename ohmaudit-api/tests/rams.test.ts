import { describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import {
  normalizeRamsDraft,
  RAMS_ACKNOWLEDGEMENT_STATEMENT,
  RamsService,
  type RamsDraft,
} from '../src/rams/rams.service';

const readyDraft: RamsDraft = normalizeRamsDraft({
  overview: {
    title: 'Distribution board replacement',
    category: 'Electrical',
    effectiveFrom: '2026-09-01',
  },
  scope: {
    scopeOfWorks: 'Replace and test the distribution board.',
    exclusions: [],
    engineerBriefing: [],
    keyActivities: ['Safe isolation'],
    workAreas: ['Main switch room'],
    workBoundaries: 'Barriered work zone.',
    responsibilities: [
      {
        id: 'responsibility-a',
        name: 'Lead engineer',
        role: 'Authorised electrician',
        responsibility: 'Control the safe system of work.',
      },
    ],
  },
  methodStatement: {
    steps: [
      {
        id: 'step-a',
        title: 'Confirm isolation.',
        detail: 'Prove the voltage indicator before and after isolation.',
      },
    ],
  },
  riskAssessment: {
    hazards: [
      {
        id: 'hazard-a',
        hazard: 'Electric shock',
        peopleAtRisk: 'Engineers',
        initialLikelihood: 4,
        initialSeverity: 5,
        controls: 'Safe isolation, prove dead and lock off.',
        residualLikelihood: 1,
        residualSeverity: 5,
        howHarmed: 'Contact with live conductors can cause shock or burns.',
      },
    ],
  },
  requirements: {
    ppe: ['Safety glasses'],
    tools: ['Approved voltage indicator'],
    competencies: ['Electrical safe isolation'],
    emergencyArrangements: ['Emergency contact numbers confirmed'],
    emergencyDetails: {
      contactName: 'Site control',
      contactNumber: '07000 000000',
      nearestHospital: '',
      hospitalAddress: '',
      assemblyPoint: 'Main gate',
      additionalInfo: '',
    },
  },
  supportingInformation: {
    siteAccess: '',
    permits: '',
    welfare: '',
    environmental: '',
    references: [],
  },
  review: { approvalMode: 'REVIEWER', requireEngineerAcknowledgement: true },
});

describe('RAMS workflow', () => {
  it('creates a new RAMS and join row for every visit-scoped create', async () => {
    let createInput: unknown;
    const create = vi.fn((input: unknown) => {
      createInput = input;
      return Promise.resolve({
        id: 'rams-new',
        reference: 'RAMS-JOB-1',
        title: 'RAMS - Board replacement',
      });
    });
    const transaction = {
      rams: { create, count: () => Promise.resolve(0) },
      auditEvent: { create: () => Promise.resolve({ id: 'audit-a' }) },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      visit: {
        findFirst: () =>
          Promise.resolve({
            id: 'visit-a',
            reference: 'JOB',
            title: 'Board replacement',
            description: null,
            exclusions: null,
            engineerNotes: null,
            scheduledStart: new Date('2026-09-01T09:00:00.000Z'),
            site: {
              accessInstructions: null,
              parkingInformation: null,
              ppeRequirements: 'Safety footwear',
              inductionInformation: null,
            },
            jobCategory: null,
          }),
      },
      ramsRequirementDefaults: {
        findUnique: () =>
          Promise.resolve({
            ppe: ['Safety footwear', 'Arc-rated clothing'],
            tools: ['Inspected tools'],
            competencies: ['Authorised electrician'],
            emergencyArrangements: ['Follow the site emergency procedure'],
            welfare: ['Confirm welfare facilities'],
            plant: ['Authorised operators only'],
          }),
      },
      ramsHazardLibraryItem: { findMany: () => Promise.resolve([]) },
      rams: {
        findFirst: () =>
          Promise.resolve({
            id: 'rams-new',
            draftData: {},
            visits: [],
            revisions: [],
          }),
      },
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    await new RamsService(prisma).create('organisation-a', 'visit-a', 'user-a', 'correlation-a');

    expect(createInput).toMatchObject({
      data: {
        organisationId: 'organisation-a',
        visits: { create: { visitId: 'visit-a' } },
        draftData: {
          requirements: {
            ppe: ['Safety footwear', 'Arc-rated clothing'],
            tools: ['Inspected tools'],
            competencies: ['Authorised electrician'],
            emergencyArrangements: ['Follow the site emergency procedure'],
            welfare: ['Confirm welfare facilities'],
            plant: ['Authorised operators only'],
          },
        },
      },
    });
  });

  it('creates an immutable revision and audit event when a ready draft is submitted', async () => {
    let revisionInput: unknown;
    let updateInput: unknown;
    let auditInput: unknown;
    const revisionCreate = vi.fn((input: unknown) => {
      revisionInput = input;
      return Promise.resolve({ id: 'revision-a' });
    });
    const ramsUpdate = vi.fn((input: unknown) => {
      updateInput = input;
      return Promise.resolve({ id: 'rams-a', status: 'UNDER_REVIEW', currentRevisionNumber: 1 });
    });
    const auditCreate = vi.fn((input: unknown) => {
      auditInput = input;
      return Promise.resolve({ id: 'audit-a' });
    });
    const transaction = {
      ramsRevision: { create: revisionCreate },
      rams: { update: ramsUpdate },
      auditEvent: { create: auditCreate },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      rams: {
        findFirst: () =>
          Promise.resolve({
            id: 'rams-a',
            visits: [{ visitId: 'visit-a' }],
            status: 'DRAFT',
            currentRevisionNumber: 0,
            draftData: readyDraft,
          }),
      },
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    await new RamsService(prisma).submit('organisation-a', 'rams-a', 'user-a', 'correlation-a');

    expect(revisionInput).toMatchObject({
      data: {
        organisationId: 'organisation-a',
        ramsId: 'rams-a',
        revisionNumber: 1,
        data: readyDraft,
        contextSnapshot: {
          job: { id: 'visit-a' },
          organisation: { name: '', addressLines: [] },
        },
        createdByUserId: 'user-a',
      },
    });
    expect(updateInput).toMatchObject({
      where: { id: 'rams-a' },
      data: { status: 'UNDER_REVIEW', currentRevisionNumber: 1 },
    });
    expect(auditInput).toMatchObject({
      data: {
        eventType: 'RamsSubmitted',
        entityType: 'Rams',
        entityId: 'rams-a',
      },
    });
  });

  it('does not submit a draft with missing safety sections', async () => {
    const prisma = {
      rams: {
        findFirst: () =>
          Promise.resolve({
            id: 'rams-a',
            visits: [{ visitId: 'visit-a' }],
            status: 'DRAFT',
            currentRevisionNumber: 0,
            draftData: { ...readyDraft, methodStatement: { steps: [] } },
          }),
      },
    } as unknown as PrismaClient;

    await expect(
      new RamsService(prisma).submit('organisation-a', 'rams-a', 'user-a', 'correlation-a'),
    ).rejects.toMatchObject({ code: 'RAMS_NOT_READY', status: 422 });
  });

  it('allows a ready draft with no responsibility rows', async () => {
    const transaction = {
      ramsRevision: { create: () => Promise.resolve({ id: 'revision-a' }) },
      rams: {
        update: () =>
          Promise.resolve({ id: 'rams-a', status: 'UNDER_REVIEW', currentRevisionNumber: 1 }),
      },
      auditEvent: { create: () => Promise.resolve({ id: 'audit-a' }) },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      rams: {
        findFirst: () =>
          Promise.resolve({
            id: 'rams-a',
            visits: [{ visitId: 'visit-a' }],
            status: 'DRAFT',
            currentRevisionNumber: 0,
            draftData: {
              ...readyDraft,
              scope: { ...readyDraft.scope, responsibilities: [] },
            },
          }),
      },
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    await expect(
      new RamsService(prisma).submit('organisation-a', 'rams-a', 'user-a', 'correlation-a'),
    ).resolves.toMatchObject({ status: 'UNDER_REVIEW' });
  });

  it('rejects an entered responsibility row unless all required values are present', async () => {
    const prisma = {
      rams: {
        findFirst: () =>
          Promise.resolve({
            id: 'rams-a',
            visits: [{ visitId: 'visit-a' }],
            status: 'DRAFT',
            currentRevisionNumber: 0,
            draftData: {
              ...readyDraft,
              scope: {
                ...readyDraft.scope,
                responsibilities: [{ id: 'person-a', name: 'Alex', role: '', responsibility: '' }],
              },
            },
          }),
      },
    } as unknown as PrismaClient;

    await expect(
      new RamsService(prisma).submit('organisation-a', 'rams-a', 'user-a', 'correlation-a'),
    ).rejects.toMatchObject({ code: 'RAMS_NOT_READY', status: 422 });
  });

  it('returns immutable revision data and upgrades a legacy singular context snapshot', async () => {
    const prisma = {
      ramsRevision: {
        findFirst: () =>
          Promise.resolve({
            id: 'revision-a',
            organisationId: 'organisation-a',
            ramsId: 'rams-a',
            revisionNumber: 1,
            data: readyDraft,
            contextSnapshot: {
              organisation: { name: 'OhmAudit', addressLines: [] },
              job: {
                id: 'visit-a',
                title: 'Board replacement',
                plannedStart: '2026-09-01T09:00:00.000Z',
              },
              customer: { name: 'Customer' },
              site: { name: 'Site', addressLines: [] },
              people: {},
            },
            createdBy: { id: 'user-a', displayName: 'Alex', email: 'alex@example.com' },
            acknowledgements: [],
          }),
      },
    } as unknown as PrismaClient;

    const revision = await new RamsService(prisma).revisionDetail('organisation-a', 'rams-a', 1);

    expect(revision.data).toEqual(readyDraft);
    expect(revision.contextSnapshot).toMatchObject({
      job: { id: 'visit-a' },
      jobs: [{ job: { id: 'visit-a' }, customer: { name: 'Customer' } }],
    });
  });

  it('locks submitted RAMS against draft updates', async () => {
    const prisma = {
      rams: {
        findFirst: () =>
          Promise.resolve({
            id: 'rams-a',
            visits: [{ visitId: 'visit-a' }],
            status: 'UNDER_REVIEW',
            currentRevisionNumber: 1,
            draftData: readyDraft,
          }),
      },
    } as unknown as PrismaClient;

    await expect(
      new RamsService(prisma).update(
        'organisation-a',
        'rams-a',
        'user-a',
        'correlation-a',
        readyDraft,
      ),
    ).rejects.toMatchObject({ code: 'RAMS_LOCKED', status: 409 });
  });

  it('requires a reason before returning RAMS', async () => {
    const prisma = {
      rams: {
        findFirst: () =>
          Promise.resolve({
            id: 'rams-a',
            visits: [{ visitId: 'visit-a' }],
            status: 'UNDER_REVIEW',
            currentRevisionNumber: 1,
          }),
      },
    } as unknown as PrismaClient;

    await expect(
      new RamsService(prisma).review('organisation-a', 'rams-a', 'reviewer-a', 'correlation-a', {
        action: 'RETURN',
      }),
    ).rejects.toMatchObject({ code: 'RAMS_REVIEW_COMMENT_REQUIRED', status: 422 });
  });

  it('records approval and its audit event atomically', async () => {
    let updateInput: unknown;
    let auditInput: unknown;
    const ramsUpdate = vi.fn((input: unknown) => {
      updateInput = input;
      return Promise.resolve({ id: 'rams-a', status: 'APPROVED' });
    });
    const auditCreate = vi.fn((input: unknown) => {
      auditInput = input;
      return Promise.resolve({ id: 'audit-a' });
    });
    const transaction = {
      rams: { update: ramsUpdate },
      auditEvent: { create: auditCreate },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      rams: {
        findFirst: () =>
          Promise.resolve({
            id: 'rams-a',
            visits: [{ visitId: 'visit-a' }],
            status: 'UNDER_REVIEW',
            currentRevisionNumber: 2,
          }),
      },
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    await new RamsService(prisma).review(
      'organisation-a',
      'rams-a',
      'reviewer-a',
      'correlation-a',
      { action: 'APPROVE', comment: 'Ready for issue.' },
    );

    expect(updateInput).toMatchObject({
      where: { id: 'rams-a' },
      data: {
        status: 'APPROVED',
        reviewedByUserId: 'reviewer-a',
        approvedByUserId: 'reviewer-a',
        reviewComment: 'Ready for issue.',
      },
    });
    expect(auditInput).toMatchObject({
      data: {
        eventType: 'RamsApproved',
        data: { visitIds: ['visit-a'], revisionNumber: 2 },
      },
    });
  });

  it('signs the current approved revision with immutable signer and statement snapshots', async () => {
    let acknowledgementInput: unknown;
    let auditInput: unknown;
    const transaction = {
      ramsAcknowledgement: {
        create: (input: unknown) => {
          acknowledgementInput = input;
          return Promise.resolve({ id: 'ack-a' });
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
      rams: {
        findFirst: () =>
          Promise.resolve({ id: 'rams-a', status: 'APPROVED', currentRevisionNumber: 3 }),
      },
      visit: { findFirst: () => Promise.resolve({ id: 'visit-a' }) },
      ramsVisit: { findUnique: () => Promise.resolve({ ramsId: 'rams-a' }) },
      ramsRevision: {
        findUnique: () => Promise.resolve({ id: 'revision-a', revisionNumber: 3 }),
      },
      $transaction: (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaClient;

    await new RamsService(prisma).signAcknowledgement(
      'organisation-a',
      'rams-a',
      'visit-a',
      {
        subject: 'user:user-a',
        name: 'Alex Engineer',
        email: 'alex@example.com',
        role: 'Engineer',
        actorUserId: 'user-a',
      },
      'data:image/png;base64,AAAA',
      'correlation-a',
    );

    expect(acknowledgementInput).toMatchObject({
      data: {
        organisationId: 'organisation-a',
        ramsRevisionId: 'revision-a',
        visitId: 'visit-a',
        signerSubject: 'user:user-a',
        signerName: 'Alex Engineer',
        signerEmail: 'alex@example.com',
        signerRole: 'Engineer',
        statement: RAMS_ACKNOWLEDGEMENT_STATEMENT,
      },
    });
    expect(auditInput).toMatchObject({
      data: {
        actorUserId: 'user-a',
        eventType: 'RamsAcknowledged',
        data: { acknowledgementId: 'ack-a', revisionNumber: 3, visitId: 'visit-a' },
      },
    });
  });

  it('rejects acknowledgement unless the linked revision is current and approved', async () => {
    const prisma = {
      rams: {
        findFirst: () =>
          Promise.resolve({ id: 'rams-a', status: 'UNDER_REVIEW', currentRevisionNumber: 3 }),
      },
      visit: { findFirst: () => Promise.resolve({ id: 'visit-a' }) },
      ramsVisit: { findUnique: () => Promise.resolve({ ramsId: 'rams-a' }) },
    } as unknown as PrismaClient;

    await expect(
      new RamsService(prisma).signAcknowledgement(
        'organisation-a',
        'rams-a',
        'visit-a',
        { subject: 'user:user-a', name: 'Alex', role: 'Engineer' },
        'data:image/png;base64,AAAA',
        'correlation-a',
      ),
    ).rejects.toMatchObject({ code: 'RAMS_ACKNOWLEDGEMENT_NOT_ALLOWED', status: 409 });
  });

  it('scopes guest acknowledgement status to the guest signer subject', async () => {
    let acknowledgementQuery: unknown;
    const prisma = {
      rams: {
        findFirst: () =>
          Promise.resolve({ id: 'rams-a', status: 'APPROVED', currentRevisionNumber: 3 }),
      },
      visit: { findFirst: () => Promise.resolve({ id: 'visit-a' }) },
      ramsVisit: { findUnique: () => Promise.resolve({ ramsId: 'rams-a' }) },
      ramsAcknowledgement: {
        findMany: (input: unknown) => {
          acknowledgementQuery = input;
          return Promise.resolve([]);
        },
      },
    } as unknown as PrismaClient;

    await new RamsService(prisma).listAcknowledgements(
      'organisation-a',
      'rams-a',
      'visit-a',
      'guest-visit:visit-a',
    );

    expect(acknowledgementQuery).toMatchObject({
      where: {
        organisationId: 'organisation-a',
        visitId: 'visit-a',
        signerSubject: 'guest-visit:visit-a',
        revision: { ramsId: 'rams-a', revisionNumber: 3 },
      },
    });
  });
});
