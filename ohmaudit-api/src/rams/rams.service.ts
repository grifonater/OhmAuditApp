import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

export interface RamsMethodStep {
  id: string;
  title: string;
  required: boolean;
  detail: string;
  responsibility: string;
  estimatedMinutes: number;
}

export interface RamsHazard {
  id: string;
  hazard: string;
  peopleAtRisk: string;
  initialLikelihood: number;
  initialSeverity: number;
  controls: string;
  residualLikelihood: number;
  residualSeverity: number;
  howHarmed: string;
  furtherActions: string;
  actionOwner: string;
  actionDueDate: string;
  actionStatus: 'OPEN' | 'CONTROLLED';
}

export interface RamsNamedReference {
  id: string;
  name: string;
  reference: string;
}

export interface RamsDraft {
  schemaVersion?: 2;
  overview: {
    title: string;
    category: string;
    effectiveFrom: string;
    reviewBy: string;
    revisionSummary: string;
  };
  scope: {
    scopeOfWorks: string;
    exclusions: string[];
    engineerBriefing: string[];
    keyActivities: string[];
    assumptions: string[];
    workAreas: string[];
    workBoundaries: string;
    responsibilities: Array<{
      id: string;
      name: string;
      role: string;
      organisation: string;
      responsibility: string;
      contact: string;
    }>;
  };
  methodStatement: { steps: RamsMethodStep[] };
  riskAssessment: { hazards: RamsHazard[] };
  requirements: {
    ppe: string[];
    tools: string[];
    competencies: string[];
    emergencyArrangements: string[];
    plant: string[];
    materials: string[];
    training: string[];
    substances: string[];
    welfare: string[];
    emergencyDetails: {
      contactName: string;
      contactNumber: string;
      nearestHospital: string;
      hospitalAddress: string;
      assemblyPoint: string;
      additionalInfo: string;
    };
  };
  supportingInformation: {
    siteAccess: string;
    permits: string;
    welfare: string;
    environmental: string;
    references: Array<{ id: string; title: string; url: string }>;
    permitReferences: RamsNamedReference[];
    coshhReferences: RamsNamedReference[];
    workingAtHeightReferences: RamsNamedReference[];
    legislationReferences: RamsNamedReference[];
    documents: Array<{ id: string; name: string; type: string; reference: string; status: string }>;
    electricalSafety: string[];
  };
  review: {
    approvalMode: 'AUTHOR' | 'REVIEWER';
    requireEngineerAcknowledgement: boolean;
    internalNotes: string;
    changeImpact: 'LOW' | 'MEDIUM' | 'HIGH';
    revisionReason: string;
    changeSummary: string;
  };
}

type RamsPerson = { id: string; displayName: string | null; email: string };

export interface RamsContextSnapshot {
  organisation: { name: string; addressLines: string[] };
  job: {
    id: string;
    reference: string | null;
    externalReference: string | null;
    title: string;
    category: string | null;
    jobType: string | null;
    plannedStart: string;
    targetCompletion: string | null;
  };
  customer: { name: string };
  site: { name: string; addressLines: string[] };
  people: {
    preparedBy: RamsPerson;
    reviewedBy?: RamsPerson;
    approvedBy?: RamsPerson;
    assignedEngineer?: RamsPerson;
  };
}

export interface RamsRenderPayload extends RamsContextSnapshot {
  templateVersion: 'rams-a4-v1';
  documentState: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED';
  revisionNumber: number | null;
  reference: string;
  title: string;
  effectiveFrom: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  reviewComment: string | null;
  generatedAt: string;
  data: RamsDraft;
  revisionHistory: Array<{
    revisionNumber: number;
    createdAt: string;
    createdBy: RamsPerson;
    status: string;
    summary: string;
  }>;
}

const personSelect = { id: true, displayName: true, email: true } as const;
interface RamsSnapshotSource {
  visitId: string;
  title: string;
  organisation?: {
    name: string;
    brandProfile?: {
      tradingName: string | null;
      registeredName: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
      county: string | null;
      postcode: string | null;
      countryCode: string;
    } | null;
  } | null;
  visit?: {
    id: string;
    reference: string | null;
    externalReference: string | null;
    title: string;
    jobType: string | null;
    scheduledStart: Date;
    scheduledEnd: Date | null;
    customer: { name: string };
    site: {
      name: string;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
      county: string | null;
      postcode: string | null;
      countryCode: string;
    };
    jobCategory: { name: string } | null;
    assignedUser: RamsPerson | null;
  } | null;
  preparedBy?: RamsPerson | null;
  reviewedBy?: RamsPerson | null;
  approvedBy?: RamsPerson | null;
}
type RamsJsonKey =
  | 'overview'
  | 'scope'
  | 'methodStatement'
  | 'riskAssessment'
  | 'requirements'
  | 'emergencyDetails'
  | 'supportingInformation'
  | 'review'
  | 'id'
  | 'name'
  | 'reference'
  | 'title'
  | 'category'
  | 'effectiveFrom'
  | 'reviewBy'
  | 'revisionSummary'
  | 'scopeOfWorks'
  | 'exclusions'
  | 'engineerBriefing'
  | 'keyActivities'
  | 'assumptions'
  | 'workAreas'
  | 'workBoundaries'
  | 'responsibilities'
  | 'role'
  | 'organisation'
  | 'responsibility'
  | 'contact'
  | 'steps'
  | 'required'
  | 'detail'
  | 'estimatedMinutes'
  | 'hazards'
  | 'hazard'
  | 'peopleAtRisk'
  | 'initialLikelihood'
  | 'initialSeverity'
  | 'controls'
  | 'residualLikelihood'
  | 'residualSeverity'
  | 'howHarmed'
  | 'furtherActions'
  | 'actionOwner'
  | 'actionDueDate'
  | 'actionStatus'
  | 'ppe'
  | 'tools'
  | 'competencies'
  | 'emergencyArrangements'
  | 'plant'
  | 'materials'
  | 'training'
  | 'substances'
  | 'welfare'
  | 'contactName'
  | 'contactNumber'
  | 'nearestHospital'
  | 'hospitalAddress'
  | 'assemblyPoint'
  | 'additionalInfo'
  | 'siteAccess'
  | 'permits'
  | 'environmental'
  | 'references'
  | 'url'
  | 'permitReferences'
  | 'coshhReferences'
  | 'workingAtHeightReferences'
  | 'legislationReferences'
  | 'documents'
  | 'type'
  | 'status'
  | 'electricalSafety'
  | 'approvalMode'
  | 'requireEngineerAcknowledgement'
  | 'internalNotes'
  | 'changeImpact'
  | 'revisionReason'
  | 'changeSummary'
  | 'job'
  | 'customer'
  | 'site'
  | 'people'
  | 'addressLines'
  | 'displayName'
  | 'email'
  | 'externalReference'
  | 'jobType'
  | 'plannedStart'
  | 'targetCompletion'
  | 'preparedBy'
  | 'reviewedBy'
  | 'approvedBy'
  | 'assignedEngineer';
type RamsJsonRecord = Record<string, unknown> & Partial<Record<RamsJsonKey, unknown>>;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const record = (value: unknown): RamsJsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RamsJsonRecord)
    : {};
const records = (value: unknown): RamsJsonRecord[] =>
  Array.isArray(value) ? value.map(record) : [];
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Converts persisted legacy RAMS JSON and partial v2 data into the canonical v2 document shape. */
export function normalizeRamsDraft(value: unknown): RamsDraft {
  const source = record(value);
  const overview = record(source.overview);
  const scope = record(source.scope);
  const methodStatement = record(source.methodStatement);
  const riskAssessment = record(source.riskAssessment);
  const requirements = record(source.requirements);
  const emergencyDetails = record(requirements.emergencyDetails);
  const supporting = record(source.supportingInformation);
  const review = record(source.review);
  const namedReferences = (input: unknown): RamsNamedReference[] =>
    records(input).map((item) => ({
      id: text(item.id),
      name: text(item.name),
      reference: text(item.reference),
    }));

  return {
    schemaVersion: 2,
    overview: {
      title: text(overview.title),
      category: text(overview.category),
      effectiveFrom: text(overview.effectiveFrom),
      reviewBy: text(overview.reviewBy),
      revisionSummary: text(overview.revisionSummary),
    },
    scope: {
      scopeOfWorks: text(scope.scopeOfWorks),
      exclusions: strings(scope.exclusions),
      engineerBriefing: strings(scope.engineerBriefing),
      keyActivities: strings(scope.keyActivities),
      assumptions: strings(scope.assumptions),
      workAreas: strings(scope.workAreas),
      workBoundaries: text(scope.workBoundaries),
      responsibilities: records(scope.responsibilities).map((item) => ({
        id: text(item.id),
        name: text(item.name),
        role: text(item.role),
        organisation: text(item.organisation),
        responsibility: text(item.responsibility),
        contact: text(item.contact),
      })),
    },
    methodStatement: {
      steps: records(methodStatement.steps).map((item) => ({
        id: text(item.id),
        title: text(item.title),
        required: typeof item.required === 'boolean' ? item.required : false,
        detail: text(item.detail),
        responsibility: text(item.responsibility),
        estimatedMinutes: number(item.estimatedMinutes, 0),
      })),
    },
    riskAssessment: {
      hazards: records(riskAssessment.hazards).map((item) => ({
        id: text(item.id),
        hazard: text(item.hazard),
        peopleAtRisk: text(item.peopleAtRisk),
        initialLikelihood: number(item.initialLikelihood, 1),
        initialSeverity: number(item.initialSeverity, 1),
        controls: text(item.controls),
        residualLikelihood: number(item.residualLikelihood, 1),
        residualSeverity: number(item.residualSeverity, 1),
        howHarmed: text(item.howHarmed),
        furtherActions: text(item.furtherActions),
        actionOwner: text(item.actionOwner),
        actionDueDate: text(item.actionDueDate),
        actionStatus: item.actionStatus === 'CONTROLLED' ? 'CONTROLLED' : 'OPEN',
      })),
    },
    requirements: {
      ppe: strings(requirements.ppe),
      tools: strings(requirements.tools),
      competencies: strings(requirements.competencies),
      emergencyArrangements: strings(requirements.emergencyArrangements),
      plant: strings(requirements.plant),
      materials: strings(requirements.materials),
      training: strings(requirements.training),
      substances: strings(requirements.substances),
      welfare: strings(requirements.welfare),
      emergencyDetails: {
        contactName: text(emergencyDetails.contactName),
        contactNumber: text(emergencyDetails.contactNumber),
        nearestHospital: text(emergencyDetails.nearestHospital),
        hospitalAddress: text(emergencyDetails.hospitalAddress),
        assemblyPoint: text(emergencyDetails.assemblyPoint),
        additionalInfo: text(emergencyDetails.additionalInfo),
      },
    },
    supportingInformation: {
      siteAccess: text(supporting.siteAccess),
      permits: text(supporting.permits),
      welfare: text(supporting.welfare),
      environmental: text(supporting.environmental),
      references: records(supporting.references).map((item) => ({
        id: text(item.id),
        title: text(item.title),
        url: text(item.url),
      })),
      permitReferences: namedReferences(supporting.permitReferences),
      coshhReferences: namedReferences(supporting.coshhReferences),
      workingAtHeightReferences: namedReferences(supporting.workingAtHeightReferences),
      legislationReferences: namedReferences(supporting.legislationReferences),
      documents: records(supporting.documents).map((item) => ({
        id: text(item.id),
        name: text(item.name),
        type: text(item.type),
        reference: text(item.reference),
        status: text(item.status),
      })),
      electricalSafety: strings(supporting.electricalSafety),
    },
    review: {
      approvalMode: review.approvalMode === 'AUTHOR' ? 'AUTHOR' : 'REVIEWER',
      requireEngineerAcknowledgement:
        typeof review.requireEngineerAcknowledgement === 'boolean'
          ? review.requireEngineerAcknowledgement
          : true,
      internalNotes: text(review.internalNotes),
      changeImpact:
        review.changeImpact === 'MEDIUM' || review.changeImpact === 'HIGH'
          ? review.changeImpact
          : 'LOW',
      revisionReason: text(review.revisionReason),
      changeSummary: text(review.changeSummary),
    },
  };
}

const addressLines = (...values: Array<string | null | undefined>): string[] =>
  values.filter((value): value is string => Boolean(value?.trim()));
const iso = (value: Date | string | null | undefined): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : value;
const emptyPerson = (): RamsPerson => ({ id: '', displayName: null, email: '' });

function normalizeSnapshot(value: unknown): RamsContextSnapshot {
  const snapshot = record(value);
  const organisation = record(snapshot.organisation);
  const job = record(snapshot.job);
  const customer = record(snapshot.customer);
  const site = record(snapshot.site);
  const people = record(snapshot.people);
  const person = (input: unknown): RamsPerson | undefined => {
    const item = record(input);
    if (Object.keys(item).length === 0) return undefined;
    return {
      id: text(item.id),
      displayName: typeof item.displayName === 'string' ? item.displayName : null,
      email: text(item.email),
    };
  };
  const reviewedBy = person(people.reviewedBy);
  const approvedBy = person(people.approvedBy);
  const assignedEngineer = person(people.assignedEngineer);
  return {
    organisation: {
      name: text(organisation.name),
      addressLines: strings(organisation.addressLines),
    },
    job: {
      id: text(job.id),
      reference: typeof job.reference === 'string' ? job.reference : null,
      externalReference: typeof job.externalReference === 'string' ? job.externalReference : null,
      title: text(job.title),
      category: typeof job.category === 'string' ? job.category : null,
      jobType: typeof job.jobType === 'string' ? job.jobType : null,
      plannedStart: text(job.plannedStart),
      targetCompletion: typeof job.targetCompletion === 'string' ? job.targetCompletion : null,
    },
    customer: { name: text(customer.name) },
    site: { name: text(site.name), addressLines: strings(site.addressLines) },
    people: {
      preparedBy: person(people.preparedBy) ?? emptyPerson(),
      ...(reviewedBy === undefined ? {} : { reviewedBy }),
      ...(approvedBy === undefined ? {} : { approvedBy }),
      ...(assignedEngineer === undefined ? {} : { assignedEngineer }),
    },
  };
}

export class RamsService {
  constructor(private readonly prisma: PrismaClient) {}

  listOrganisation(organisationId: string) {
    return this.prisma.rams.findMany({
      where: { organisationId },
      select: {
        id: true,
        visitId: true,
        reference: true,
        title: true,
        status: true,
        currentRevisionNumber: true,
        effectiveFrom: true,
        submittedAt: true,
        approvedAt: true,
        reviewComment: true,
        createdAt: true,
        updatedAt: true,
        visit: {
          select: {
            id: true,
            reference: true,
            title: true,
            scheduledStart: true,
            customer: { select: { id: true, name: true } },
            site: { select: { id: true, name: true } },
          },
        },
        preparedBy: { select: personSelect },
        reviewedBy: { select: personSelect },
        approvedBy: { select: personSelect },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  list(organisationId: string, visitId: string) {
    return this.prisma.rams.findMany({
      where: { organisationId, visitId },
      select: {
        id: true,
        visitId: true,
        reference: true,
        title: true,
        status: true,
        currentRevisionNumber: true,
        effectiveFrom: true,
        submittedAt: true,
        approvedAt: true,
        reviewComment: true,
        createdAt: true,
        updatedAt: true,
        preparedBy: { select: personSelect },
        reviewedBy: { select: personSelect },
        approvedBy: { select: personSelect },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async detail(organisationId: string, ramsId: string) {
    const rams = await this.prisma.rams.findFirst({
      where: { id: ramsId, organisationId },
      include: {
        visit: {
          include: {
            customer: { select: { id: true, name: true } },
            site: {
              select: {
                id: true,
                name: true,
                addressLine1: true,
                addressLine2: true,
                city: true,
                county: true,
                postcode: true,
                countryCode: true,
              },
            },
            jobCategory: { select: { id: true, name: true } },
            assignedUser: { select: personSelect },
          },
        },
        preparedBy: { select: personSelect },
        reviewedBy: { select: personSelect },
        approvedBy: { select: personSelect },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          select: {
            id: true,
            revisionNumber: true,
            createdAt: true,
            createdBy: { select: personSelect },
          },
        },
      },
    });
    if (rams === null)
      throw new DomainError('RAMS_NOT_FOUND', 'The RAMS record was not found.', 404);
    return { ...rams, draftData: normalizeRamsDraft(rams.draftData) };
  }

  async create(
    organisationId: string,
    visitId: string,
    actorUserId: string,
    correlationId: string,
  ) {
    const existing = await this.prisma.rams.findFirst({
      where: { organisationId, visitId },
      select: { id: true },
    });
    if (existing !== null) return this.detail(organisationId, existing.id);
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, organisationId },
      include: {
        site: {
          select: {
            accessInstructions: true,
            parkingInformation: true,
            ppeRequirements: true,
            inductionInformation: true,
          },
        },
        jobCategory: { select: { name: true } },
      },
    });
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
    const referencePart = (visit.reference ?? visit.id.slice(0, 8))
      .toLocaleUpperCase('en-GB')
      .replace(/[^A-Z0-9-]+/gu, '-');
    const title = `RAMS - ${visit.title}`;
    const draft = normalizeRamsDraft({
      overview: {
        title,
        category: visit.jobCategory?.name ?? '',
        effectiveFrom: visit.scheduledStart.toISOString().slice(0, 10),
      },
      scope: {
        scopeOfWorks: visit.description ?? '',
        exclusions: visit.exclusions ? [visit.exclusions] : [],
        engineerBriefing: visit.engineerNotes ? [visit.engineerNotes] : [],
      },
      requirements: {
        ppe: visit.site.ppeRequirements ? [visit.site.ppeRequirements] : [],
      },
      supportingInformation: {
        siteAccess: [visit.site.accessInstructions, visit.site.parkingInformation]
          .filter((value): value is string => Boolean(value))
          .join('\n'),
        permits: visit.site.inductionInformation ?? '',
      },
    });
    const created = await this.prisma.$transaction(async (transaction) => {
      const rams = await transaction.rams.create({
        data: {
          organisationId,
          visitId,
          reference: `RAMS-${referencePart}-1`,
          title,
          effectiveFrom: visit.scheduledStart,
          draftData: draft as unknown as Prisma.InputJsonValue,
          preparedByUserId: actorUserId,
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'RamsCreated',
          entityType: 'Rams',
          entityId: rams.id,
          data: { visitId, reference: rams.reference },
        },
      });
      return rams;
    });
    return this.detail(organisationId, created.id);
  }

  async update(
    organisationId: string,
    ramsId: string,
    actorUserId: string,
    correlationId: string,
    input: RamsDraft,
  ) {
    const current = await this.requireEditable(organisationId, ramsId);
    const draft = normalizeRamsDraft(input);
    const effectiveFrom = draft.overview.effectiveFrom
      ? new Date(`${draft.overview.effectiveFrom}T00:00:00.000Z`)
      : null;
    return this.prisma.$transaction(async (transaction) => {
      const rams = await transaction.rams.update({
        where: { id: ramsId },
        data: {
          title: draft.overview.title,
          effectiveFrom,
          draftData: draft as unknown as Prisma.InputJsonValue,
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'RamsUpdated',
          entityType: 'Rams',
          entityId: ramsId,
          data: { visitId: current.visitId },
        },
      });
      return rams;
    });
  }

  async submit(organisationId: string, ramsId: string, actorUserId: string, correlationId: string) {
    const current = await this.requireEditable(organisationId, ramsId);
    const draft = normalizeRamsDraft(current.draftData);
    this.validateReady(draft);
    const revisionNumber = current.currentRevisionNumber + 1;
    const contextSnapshot = this.snapshotFromRecord(current);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.ramsRevision.create({
        data: {
          organisationId,
          ramsId,
          revisionNumber,
          data: draft as unknown as Prisma.InputJsonValue,
          contextSnapshot: contextSnapshot as unknown as Prisma.InputJsonValue,
          createdByUserId: actorUserId,
        },
      });
      const rams = await transaction.rams.update({
        where: { id: ramsId },
        data: {
          status: 'UNDER_REVIEW',
          currentRevisionNumber: revisionNumber,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedByUserId: null,
          approvedAt: null,
          approvedByUserId: null,
          reviewComment: null,
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'RamsSubmitted',
          entityType: 'Rams',
          entityId: ramsId,
          data: { visitId: current.visitId, revisionNumber },
        },
      });
      return rams;
    });
  }

  async review(
    organisationId: string,
    ramsId: string,
    actorUserId: string,
    correlationId: string,
    input: { action: 'APPROVE' | 'RETURN'; comment?: string | undefined },
  ) {
    const current = await this.prisma.rams.findFirst({
      where: { id: ramsId, organisationId },
      select: { id: true, visitId: true, status: true, currentRevisionNumber: true },
    });
    if (current === null)
      throw new DomainError('RAMS_NOT_FOUND', 'The RAMS record was not found.', 404);
    if (current.status !== 'UNDER_REVIEW')
      throw new DomainError(
        'RAMS_REVIEW_STATE_INVALID',
        'Only submitted RAMS can be reviewed.',
        409,
      );
    if (input.action === 'RETURN' && !input.comment?.trim())
      throw new DomainError('RAMS_REVIEW_COMMENT_REQUIRED', 'Explain what must be changed.', 422);
    const approved = input.action === 'APPROVE';
    return this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const rams = await transaction.rams.update({
        where: { id: ramsId },
        data: {
          status: approved ? 'APPROVED' : 'RETURNED',
          reviewedAt: now,
          reviewedByUserId: actorUserId,
          approvedAt: approved ? now : null,
          approvedByUserId: approved ? actorUserId : null,
          reviewComment: input.comment?.trim() || null,
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: approved ? 'RamsApproved' : 'RamsReturned',
          entityType: 'Rams',
          entityId: ramsId,
          data: {
            visitId: current.visitId,
            revisionNumber: current.currentRevisionNumber,
            ...(input.comment ? { comment: input.comment } : {}),
          },
        },
      });
      return rams;
    });
  }

  async renderSource(organisationId: string, ramsId: string): Promise<RamsRenderPayload> {
    const rams = await this.prisma.rams.findFirst({
      where: { id: ramsId, organisationId },
      include: {
        organisation: { include: { brandProfile: true } },
        visit: { include: { customer: true, site: true, jobCategory: true, assignedUser: true } },
        preparedBy: { select: personSelect },
        reviewedBy: { select: personSelect },
        approvedBy: { select: personSelect },
        revisions: {
          orderBy: { revisionNumber: 'asc' },
          include: { createdBy: { select: personSelect } },
        },
      },
    });
    if (rams === null)
      throw new DomainError('RAMS_NOT_FOUND', 'The RAMS record was not found.', 404);

    const mutable = rams.status === 'DRAFT' || rams.status === 'RETURNED';
    const revision = mutable
      ? undefined
      : rams.revisions.find((item) => item.revisionNumber === rams.currentRevisionNumber);
    if (!mutable && revision === undefined)
      throw new DomainError(
        'RAMS_REVISION_NOT_FOUND',
        'The current immutable RAMS revision could not be found.',
        409,
      );
    const liveSnapshot = this.snapshotFromRecord(rams);
    const storedSnapshot = normalizeSnapshot(revision?.contextSnapshot);
    const contextSnapshot =
      mutable || !storedSnapshot.job.id || !storedSnapshot.organisation.name
        ? liveSnapshot
        : storedSnapshot;
    if (!mutable) {
      if (rams.reviewedBy !== null) contextSnapshot.people.reviewedBy = rams.reviewedBy;
      if (rams.approvedBy !== null) contextSnapshot.people.approvedBy = rams.approvedBy;
    }
    return {
      templateVersion: 'rams-a4-v1',
      documentState:
        mutable || rams.status === 'RETURNED'
          ? 'DRAFT'
          : rams.status === 'APPROVED'
            ? 'APPROVED'
            : 'UNDER_REVIEW',
      revisionNumber: mutable ? null : revision!.revisionNumber,
      reference: rams.reference,
      title: rams.title,
      effectiveFrom: iso(rams.effectiveFrom),
      submittedAt: mutable ? iso(rams.submittedAt) : iso(revision!.createdAt),
      approvedAt: iso(rams.approvedAt),
      reviewComment: rams.reviewComment,
      generatedAt: new Date().toISOString(),
      ...contextSnapshot,
      data: normalizeRamsDraft(mutable ? rams.draftData : revision!.data),
      revisionHistory: rams.revisions.map((item) => ({
        revisionNumber: item.revisionNumber,
        createdAt: item.createdAt.toISOString(),
        createdBy: item.createdBy,
        status: item.revisionNumber === rams.currentRevisionNumber ? rams.status : 'SUPERSEDED',
        summary: normalizeRamsDraft(item.data).overview.revisionSummary,
      })),
    };
  }

  private snapshotFromRecord(source: RamsSnapshotSource): RamsContextSnapshot {
    const brand = source.organisation?.brandProfile;
    const visit = source.visit;
    return {
      organisation: {
        name: brand?.tradingName ?? brand?.registeredName ?? source.organisation?.name ?? '',
        addressLines: addressLines(
          brand?.addressLine1,
          brand?.addressLine2,
          brand?.city,
          brand?.county,
          brand?.postcode,
          brand?.countryCode,
        ),
      },
      job: {
        id: visit?.id ?? source.visitId ?? '',
        reference: visit?.reference ?? null,
        externalReference: visit?.externalReference ?? null,
        title: visit?.title ?? source.title ?? '',
        category: visit?.jobCategory?.name ?? null,
        jobType: visit?.jobType ?? null,
        plannedStart: iso(visit?.scheduledStart) ?? '',
        targetCompletion: iso(visit?.scheduledEnd),
      },
      customer: { name: visit?.customer?.name ?? '' },
      site: {
        name: visit?.site?.name ?? '',
        addressLines: addressLines(
          visit?.site?.addressLine1,
          visit?.site?.addressLine2,
          visit?.site?.city,
          visit?.site?.county,
          visit?.site?.postcode,
          visit?.site?.countryCode,
        ),
      },
      people: {
        preparedBy: source.preparedBy ?? emptyPerson(),
        ...(source.reviewedBy == null ? {} : { reviewedBy: source.reviewedBy }),
        ...(source.approvedBy == null ? {} : { approvedBy: source.approvedBy }),
        ...(visit?.assignedUser == null ? {} : { assignedEngineer: visit.assignedUser }),
      },
    };
  }

  private async requireEditable(organisationId: string, ramsId: string) {
    const rams = await this.prisma.rams.findFirst({
      where: { id: ramsId, organisationId },
      select: {
        id: true,
        visitId: true,
        title: true,
        status: true,
        currentRevisionNumber: true,
        draftData: true,
        preparedBy: { select: personSelect },
        organisation: { include: { brandProfile: true } },
        visit: {
          include: { customer: true, site: true, jobCategory: true, assignedUser: true },
        },
      },
    });
    if (rams === null)
      throw new DomainError('RAMS_NOT_FOUND', 'The RAMS record was not found.', 404);
    if (rams.status !== 'DRAFT' && rams.status !== 'RETURNED')
      throw new DomainError(
        'RAMS_LOCKED',
        'Submitted and approved RAMS cannot be edited. Return the RAMS before making changes.',
        409,
      );
    return rams;
  }

  private validateReady(draft: RamsDraft): void {
    const missing: string[] = [];
    if (!draft.overview.title.trim()) missing.push('RAMS title');
    if (!draft.overview.effectiveFrom) missing.push('effective date');
    if (!draft.scope.scopeOfWorks.trim()) missing.push('scope of works');
    if (draft.scope.keyActivities.length === 0) missing.push('key work activity');
    if (draft.scope.workAreas.length === 0) missing.push('work area');
    if (!draft.scope.workBoundaries.trim()) missing.push('work boundaries');
    if (draft.scope.responsibilities.length === 0) missing.push('responsible person');
    if (draft.methodStatement.steps.length === 0) missing.push('method statement step');
    if (draft.riskAssessment.hazards.length === 0) missing.push('risk assessment hazard');
    if (draft.requirements.ppe.length === 0) missing.push('PPE requirement');
    if (draft.requirements.emergencyArrangements.length === 0)
      missing.push('emergency arrangement');
    if (
      !draft.requirements.emergencyDetails.contactName.trim() ||
      !draft.requirements.emergencyDetails.contactNumber.trim() ||
      !draft.requirements.emergencyDetails.assemblyPoint.trim()
    )
      missing.push('emergency contact and assembly point');
    if (
      draft.methodStatement.steps.some(
        (step) =>
          !step.id.trim() ||
          !step.title.trim() ||
          !step.detail.trim() ||
          !step.responsibility.trim() ||
          step.estimatedMinutes <= 0,
      )
    )
      missing.push('complete method statement steps');
    if (
      draft.riskAssessment.hazards.some(
        (hazard) =>
          !hazard.id.trim() ||
          !hazard.hazard.trim() ||
          !hazard.peopleAtRisk.trim() ||
          !hazard.howHarmed.trim() ||
          !hazard.controls.trim(),
      )
    )
      missing.push('complete hazard details and controls');
    if (
      draft.scope.responsibilities.some(
        (item) =>
          !item.id.trim() ||
          !item.name.trim() ||
          !item.role.trim() ||
          !item.organisation.trim() ||
          !item.responsibility.trim() ||
          !item.contact.trim(),
      )
    )
      missing.push('complete responsibility rows');
    const incompleteReference = [
      ...draft.supportingInformation.permitReferences,
      ...draft.supportingInformation.coshhReferences,
      ...draft.supportingInformation.workingAtHeightReferences,
      ...draft.supportingInformation.legislationReferences,
    ].some((item) => !item.id.trim() || !item.name.trim() || !item.reference.trim());
    if (incompleteReference) missing.push('complete supporting reference rows');
    if (
      draft.supportingInformation.documents.some(
        (item) =>
          !item.id.trim() ||
          !item.name.trim() ||
          !item.type.trim() ||
          !item.reference.trim() ||
          !item.status.trim(),
      )
    )
      missing.push('complete supporting document rows');
    if (missing.length > 0)
      throw new DomainError(
        'RAMS_NOT_READY',
        `Complete the following before requesting review: ${missing.join(', ')}.`,
        422,
      );
  }
}
