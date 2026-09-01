import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';
import {
  baselineRamsRequirementDefaults,
  normalizeRamsRequirementDefaults,
} from './rams-requirement-defaults';

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export const RAMS_ACKNOWLEDGEMENT_STATEMENT =
  'I confirm that I have read, understood and will comply with this RAMS revision.';

export interface RamsAcknowledgementSigner {
  subject: string;
  name: string;
  email?: string;
  role: string;
  actorUserId?: string;
}

export interface RamsMethodStep {
  id: string;
  title: string;
  detail: string;
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
      organisation?: string | undefined;
      responsibility: string;
      contact?: string | undefined;
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
  jobs: RamsJobContext[];
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

export interface RamsJobContext {
  job: RamsContextSnapshot['job'];
  customer: RamsContextSnapshot['customer'];
  site: RamsContextSnapshot['site'];
  assignedEngineer?: RamsPerson;
}

export interface RamsRecommendationDocument {
  id: string;
  reference: string;
  title: string;
  status: string;
  currentRevisionNumber: number;
  draftData: unknown;
  jobTitle?: string;
  jobDescription?: string;
}

export interface RamsRecommendationContext {
  current: { id: string; title: string; jobDescription: string };
  candidates: RamsRecommendationDocument[];
}

export interface RamsRecommendationMatch {
  id: string;
  score: number;
}

const maximumSemanticDescriptionCharacters = 1_800;

function semanticDescription(value: string | null | undefined): string {
  return (value ?? '').slice(0, maximumSemanticDescriptionCharacters);
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
  acknowledgements: Array<{
    id: string;
    signerName: string;
    signerEmail: string | null;
    signerRole: string;
    signatureData: string;
    statement: string;
    signedAt: string;
  }>;
}

const personSelect = { id: true, displayName: true, email: true } as const;
interface RamsSnapshotSource {
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
  visits?: Array<{
    visitId: string;
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
    };
  }>;
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
  | 'detail'
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
  | 'jobs'
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
        responsibility: text(item.responsibility),
        ...(text(item.organisation) ? { organisation: text(item.organisation) } : {}),
        ...(text(item.contact) ? { contact: text(item.contact) } : {}),
      })),
    },
    methodStatement: {
      steps: records(methodStatement.steps).map((item) => ({
        id: text(item.id),
        title: text(item.title),
        detail: text(item.detail),
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
  const normalizeJob = (input: unknown): RamsJobContext => {
    const item = record(input);
    const itemJob = record(item.job);
    const itemCustomer = record(item.customer);
    const itemSite = record(item.site);
    const itemAssignedEngineer = person(item.assignedEngineer);
    return {
      job: {
        id: text(itemJob.id),
        reference: typeof itemJob.reference === 'string' ? itemJob.reference : null,
        externalReference:
          typeof itemJob.externalReference === 'string' ? itemJob.externalReference : null,
        title: text(itemJob.title),
        category: typeof itemJob.category === 'string' ? itemJob.category : null,
        jobType: typeof itemJob.jobType === 'string' ? itemJob.jobType : null,
        plannedStart: text(itemJob.plannedStart),
        targetCompletion:
          typeof itemJob.targetCompletion === 'string' ? itemJob.targetCompletion : null,
      },
      customer: { name: text(itemCustomer.name) },
      site: { name: text(itemSite.name), addressLines: strings(itemSite.addressLines) },
      ...(itemAssignedEngineer === undefined ? {} : { assignedEngineer: itemAssignedEngineer }),
    };
  };
  const legacyJob = normalizeJob({
    job,
    customer,
    site,
    assignedEngineer: people.assignedEngineer,
  });
  const jobs = records(snapshot.jobs)
    .map(normalizeJob)
    .filter((item) => item.job.id);
  return {
    organisation: {
      name: text(organisation.name),
      addressLines: strings(organisation.addressLines),
    },
    jobs: jobs.length > 0 ? jobs : legacyJob.job.id ? [legacyJob] : [],
    job: legacyJob.job,
    customer: legacyJob.customer,
    site: legacyJob.site,
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

  async listOrganisation(
    organisationId: string,
    options: { search?: string; limit?: number; siteId?: string } = {},
  ) {
    const search = options.search?.trim();
    const items = await this.prisma.rams.findMany({
      where: {
        organisationId,
        ...(search
          ? {
              OR: [
                { reference: { contains: search, mode: 'insensitive' as const } },
                { title: { contains: search, mode: 'insensitive' as const } },
                {
                  visits: {
                    some: {
                      visit: {
                        OR: [
                          { reference: { contains: search, mode: 'insensitive' as const } },
                          { title: { contains: search, mode: 'insensitive' as const } },
                          {
                            customer: { name: { contains: search, mode: 'insensitive' as const } },
                          },
                          { site: { name: { contains: search, mode: 'insensitive' as const } } },
                          {
                            site: { postcode: { contains: search, mode: 'insensitive' as const } },
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            }
          : {}),
        ...(options.siteId === undefined
          ? {}
          : { visits: { some: { visit: { siteId: options.siteId } } } }),
      },
      select: {
        id: true,
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
        visits: {
          select: {
            visit: {
              select: {
                id: true,
                reference: true,
                title: true,
                scheduledStart: true,
                customer: { select: { id: true, name: true } },
                site: { select: { id: true, name: true, postcode: true } },
              },
            },
          },
        },
        preparedBy: { select: personSelect },
        reviewedBy: { select: personSelect },
        approvedBy: { select: personSelect },
      },
      orderBy: { updatedAt: 'desc' },
      ...(options.limit === undefined ? {} : { take: options.limit }),
    });
    return items.map(({ visits, ...rams }) => ({
      ...rams,
      visits: visits.map(({ visit }) => visit),
    }));
  }

  async recommendationContext(
    organisationId: string,
    ramsId: string,
  ): Promise<RamsRecommendationContext> {
    const activeVisit = {
      where: { visit: { organisationId, archivedAt: null } },
      orderBy: { linkedAt: 'asc' as const },
      take: 1,
      select: { visit: { select: { title: true, description: true } } },
    };
    const current = await this.prisma.rams.findFirst({
      where: { id: ramsId, organisationId },
      select: { id: true, title: true, visits: activeVisit },
    });
    if (current === null)
      throw new DomainError('RAMS_NOT_FOUND', 'The RAMS record was not found.', 404);

    const candidates = await this.prisma.rams.findMany({
      where: {
        id: { not: ramsId },
        organisationId,
        visits: { some: { visit: { organisationId, archivedAt: null } } },
      },
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        currentRevisionNumber: true,
        draftData: true,
        visits: activeVisit,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 500,
    });
    const currentVisit = current.visits[0]?.visit;
    return {
      current: {
        id: current.id,
        title: current.title,
        jobDescription: semanticDescription(currentVisit?.description),
      },
      candidates: candidates.map(({ visits, ...candidate }) => {
        const visit = visits[0]?.visit;
        return {
          ...candidate,
          ...(visit?.title ? { jobTitle: visit.title } : {}),
          ...(visit?.description ? { jobDescription: semanticDescription(visit.description) } : {}),
        };
      }),
    };
  }

  hydrateRecommendations(context: RamsRecommendationContext, matches: RamsRecommendationMatch[]) {
    const candidates = new Map(context.candidates.map((candidate) => [candidate.id, candidate]));
    const seen = new Set<string>();
    return matches
      .filter(({ id, score }) => {
        if (score < 0.78 || seen.has(id) || !candidates.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map(({ id, score }) => {
        const candidate = candidates.get(id);
        if (candidate === undefined) throw new Error('Recommendation candidate was not hydrated.');
        return { ...candidate, draftData: normalizeRamsDraft(candidate.draftData), score };
      })
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, 3);
  }

  async list(organisationId: string, visitId: string) {
    const items = await this.prisma.rams.findMany({
      where: { organisationId, visits: { some: { visitId } } },
      select: {
        id: true,
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
        visits: {
          select: {
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
          },
        },
        preparedBy: { select: personSelect },
        reviewedBy: { select: personSelect },
        approvedBy: { select: personSelect },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return items.map(({ visits, ...rams }) => ({
      ...rams,
      visits: visits.map(({ visit }) => visit),
    }));
  }

  async detail(organisationId: string, ramsId: string) {
    const rams = await this.prisma.rams.findFirst({
      where: { id: ramsId, organisationId },
      include: {
        visits: {
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
    const { visits, ...record } = rams;
    return {
      ...record,
      visits: visits.map(({ visit }) => visit),
      draftData: normalizeRamsDraft(rams.draftData),
    };
  }

  async create(
    organisationId: string,
    visitId: string,
    actorUserId: string,
    correlationId: string,
  ) {
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
    const [storedDefaults, defaultHazards] = await Promise.all([
      this.prisma.ramsRequirementDefaults.findUnique({ where: { organisationId } }),
      this.prisma.ramsHazardLibraryItem.findMany({
        where: { organisationId, status: 'ACTIVE', isDefault: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
    ]);
    const defaults =
      storedDefaults === null
        ? baselineRamsRequirementDefaults()
        : normalizeRamsRequirementDefaults(storedDefaults);
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
        ...defaults,
        ppe: normalizeRamsRequirementDefaults({
          ...defaults,
          ppe: [
            ...defaults.ppe,
            ...(visit.site.ppeRequirements ? [visit.site.ppeRequirements] : []),
          ],
        }).ppe,
      },
      supportingInformation: {
        siteAccess: [visit.site.accessInstructions, visit.site.parkingInformation]
          .filter((value): value is string => Boolean(value))
          .join('\n'),
        permits: visit.site.inductionInformation ?? '',
      },
    });
    if (defaultHazards.length > 0) {
      draft.riskAssessment.hazards = defaultHazards.map((libraryHazard) => ({
        ...normalizeRamsDraft({
          riskAssessment: { hazards: [libraryHazard.data as unknown as RamsHazard] },
        }).riskAssessment.hazards[0]!,
        id: crypto.randomUUID(),
      }));
    }
    const referencePrefix = `RAMS-${referencePart}`;
    const created = await this.prisma.$transaction(async (transaction) => {
      const existingCount = await transaction.rams.count({
        where: { organisationId, reference: { startsWith: `${referencePrefix}-` } },
      });
      const rams = await transaction.rams.create({
        data: {
          organisationId,
          reference: `${referencePrefix}-${existingCount + 1}`,
          title,
          effectiveFrom: visit.scheduledStart,
          draftData: draft as unknown as Prisma.InputJsonValue,
          preparedByUserId: actorUserId,
          visits: { create: { visitId } },
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

  async linkVisit(
    organisationId: string,
    ramsId: string,
    visitId: string,
    actorUserId: string,
    correlationId: string,
  ) {
    await Promise.all([
      this.requireRams(organisationId, ramsId),
      this.requireVisit(organisationId, visitId),
    ]);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.ramsVisit.create({ data: { ramsId, visitId } });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'RamsVisitLinked',
            entityType: 'Rams',
            entityId: ramsId,
            data: { visitId },
          },
        });
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error))
        throw new DomainError(
          'RAMS_VISIT_ALREADY_LINKED',
          'The RAMS is already linked to this job.',
          409,
        );
      throw error;
    }
    return this.detail(organisationId, ramsId);
  }

  async unlinkVisit(
    organisationId: string,
    ramsId: string,
    visitId: string,
    actorUserId: string,
    correlationId: string,
  ): Promise<void> {
    await this.requireRamsAndVisit(organisationId, ramsId, visitId);
    const link = await this.prisma.ramsVisit.findUnique({
      where: { ramsId_visitId: { ramsId, visitId } },
    });
    if (link === null)
      throw new DomainError('RAMS_VISIT_NOT_LINKED', 'The RAMS is not linked to this job.', 404);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.ramsVisit.delete({ where: { ramsId_visitId: { ramsId, visitId } } });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'RamsVisitUnlinked',
          entityType: 'Rams',
          entityId: ramsId,
          data: { visitId },
        },
      });
    });
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
          data: { visitIds: current.visits.map(({ visitId }) => visitId) },
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
          data: { visitIds: current.visits.map(({ visitId }) => visitId), revisionNumber },
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
      select: {
        id: true,
        status: true,
        currentRevisionNumber: true,
        visits: { select: { visitId: true } },
      },
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
            visitIds: current.visits.map(({ visitId }) => visitId),
            revisionNumber: current.currentRevisionNumber,
            ...(input.comment ? { comment: input.comment } : {}),
          },
        },
      });
      return rams;
    });
  }

  async listRevisions(organisationId: string, ramsId: string) {
    await this.requireRams(organisationId, ramsId);
    return this.prisma.ramsRevision.findMany({
      where: { organisationId, ramsId },
      select: {
        id: true,
        revisionNumber: true,
        createdAt: true,
        createdBy: { select: personSelect },
        _count: { select: { acknowledgements: true } },
      },
      orderBy: { revisionNumber: 'desc' },
    });
  }

  async revisionDetail(organisationId: string, ramsId: string, revisionNumber: number) {
    const revision = await this.prisma.ramsRevision.findFirst({
      where: { organisationId, ramsId, revisionNumber },
      include: {
        createdBy: { select: personSelect },
        acknowledgements: { orderBy: { signedAt: 'asc' } },
      },
    });
    if (revision === null)
      throw new DomainError('RAMS_REVISION_NOT_FOUND', 'The RAMS revision was not found.', 404);
    return {
      ...revision,
      data: normalizeRamsDraft(revision.data),
      contextSnapshot: normalizeSnapshot(revision.contextSnapshot),
    };
  }

  async listAcknowledgements(
    organisationId: string,
    ramsId: string,
    visitId: string,
    signerSubject?: string,
  ) {
    const rams = await this.requireRamsAndVisit(organisationId, ramsId, visitId);
    if (rams.currentRevisionNumber === 0) return [];
    return this.prisma.ramsAcknowledgement.findMany({
      where: {
        organisationId,
        visitId,
        ...(signerSubject === undefined ? {} : { signerSubject }),
        revision: { ramsId, revisionNumber: rams.currentRevisionNumber },
      },
      orderBy: { signedAt: 'asc' },
    });
  }

  async signAcknowledgement(
    organisationId: string,
    ramsId: string,
    visitId: string,
    signer: RamsAcknowledgementSigner,
    signatureData: string,
    correlationId: string,
  ) {
    const rams = await this.requireRamsAndVisit(organisationId, ramsId, visitId);
    if (rams.status !== 'APPROVED' || rams.currentRevisionNumber === 0)
      throw new DomainError(
        'RAMS_ACKNOWLEDGEMENT_NOT_ALLOWED',
        'Only the current approved RAMS revision can be acknowledged.',
        409,
      );
    const revision = await this.prisma.ramsRevision.findUnique({
      where: {
        ramsId_revisionNumber: { ramsId, revisionNumber: rams.currentRevisionNumber },
      },
      select: { id: true, revisionNumber: true },
    });
    if (revision === null)
      throw new DomainError('RAMS_REVISION_NOT_FOUND', 'The RAMS revision was not found.', 404);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const acknowledgement = await transaction.ramsAcknowledgement.create({
          data: {
            organisationId,
            ramsRevisionId: revision.id,
            visitId,
            signerSubject: signer.subject,
            signerName: signer.name,
            ...(signer.email === undefined ? {} : { signerEmail: signer.email }),
            signerRole: signer.role,
            signatureData,
            statement: RAMS_ACKNOWLEDGEMENT_STATEMENT,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            ...(signer.actorUserId === undefined ? {} : { actorUserId: signer.actorUserId }),
            correlationId,
            eventType: 'RamsAcknowledged',
            entityType: 'Rams',
            entityId: ramsId,
            data: {
              acknowledgementId: acknowledgement.id,
              revisionNumber: revision.revisionNumber,
              visitId,
              signerSubject: signer.subject,
            },
          },
        });
        return acknowledgement;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error))
        throw new DomainError(
          'RAMS_ALREADY_ACKNOWLEDGED',
          'This signer has already acknowledged this RAMS revision for this job.',
          409,
        );
      throw error;
    }
  }

  async renderSource(
    organisationId: string,
    ramsId: string,
    visitId?: string,
    revisionNumber?: number,
  ): Promise<RamsRenderPayload> {
    const rams = await this.prisma.rams.findFirst({
      where: { id: ramsId, organisationId },
      include: {
        organisation: { include: { brandProfile: true } },
        visits: {
          include: {
            visit: {
              include: { customer: true, site: true, jobCategory: true, assignedUser: true },
            },
          },
          orderBy: { linkedAt: 'asc' },
        },
        preparedBy: { select: personSelect },
        reviewedBy: { select: personSelect },
        approvedBy: { select: personSelect },
        revisions: {
          orderBy: { revisionNumber: 'asc' },
          include: {
            createdBy: { select: personSelect },
            acknowledgements: { orderBy: { signedAt: 'asc' } },
          },
        },
      },
    });
    if (rams === null)
      throw new DomainError('RAMS_NOT_FOUND', 'The RAMS record was not found.', 404);

    const mutable =
      revisionNumber === undefined && (rams.status === 'DRAFT' || rams.status === 'RETURNED');
    const revision = mutable
      ? undefined
      : rams.revisions.find(
          (item) => item.revisionNumber === (revisionNumber ?? rams.currentRevisionNumber),
        );
    if (!mutable && revision === undefined)
      throw new DomainError(
        'RAMS_REVISION_NOT_FOUND',
        'The immutable RAMS revision was not found.',
        404,
      );
    const selectedVisitId = visitId ?? rams.visits[0]?.visitId;
    if (
      selectedVisitId === undefined ||
      !rams.visits.some((link) => link.visitId === selectedVisitId)
    )
      throw new DomainError(
        'RAMS_VISIT_NOT_LINKED',
        'The RAMS is not linked to the selected job.',
        404,
      );
    const liveSnapshot = this.snapshotFromRecord(rams);
    const storedSnapshot = normalizeSnapshot(revision?.contextSnapshot);
    const contextSnapshot =
      mutable || storedSnapshot.jobs.length === 0 || !storedSnapshot.organisation.name
        ? liveSnapshot
        : storedSnapshot;
    const selectedJob =
      contextSnapshot.jobs.find((item) => item.job.id === selectedVisitId) ??
      liveSnapshot.jobs.find((item) => item.job.id === selectedVisitId);
    if (selectedJob === undefined)
      throw new DomainError(
        'RAMS_REVISION_VISIT_NOT_FOUND',
        'The selected job is not present in this RAMS revision.',
        404,
      );
    if (!contextSnapshot.jobs.some((item) => item.job.id === selectedJob.job.id))
      contextSnapshot.jobs.push(selectedJob);
    contextSnapshot.job = selectedJob.job;
    contextSnapshot.customer = selectedJob.customer;
    contextSnapshot.site = selectedJob.site;
    if (selectedJob.assignedEngineer === undefined) delete contextSnapshot.people.assignedEngineer;
    else contextSnapshot.people.assignedEngineer = selectedJob.assignedEngineer;
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
      acknowledgements: (revision?.acknowledgements ?? [])
        .filter((item) => item.visitId === selectedVisitId)
        .map((item) => ({
          id: item.id,
          signerName: item.signerName,
          signerEmail: item.signerEmail,
          signerRole: item.signerRole,
          signatureData: item.signatureData,
          statement: item.statement,
          signedAt: item.signedAt.toISOString(),
        })),
    };
  }

  private snapshotFromRecord(source: RamsSnapshotSource): RamsContextSnapshot {
    const brand = source.organisation?.brandProfile;
    const jobs = (source.visits ?? []).map(({ visitId, visit }): RamsJobContext =>
      visit === undefined
        ? {
            job: {
              id: visitId,
              reference: null,
              externalReference: null,
              title: source.title,
              category: null,
              jobType: null,
              plannedStart: '',
              targetCompletion: null,
            },
            customer: { name: '' },
            site: { name: '', addressLines: [] },
          }
        : {
            job: {
              id: visit.id,
              reference: visit.reference,
              externalReference: visit.externalReference,
              title: visit.title,
              category: visit.jobCategory?.name ?? null,
              jobType: visit.jobType,
              plannedStart: iso(visit.scheduledStart) ?? '',
              targetCompletion: iso(visit.scheduledEnd),
            },
            customer: { name: visit.customer.name },
            site: {
              name: visit.site.name,
              addressLines: addressLines(
                visit.site.addressLine1,
                visit.site.addressLine2,
                visit.site.city,
                visit.site.county,
                visit.site.postcode,
                visit.site.countryCode,
              ),
            },
            ...(visit.assignedUser === null ? {} : { assignedEngineer: visit.assignedUser }),
          },
    );
    const selected = jobs[0] ?? {
      job: {
        id: '',
        reference: null,
        externalReference: null,
        title: source.title,
        category: null,
        jobType: null,
        plannedStart: '',
        targetCompletion: null,
      },
      customer: { name: '' },
      site: { name: '', addressLines: [] },
    };
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
      jobs,
      job: selected.job,
      customer: selected.customer,
      site: selected.site,
      people: {
        preparedBy: source.preparedBy ?? emptyPerson(),
        ...(source.reviewedBy == null ? {} : { reviewedBy: source.reviewedBy }),
        ...(source.approvedBy == null ? {} : { approvedBy: source.approvedBy }),
        ...(selected.assignedEngineer === undefined
          ? {}
          : { assignedEngineer: selected.assignedEngineer }),
      },
    };
  }

  private async requireRams(organisationId: string, ramsId: string) {
    const rams = await this.prisma.rams.findFirst({
      where: { id: ramsId, organisationId },
      select: { id: true, status: true, currentRevisionNumber: true },
    });
    if (rams === null)
      throw new DomainError('RAMS_NOT_FOUND', 'The RAMS record was not found.', 404);
    return rams;
  }

  private async requireRamsAndVisit(organisationId: string, ramsId: string, visitId: string) {
    const [rams] = await Promise.all([
      this.requireRams(organisationId, ramsId),
      this.requireVisit(organisationId, visitId),
    ]);
    const link = await this.prisma.ramsVisit.findUnique({
      where: { ramsId_visitId: { ramsId, visitId } },
      select: { ramsId: true },
    });
    if (link === null)
      throw new DomainError('RAMS_VISIT_NOT_LINKED', 'The RAMS is not linked to this job.', 404);
    return rams;
  }

  private async requireVisit(organisationId: string, visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, organisationId },
      select: { id: true },
    });
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
    return visit;
  }

  private async requireEditable(organisationId: string, ramsId: string) {
    const rams = await this.prisma.rams.findFirst({
      where: { id: ramsId, organisationId },
      select: {
        id: true,
        title: true,
        status: true,
        currentRevisionNumber: true,
        draftData: true,
        preparedBy: { select: personSelect },
        organisation: { include: { brandProfile: true } },
        visits: {
          include: {
            visit: {
              include: { customer: true, site: true, jobCategory: true, assignedUser: true },
            },
          },
          orderBy: { linkedAt: 'asc' },
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
        (step) => !step.id.trim() || !step.title.trim() || !step.detail.trim(),
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
          !item.id.trim() || !item.name.trim() || !item.role.trim() || !item.responsibility.trim(),
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
