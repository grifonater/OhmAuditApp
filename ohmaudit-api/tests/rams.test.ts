import { describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { normalizeRamsDraft, RamsService, type RamsDraft } from '../src/rams/rams.service';

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
        organisation: 'OhmAudit',
        responsibility: 'Control the safe system of work.',
        contact: '07000 000001',
      },
    ],
  },
  methodStatement: {
    steps: [
      {
        id: 'step-a',
        title: 'Confirm isolation.',
        required: true,
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
            visitId: 'visit-a',
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
            visitId: 'visit-a',
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

  it('locks submitted RAMS against draft updates', async () => {
    const prisma = {
      rams: {
        findFirst: () =>
          Promise.resolve({
            id: 'rams-a',
            visitId: 'visit-a',
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
            visitId: 'visit-a',
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
            visitId: 'visit-a',
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
        data: { visitId: 'visit-a', revisionNumber: 2 },
      },
    });
  });
});
