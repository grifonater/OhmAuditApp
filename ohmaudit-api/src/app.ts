import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { authenticate } from './auth/auth.middleware';
import { supportSession } from './auth/support-session.middleware';
import { SupabaseTokenVerifier } from './auth/supabase-token-verifier';
import type { AuthenticatedActor, TokenVerifier } from './auth/auth.types';
import { createPrismaClient } from './database/prisma';
import { IdentityService } from './identity/identity.service';
import type { IdentityStore } from './identity/identity.store';
import { PrismaIdentityStore } from './identity/prisma-identity.store';
import { AccessService } from './identity/access.service';
import { capabilities, type Capability } from './authorization/capabilities';
import { EntitlementService } from './entitlements/entitlement.service';
import { OnboardingService } from './onboarding/onboarding.service';
import { PortfolioService } from './portfolio/portfolio.service';
import { ScheduleService } from './scheduling/schedule.service';
import { VisitService } from './visits/visit.service';
import { evRcdFailureReasons, InspectionService } from './inspections/inspection.service';
import { EvService } from './modules/ev/ev.service';
import { PlatformService } from './platform/platform.service';
import { InstructionService } from './platform/instruction.service';
import { EquipmentService } from './equipment/equipment.service';
import { DomainError } from './shared/domain-error';
import type { ApiBindings } from './shared/environment';
import { parseEnvironment } from './shared/environment';
import { requestContext, type RequestVariables } from './shared/request-context';

type AppEnvironment = { Bindings: ApiBindings; Variables: RequestVariables };
type AppOptions = { tokenVerifier?: TokenVerifier; identityStore?: IdentityStore };

const healthRoute = createRoute({
  method: 'get',
  path: '/api/v1/health',
  responses: {
    200: {
      description: 'Service health',
      content: {
        'application/json': {
          schema: z.object({
            service: z.literal('ohmaudit-api'),
            status: z.literal('ok'),
            version: z.string(),
          }),
        },
      },
    },
  },
});
const organisationInput = z.object({ name: z.string().trim().min(2).max(120) });
const mfaPolicyInput = z.object({ requireMfaForPrivilegedRoles: z.boolean() });
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalTrimmed = (maximum: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(maximum).optional());
const optionalEmail = z.preprocess(blankToUndefined, z.email().optional());
const optionalUrl = z.preprocess((value: unknown) => {
  const normalised = blankToUndefined(value);
  if (typeof normalised !== 'string' || /^[a-z][a-z0-9+.-]*:\/\//iu.test(normalised)) {
    return normalised;
  }
  return `https://${normalised.trim()}`;
}, z.url().optional());
export const brandProfileInput = z.object({
  tradingName: optionalTrimmed(120),
  registeredName: optionalTrimmed(160),
  addressLine1: optionalTrimmed(160),
  addressLine2: optionalTrimmed(160),
  city: optionalTrimmed(100),
  county: optionalTrimmed(100),
  postcode: optionalTrimmed(20),
  countryCode: z.string().length(2).default('GB'),
  telephone: optionalTrimmed(40),
  email: optionalEmail,
  website: optionalUrl,
  primaryColour: z
    .string()
    .regex(/^#[0-9a-f]{6}$/iu)
    .default('#006B66'),
  secondaryColour: z
    .string()
    .regex(/^#[0-9a-f]{6}$/iu)
    .default('#243B53'),
  timezone: z.string().min(1).default('Europe/London'),
  dateFormat: z.string().min(1).default('DD/MM/YYYY'),
  onboardingStep: z.string().min(1).default('branding'),
});
const accreditationInput = z.object({
  scheme: z.string().trim().min(2).max(80),
  registrationNumber: z.string().trim().min(1).max(80),
});
const invitationInput = z.object({ email: z.email(), roleKey: z.string().min(1) });
const dataPlateCandidateSchema = z.object({
  field: z.enum(['manufacturer', 'model', 'serialNumber', 'maximumPowerKw']),
  value: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1).optional(),
  requiresHumanConfirmation: z.literal(true),
});
const dataPlateFieldSchema = dataPlateCandidateSchema.shape.field;
const dataPlateAnalysisSchema = z.object({
  candidates: z.array(dataPlateCandidateSchema).max(5),
  missingFields: z.array(dataPlateFieldSchema).max(5),
});
const dataPlateDebugSchema = dataPlateAnalysisSchema.extend({
  debug: z.literal(true).default(true),
  model: z.string().min(1),
  rawAnswer: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  imageBytes: z.number().int().nonnegative(),
  parseError: z.string().optional(),
});
const capabilityKey = z.enum(capabilities);
const roleInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: optionalTrimmed(500),
  capabilityKeys: z.array(capabilityKey).max(capabilities.length),
});
const memberRoleInput = z.object({ roleId: z.uuid() });
const memberStatusInput = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });
const optionalText = optionalTrimmed(500);
const customerInput = z.object({
  name: z.string().trim().min(2).max(160),
  reference: optionalText,
  internalNotes: z.string().max(5000).optional(),
});
const customerUpdateInput = customerInput
  .partial()
  .refine((input) => Object.keys(input).length > 0);
const siteInput = z.object({
  customerId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  reference: optionalText,
  addressLine1: optionalText,
  city: optionalText,
  postcode: optionalText,
  parkingInformation: z.string().max(2000).optional(),
  accessInstructions: z.string().max(2000).optional(),
  internalNotes: z.string().max(5000).optional(),
});
const siteUpdateInput = siteInput
  .omit({ customerId: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0);
const assetInput = z.object({
  siteId: z.uuid(),
  assetType: z.string().trim().min(2).max(80),
  assetReference: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(2).max(160),
  manufacturer: optionalText,
  model: optionalText,
  serialNumber: optionalText,
  notes: z.string().max(5000).optional(),
});
const assetUpdateInput = assetInput
  .omit({ siteId: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0);
const assetLifecycleInput = z.object({
  status: z.enum(['PROPOSED', 'ACTIVE', 'INACTIVE', 'REMOVED', 'DECOMMISSIONED', 'REPLACED']),
  replacementAssetId: z.uuid().optional(),
});
const contactInput = z.object({
  customerId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  name: z.string().trim().min(2).max(160),
  role: optionalText,
  email: optionalEmail,
  telephone: optionalText,
  mobile: optionalText,
  notes: z.string().max(2000).optional(),
});
const tagInput = z.object({
  name: z.string().trim().min(1).max(60),
  colour: z
    .string()
    .regex(/^#[0-9a-f]{6}$/iu)
    .default('#526D82'),
});
const documentInput = z.object({
  entityType: z.enum(['Customer', 'Site', 'Asset']),
  entityId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
});
const mediaInput = z.object({
  entityType: z.enum(['Organisation', 'Customer', 'Site', 'Asset', 'Inspection']),
  entityId: z.uuid(),
  category: z.string().trim().min(1).max(80),
  caption: z.string().max(500).optional(),
  originalFilename: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().positive().max(2_000_000),
});
const mediaUpdateInput = z
  .object({
    caption: z.string().trim().max(500).optional(),
    category: z.enum(['unclassified-image', 'thermal-image', 'standard-image']).optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
  })
  .refine((input) => Object.keys(input).length > 0);
const equipmentInput = z.object({
  name: z.string().trim().min(2).max(160),
  equipmentType: z.string().trim().min(2).max(100),
  manufacturer: optionalTrimmed(160),
  model: optionalTrimmed(160),
  serialNumber: optionalTrimmed(160),
  calibrationDueAt: z.preprocess(blankToUndefined, z.iso.date().optional()),
  notes: z.string().trim().max(2000).optional(),
});
const equipmentUpdateInput = equipmentInput
  .partial()
  .refine((input) => Object.keys(input).length > 0);
const superadminBootstrapInput = z.object({ token: z.string().min(1).max(500) });
const platformRoleInput = z.object({ platformRole: z.enum(['USER', 'PLATFORM_ADMIN']) });
const platformModuleInput = z.object({
  status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED']),
  expiresAt: z.preprocess(blankToUndefined, z.coerce.date().nullable().optional()),
});
const platformMemberInput = z
  .object({
    roleId: z.uuid().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine((input) => input.roleId !== undefined || input.status !== undefined);
const supportSessionInput = z.object({
  targetUserId: z.uuid(),
  reason: z.string().trim().min(5).max(500),
});
const stockImageInput = z.object({
  organisationId: z.uuid(),
  manufacturer: z.string().trim().min(1).max(160),
  models: z.array(z.string().trim().min(1).max(160)).min(1).max(50),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().positive().max(2_000_000),
});
const stockImageModelsInput = z.object({
  manufacturer: z.string().trim().min(1).max(160),
  models: z.array(z.string().trim().min(1).max(160)).min(1).max(50),
});
const stockImageContentType = z.enum(['image/jpeg', 'image/png', 'image/webp']);
const stockImageContentSize = z.coerce.number().int().positive().max(2_000_000);
const evTestStepSchema = z.enum(['unit', 'supplies', 'connectors', 'condition', 'submit']);
const evTestInstructionInput = z.object({
  step: evTestStepSchema,
  manufacturers: z.array(z.string().trim().min(1).max(160)).max(50),
  title: z.string().trim().min(1).max(160),
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(30),
  notes: z.string().trim().max(5000).optional(),
});
const evInstructionVideoContentType = z.enum(['video/mp4', 'video/webm', 'image/gif']);
const evInstructionVideoContentSize = z.coerce.number().int().positive().max(50_000_000);

function parseByteRange(
  header: string,
  size: number,
): { range: { offset: number; length: number }; start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/iu.exec(header.trim());
  if (match === null) return null;
  const [, startPart, endPart] = match;
  if (startPart === '' && endPart === '') return null;
  if (startPart === '') {
    const suffix = Number(endPart);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    if (suffix >= size) return { range: { offset: 0, length: size }, start: 0, end: size - 1 };
    return {
      range: { offset: size - suffix, length: suffix },
      start: size - suffix,
      end: size - 1,
    };
  }
  const start = Number(startPart);
  if (!Number.isInteger(start) || start < 0 || start >= size) return null;
  const end = endPart === '' ? size - 1 : Math.min(Number(endPart), size - 1);
  if (!Number.isInteger(end) || end < start) return null;
  return { range: { offset: start, length: end - start + 1 }, start, end };
}
const inspectionOverrideInput = z.object({
  reason: z.string().trim().min(3).max(1000),
  data: z.record(z.string(), z.unknown()),
  evData: z
    .object({
      stableDetails: z.record(z.string(), z.unknown()),
      supplyTests: z.array(z.unknown()).max(100),
      connectorTests: z.array(z.unknown()).max(200),
      functionalChecks: z.record(z.string(), z.unknown()),
      engineerObservations: z.string().max(5000).optional(),
    })
    .optional(),
  defects: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000).optional(),
        severity: z.enum(['ADVISORY', 'MINOR', 'MAJOR', 'DANGEROUS']),
        status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']),
      }),
    )
    .max(100)
    .optional(),
});
const scheduleInput = z.object({
  customerId: z.uuid().optional(),
  siteId: z.uuid(),
  assetId: z.uuid().optional(),
  title: z.string().trim().min(2).max(160),
  moduleKey: z.string().trim().min(2).max(80),
  frequencyMonths: z.number().int().min(1).max(120),
  startDate: z.coerce.date(),
  notificationLeadDays: z.number().int().min(0).max(365).default(30),
});
const notificationPreferenceInput = z.object({
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  defaultLeadDays: z.number().int().min(0).max(365),
  overdueReminders: z.boolean(),
  inspectionSubmitted: z.boolean(),
});
const visitTaskInput = z.object({
  assetId: z.uuid().optional(),
  moduleKey: z.enum(['core', 'ev-charging', 'thermal-imaging']),
  title: z.string().trim().min(2).max(160),
});
const visitInput = z.object({
  siteId: z.uuid(),
  title: z.string().trim().min(2).max(160),
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date().optional(),
  assignedUserId: z.uuid().optional(),
  guestEngineerName: optionalTrimmed(160),
  guestEmail: optionalEmail,
  guestMobile: optionalTrimmed(40),
  engineerNotes: z.string().max(5000).optional(),
  tasks: z.array(visitTaskInput).max(1000),
});
const syncInput = z.object({
  clientMutationId: z.string().uuid(),
  entityType: z.string().min(1).max(80),
  operation: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()),
});
const defectSubmissionInput = z.object({
  assetId: z.uuid().optional(),
  title: z.string().trim().min(2).max(200),
  description: z.string().max(5000).optional(),
  severity: z.enum(['ADVISORY', 'MINOR', 'MAJOR', 'DANGEROUS']),
  photoMediaIds: z.array(z.uuid()).max(50).optional(),
});
const inspectionSubmissionInput = z.object({
  data: z.record(z.string(), z.unknown()),
  validation: z.record(z.string(), z.unknown()).default({}),
  signature: z.object({
    signerName: z.string().trim().min(2).max(160),
    signerRole: z.string().trim().min(2).max(80),
    signatureData: z.string().min(2).max(10000),
  }),
  defects: z.array(defectSubmissionInput).max(100).default([]),
  evData: z
    .object({
      stableDetails: z.record(z.string(), z.unknown()),
      supplyTests: z.array(z.unknown()),
      connectorTests: z.array(z.unknown()),
      functionalChecks: z.record(z.string(), z.unknown()),
      engineerObservations: z.string().max(5000).optional(),
    })
    .optional(),
  proposedAssetChanges: z.record(z.string(), z.unknown()).optional(),
});
const evChargePointInput = z.object({
  chargePointId: optionalTrimmed(120),
  operatorName: optionalTrimmed(160),
  firmwareVersion: optionalTrimmed(120),
  installationDate: z.coerce.date().optional(),
  nominalVoltage: z.number().int().min(1).max(1000).optional(),
  phaseCount: z.number().int().min(1).max(3).optional(),
  maximumPowerKw: z.number().positive().max(1000).optional(),
  dcRcdType: z.enum(['TYPE_B', 'RDC_DD', 'NONE']).optional(),
  locationNotes: z.string().max(2000).optional(),
});
const evSupplyInput = z.object({
  label: z.string().trim().min(1).max(100),
  phaseCount: z.number().int().min(1).max(3),
  protectiveDeviceType: optionalTrimmed(100),
  protectiveDeviceRating: z.number().int().positive().max(1000).optional(),
  earthingArrangement: z.enum(['TNCS', 'TNS', 'TT', 'IT']).optional(),
});
const evConnectorInput = z.object({
  label: z.string().trim().min(1).max(100),
  connectorType: z.string().trim().min(1).max(100),
  supplyIds: z.array(z.uuid()).max(1).default([]),
});
const engineerEvAssetInput = z.object({
  assetReference: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(2).max(160),
  manufacturer: optionalTrimmed(500),
  model: optionalTrimmed(500),
  serialNumber: optionalTrimmed(500),
  maximumPowerKw: z.number().positive().max(1000).optional(),
  dcRcdType: z.enum(['TYPE_B', 'RDC_DD', 'NONE']).default('NONE'),
});

function identityService(environment: ApiBindings, options: AppOptions): IdentityService {
  if (options.identityStore !== undefined) return new IdentityService(options.identityStore);
  const connectionString = environment.HYPERDRIVE?.connectionString ?? environment.DATABASE_URL;
  if (connectionString === undefined) throw new Error('HYPERDRIVE or DATABASE_URL is required.');
  return new IdentityService(new PrismaIdentityStore(createPrismaClient(connectionString)));
}

function prismaFor(environment: ApiBindings) {
  const connectionString = environment.HYPERDRIVE?.connectionString ?? environment.DATABASE_URL;
  if (connectionString === undefined) throw new Error('HYPERDRIVE or DATABASE_URL is required.');
  return createPrismaClient(connectionString);
}

async function requireModuleForKey(
  prisma: ReturnType<typeof prismaFor>,
  organisationId: string,
  moduleKey: string,
): Promise<void> {
  if (moduleKey !== 'core')
    await new EntitlementService(prisma).requireModule(organisationId, moduleKey);
}

async function requireVisitTaskModule(
  prisma: ReturnType<typeof prismaFor>,
  organisationId: string,
  visitTaskId: string,
): Promise<string> {
  const task = await prisma.visitTask.findFirst({
    where: { id: visitTaskId, organisationId },
    select: { moduleKey: true },
  });
  if (task === null)
    throw new DomainError('VISIT_TASK_NOT_FOUND', 'The visit task was not found.', 404);
  await requireModuleForKey(prisma, organisationId, task.moduleKey);
  return task.moduleKey;
}

async function requireInspectionModule(
  prisma: ReturnType<typeof prismaFor>,
  organisationId: string,
  inspectionId: string,
): Promise<string> {
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, organisationId },
    select: { moduleKey: true },
  });
  if (inspection === null)
    throw new DomainError('INSPECTION_NOT_FOUND', 'The inspection was not found.', 404);
  await requireModuleForKey(prisma, organisationId, inspection.moduleKey);
  return inspection.moduleKey;
}

function specialistCapability(
  moduleKey: string,
  operation:
    'asset-read' | 'asset-manage' | 'perform' | 'issue' | 'equipment-read' | 'equipment-manage',
): Capability | undefined {
  if (moduleKey === 'ev-charging') {
    if (operation === 'asset-read') return 'ev.assets.read';
    if (operation === 'asset-manage') return 'ev.assets.manage';
    if (operation === 'perform') return 'ev.inspections.perform';
    if (operation === 'issue') return 'ev.certificates.issue';
  }
  if (moduleKey === 'thermal-imaging') {
    if (operation === 'perform') return 'thermal.inspections.perform';
    if (operation === 'issue') return 'thermal.reports.issue';
    if (operation === 'equipment-read') return 'thermal.equipment.read';
    if (operation === 'equipment-manage') return 'thermal.equipment.manage';
  }
  return undefined;
}

async function requireSpecialistRoleCapability(
  environment: ApiBindings,
  options: AppOptions,
  actor: AuthenticatedActor,
  organisationId: string,
  moduleKey: string,
  operation: Parameters<typeof specialistCapability>[1],
): Promise<void> {
  const capability = specialistCapability(moduleKey, operation);
  if (capability !== undefined)
    await identityService(environment, options).requireMembership(
      actor,
      organisationId,
      capability,
    );
}

async function analyseChargerDataPlate(
  environment: ApiBindings,
  request: Request,
  correlationId: string,
  metadata: { organisationId: string; inspectionId: string; access: 'member' | 'guest' },
) {
  const log = (
    level: 'info' | 'warn' | 'error',
    event: string,
    details: Record<string, unknown>,
  ) => {
    const message = JSON.stringify({ event, correlationId, ...metadata, ...details });
    if (level === 'error') console.error(message);
    else if (level === 'warn') console.warn(message);
    else console.log(message);
  };
  if (environment.AI_WORKER === undefined) {
    log('error', 'api.ai_dataplate.not_configured', {});
    throw new DomainError(
      'AI_NOT_CONFIGURED',
      'Data plate analysis is not configured. Please contact support.',
      503,
    );
  }
  const mimeType = request.headers.get('content-type')?.split(';', 1)[0]?.toLowerCase() ?? '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    log('warn', 'api.ai_dataplate.rejected', { reason: 'unsupported_image_type', mimeType });
    throw new DomainError('IMAGE_TYPE_INVALID', 'Use a JPEG, PNG, or WebP image.', 415);
  }
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (declaredSize > 2_000_000) {
    log('warn', 'api.ai_dataplate.rejected', { reason: 'image_too_large', declaredSize });
    throw new DomainError('IMAGE_TOO_LARGE', 'The image must be 2 MB or smaller.', 413);
  }
  if (request.body === null) {
    log('warn', 'api.ai_dataplate.rejected', { reason: 'image_empty' });
    throw new DomainError('IMAGE_EMPTY', 'Select an image to analyse.', 422);
  }

  let response: Response;
  try {
    response = await environment.AI_WORKER.fetch(
      'https://ohmaudit-ai.internal/v1/extract/charger-dataplate',
      {
        method: 'POST',
        headers: { 'content-type': mimeType, 'x-correlation-id': correlationId },
        body: request.body,
      },
    );
  } catch (error: unknown) {
    log('error', 'api.ai_dataplate.worker_unreachable', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
    });
    throw new DomainError(
      'AI_ANALYSIS_FAILED',
      'The AI service is temporarily unavailable. Please try the photo again.',
      502,
    );
  }
  if (!response.ok) {
    const error = z
      .object({ message: z.string().optional() })
      .catch({})
      .parse(await response.json().catch(() => ({})));
    const status = [413, 415, 422, 502, 503].includes(response.status)
      ? (response.status as 413 | 415 | 422 | 502 | 503)
      : 502;
    log('error', 'api.ai_dataplate.worker_rejected', {
      downstreamStatus: response.status,
      returnedStatus: status,
      message: error.message ?? 'No downstream message',
    });
    throw new DomainError(
      'AI_ANALYSIS_FAILED',
      error.message ?? 'The image could not be analysed.',
      status,
    );
  }
  const result = dataPlateAnalysisSchema.safeParse(await response.json().catch(() => undefined));
  if (!result.success) {
    log('error', 'api.ai_dataplate.invalid_worker_response', {
      issueCount: result.error.issues.length,
    });
    throw new DomainError(
      'AI_ANALYSIS_FAILED',
      'The AI returned an invalid result. Please try the photo again.',
      502,
    );
  }
  log(result.data.missingFields.length === 0 ? 'info' : 'warn', 'api.ai_dataplate.completed', {
    extractedFields: result.data.candidates.map(({ field }) => field),
    missingFields: result.data.missingFields,
  });
  return result.data;
}

async function requireVisitModules(
  prisma: ReturnType<typeof prismaFor>,
  organisationId: string,
  visitId: string,
): Promise<string[]> {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, organisationId },
    select: { tasks: { select: { moduleKey: true } } },
  });
  if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The visit was not found.', 404);
  const moduleKeys = [...new Set(visit.tasks.map((task) => task.moduleKey))];
  await Promise.all(
    moduleKeys.map((moduleKey) => requireModuleForKey(prisma, organisationId, moduleKey)),
  );
  return moduleKeys;
}

function isEvAssetType(assetType: string | undefined): boolean {
  return assetType !== undefined && /\bev\b|electric vehicle|charger/iu.test(assetType);
}

function mediaWriteCapability(
  entityType: 'Organisation' | 'Customer' | 'Site' | 'Asset' | 'Inspection',
): Capability {
  if (entityType === 'Organisation') return 'organisation.manage';
  if (entityType === 'Customer') return 'customers.manage';
  if (entityType === 'Site') return 'sites.manage';
  if (entityType === 'Inspection') return 'inspections.perform';
  return 'assets.manage';
}

interface ReportMediaImage {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

function reportLogoFields(image: ReportMediaImage | undefined) {
  return image === undefined
    ? {}
    : {
        logoImage: image,
        ...(image.mimeType === 'image/jpeg' ? { logoJpegBase64: image.base64 } : {}),
      };
}

async function mediaImageForReport(
  environment: ApiBindings,
  prisma: ReturnType<typeof prismaFor>,
  organisationId: string,
  mediaId: string | null | undefined,
): Promise<ReportMediaImage | undefined> {
  if (mediaId === null || mediaId === undefined || environment.MEDIA_BUCKET === undefined)
    return undefined;
  try {
    const media = await prisma.media.findFirst({
      where: {
        id: mediaId,
        organisationId,
        mimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] },
        status: 'AVAILABLE',
      },
    });
    if (media === null) return undefined;
    const object = await environment.MEDIA_BUCKET.get(media.storageKey);
    if (object === null) return undefined;
    const bytes = new Uint8Array(await object.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return {
      base64: btoa(binary),
      mimeType: media.mimeType as ReportMediaImage['mimeType'],
    };
  } catch (error: unknown) {
    console.warn(
      JSON.stringify({
        event: 'pdf.jpeg_media_unavailable',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    return undefined;
  }
}

async function jpegMediaForReport(
  environment: ApiBindings,
  prisma: ReturnType<typeof prismaFor>,
  organisationId: string,
  mediaId: string | null | undefined,
): Promise<string | undefined> {
  const image = await mediaImageForReport(environment, prisma, organisationId, mediaId);
  return image?.mimeType === 'image/jpeg' ? image.base64 : undefined;
}

export async function requestPdfRender(
  environment: ApiBindings,
  renderPath: string,
  renderInit: RequestInit,
): Promise<Response> {
  try {
    const response =
      environment.PDF_WORKER === undefined
        ? await fetch(`${environment.PDF_WORKER_URL}${renderPath}`, renderInit)
        : await environment.PDF_WORKER.fetch(`https://pdf.internal${renderPath}`, renderInit);
    if (response.ok) return response;
    const body = (await response
      .clone()
      .json()
      .catch(() => undefined)) as { message?: string } | undefined;
    throw new DomainError(
      'PDF_RENDER_FAILED',
      body?.message ?? 'The PDF renderer could not generate this certificate.',
      response.status === 404 || response.status === 422 ? response.status : 503,
    );
  } catch (error: unknown) {
    if (error instanceof DomainError) throw error;
    console.error(
      JSON.stringify({
        event: 'pdf.renderer_unreachable',
        errorType: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : 'Unknown renderer error',
      }),
    );
    throw new DomainError(
      'PDF_RENDERER_UNREACHABLE',
      'The PDF renderer is unavailable. Start the PDF worker and try again.',
      503,
    );
  }
}

function reportRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function reportArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function reportText(value: unknown, fallback = ''): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? `${value}`
    : fallback;
}

function reportProtection(value: unknown): string {
  const key = reportText(value);
  return (
    {
      TYPE_B: 'Type B RCD',
      RDC_DD: 'RDC-DD',
      NONE: 'None',
      TNCS: 'TN-C-S',
      TNS: 'TN-S',
    }[key] ?? key
  );
}

function evCertificateData(source: {
  documentId: string;
  testingCompany: {
    name: string;
    addressLines: string[];
    registrationNumber: string;
    logoJpegBase64?: string | undefined;
    logoImage?: ReportMediaImage | undefined;
  };
  testingLocation: {
    name: string;
    addressLines: string[];
    logoJpegBase64?: string | undefined;
    logoImage?: ReportMediaImage | undefined;
  };
  charger: {
    name: string;
    location: string;
    make: string;
    model: string;
    serialNumber: string;
    photoJpegBase64?: string | undefined;
  };
  evData: {
    stableDetails: unknown;
    supplyTests: unknown;
    connectorTests: unknown;
    functionalChecks: unknown;
    engineerObservations: string | null;
  };
  revisionData: unknown;
  testDate: Date;
  engineerName: string;
  defects: Array<{ title: string; description: string | null }>;
}) {
  const stable = reportRecord(source.evData.stableDetails);
  const asset = reportRecord(stable['asset']);
  const chargePoint = reportRecord(stable['chargePoint']);
  const supplies = reportArray(source.evData.supplyTests).map(reportRecord);
  const connectors = reportArray(source.evData.connectorTests).map(reportRecord);
  const supplyNumbers = new Map(
    supplies.map((supply, index) => [reportText(supply['id']), String(index + 1)]),
  );
  const revisionData = reportRecord(source.revisionData);
  const functionalChecks = reportRecord(source.evData.functionalChecks);
  const rcdFailures = evRcdFailureReasons({
    stableDetails: stable,
    connectorTests: connectors,
  });
  const outcome =
    rcdFailures.length > 0
      ? 'FAIL'
      : reportText(functionalChecks['outcome'] ?? revisionData['outcome'], 'Recorded');
  const recordedFailureReason = source.defects
    .map(({ title, description }) => `${title}${description ? `: ${description}` : ''}`)
    .join('; ');
  const reasonForFailure =
    rcdFailures.length === 0 || recordedFailureReason.toLowerCase().includes('faulty rcd reading')
      ? recordedFailureReason
      : [recordedFailureReason, `Faulty RCD reading: ${rcdFailures.join('; ')}`]
          .filter(Boolean)
          .join('; ');
  return {
    testingCompany: source.testingCompany,
    testingLocation: source.testingLocation,
    charger: {
      ...source.charger,
      make: reportText(asset['manufacturer'], source.charger.make),
      model: reportText(asset['model'], source.charger.model),
      serialNumber: reportText(asset['serialNumber'], source.charger.serialNumber),
      powerOutputKw: `${reportText(chargePoint['maximumPowerKw'], 'Not recorded')}${chargePoint['maximumPowerKw'] === undefined || chargePoint['maximumPowerKw'] === null ? '' : ' kW'}`,
    },
    supplies: supplies.map((supply) => ({
      label: reportText(supply['label'], 'Supply'),
      phaseCount: reportText(supply['phaseCount'], '-'),
      breaker: [
        reportText(supply['protectiveDeviceType']),
        reportText(supply['protectiveDeviceRating'])
          ? `${reportText(supply['protectiveDeviceRating'])} A`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      earthingArrangement: reportProtection(supply['earthingArrangement']),
      zsOhms: reportText(supply['zsOhms'], '-'),
      maximumPfcKa: reportText(supply['maximumPfcKa'], '-'),
    })),
    connectors: connectors.map((connector) => ({
      label: reportText(connector['label'], 'Connector'),
      connectorType: reportText(connector['connectorType']),
      supplyNumbers: reportArray(connector['supplyIds'])
        .map((id) => supplyNumbers.get(reportText(id)) ?? '?')
        .join(', '),
      pePreTest: reportText(connector['pePreTest'], 'Not tested'),
      cpError: reportText(connector['cpError'], 'Not tested'),
      peError: reportText(connector['peError'], 'Not tested'),
      cpStates: reportText(connector['cpStates'], 'Not tested'),
      rcd1x0Ms: reportText(connector['rcd1x0Ms'], '-'),
      rcd1x180Ms: reportText(connector['rcd1x180Ms'], '-'),
      rcd5x0Ms: reportText(connector['rcd5x0Ms'], '-'),
      rcd5x180Ms: reportText(connector['rcd5x180Ms'], '-'),
      dcRcdType: reportProtection(chargePoint['dcRcdType']),
      dcRamp0Ma: reportText(connector['dcRamp0Ma'], '-'),
      dcRamp180Ma: reportText(connector['dcRamp180Ma'], '-'),
    })),
    testDate: source.testDate.toISOString().slice(0, 10),
    outcome,
    reasonForFailure,
    notes: source.evData.engineerObservations ?? '',
    engineerName: source.engineerName,
    certificateReference: source.documentId,
  };
}

async function thermalCertificateData(source: {
  environment: ApiBindings;
  prisma: ReturnType<typeof prismaFor>;
  organisationId: string;
  revisionData: unknown;
  reportReference: string;
  organisationName: string;
  customerName: string;
  siteName: string;
  siteAddress: string[];
  reportDate: Date;
  engineerName: string;
  logoImage?: ReportMediaImage | undefined;
}) {
  const data = reportRecord(source.revisionData);
  const details = reportRecord(data['details']);
  const equipment = reportRecord(data['equipment']);
  const targets = reportArray(data['targets']).map(reportRecord);
  const requestedIds = [
    ...new Set(
      targets.flatMap((target) =>
        reportArray(target['imageIds'])
          .map((id) => reportText(id))
          .filter(Boolean)
          .slice(0, 2),
      ),
    ),
  ].slice(0, 12);
  const media =
    requestedIds.length === 0
      ? []
      : await source.prisma.media.findMany({
          where: {
            organisationId: source.organisationId,
            id: { in: requestedIds },
            entityType: 'Inspection',
            category: { in: ['thermal-image', 'standard-image'] },
            mimeType: 'image/jpeg',
            status: 'AVAILABLE',
          },
        });
  const base64Entries = await Promise.all(
    media.map(
      async (image) =>
        [
          image.id,
          await jpegMediaForReport(
            source.environment,
            source.prisma,
            source.organisationId,
            image.id,
          ),
        ] as const,
    ),
  );
  const base64ById = new Map(base64Entries);
  const mediaById = new Map(media.map((image) => [image.id, image]));
  return {
    organisationName: source.organisationName,
    customerName: source.customerName,
    siteName: source.siteName,
    siteAddress: source.siteAddress,
    reportDate: source.reportDate.toISOString().slice(0, 10),
    engineerName: source.engineerName,
    reportReference: source.reportReference,
    outcome: reportText(data['outcome'], 'Recorded'),
    details: {
      scope: reportText(details['scope']),
      purpose: reportText(details['purpose']),
      inspectionMethod: reportText(details['inspectionMethod']),
      areasInspected: reportText(details['areasInspected']),
      areasExcluded: reportText(details['areasExcluded']),
      limitations: reportText(details['limitations']),
      environmentalConditions: reportText(details['environmentalConditions']),
      loadCondition: reportText(details['loadCondition']),
      ambientTemperatureC: reportText(details['ambientTemperatureC']),
      emissivity: reportText(details['emissivity']),
      reflectedTemperatureC: reportText(details['reflectedTemperatureC']),
      clientRepresentative: reportText(details['clientRepresentative']),
      additionalNotes: reportText(details['additionalNotes']),
      equipment: [
        reportText(equipment['name']),
        reportText(equipment['manufacturer']),
        reportText(equipment['model']),
        reportText(equipment['serialNumber']) ? `S/N ${reportText(equipment['serialNumber'])}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    },
    ...reportLogoFields(source.logoImage),
    targets: targets.map((target, index) => ({
      name: reportText(target['name'], `Target item ${index + 1}`),
      reference: reportText(target['reference']),
      location: reportText(target['location']),
      condition: reportText(target['condition'], 'NO_ISSUES'),
      issueSummary: reportText(target['issueSummary']),
      severity: reportText(target['severity']),
      maxTemperatureC: reportText(target['maxTemperatureC']),
      deltaTemperatureC: reportText(target['deltaTemperatureC']),
      observations: reportText(target['observations']),
      recommendation: reportText(target['recommendation']),
      images: reportArray(target['imageIds']).flatMap((id) => {
        const mediaId = reportText(id);
        const image = mediaById.get(mediaId);
        const jpegBase64 = base64ById.get(mediaId);
        return image === undefined || jpegBase64 === undefined
          ? []
          : [{ kind: image.category === 'thermal-image' ? 'Infrared' : 'Standard', jpegBase64 }];
      }),
    })),
  };
}

export function createApp(options: AppOptions = {}): OpenAPIHono<AppEnvironment> {
  const app = new OpenAPIHono<AppEnvironment>();
  const verifier = options.tokenVerifier ?? new SupabaseTokenVerifier();
  app.use('*', requestContext);
  app.use(
    '/api/*',
    cors({
      origin: (origin, context) => {
        const bindings = context.env as ApiBindings;
        return bindings.ALLOWED_ORIGINS.split(',').includes(origin) ? origin : undefined;
      },
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'X-Correlation-Id',
        'X-Client-Mutation-Id',
        'X-File-Size',
        'X-OhmAudit-Support-Session',
      ],
    }),
  );
  app.use('/api/*', async (context, next) => {
    await next();
    const response = context.res;
    if (response.headers.get('cache-control')) return;
    response.headers.set('cache-control', 'no-store');
  });
  app.openapi(healthRoute, (context) => {
    const environment = parseEnvironment(context.env);
    return context.json(
      { service: 'ohmaudit-api' as const, status: 'ok' as const, version: environment.APP_VERSION },
      200,
    );
  });
  app.get('/api/v1/stock-images/:mediaId/content', async (context) => {
    const environment = parseEnvironment(context.env);
    if (environment.MEDIA_BUCKET === undefined)
      throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);

    const stockImageCache = (caches as CacheStorage & { readonly default: Cache }).default;
    const cacheKey = new Request(context.req.url, { method: 'GET' });
    const cached = await stockImageCache.match(cacheKey);
    if (cached !== undefined) return cached;

    const media = await new PlatformService(prismaFor(environment)).stockMedia(
      z.uuid().parse(context.req.param('mediaId')),
    );
    const object = await environment.MEDIA_BUCKET.get(media.storageKey);
    if (object === null)
      throw new DomainError('MEDIA_CONTENT_NOT_FOUND', 'The image content was not found.', 404);

    const response = new Response(object.body, {
      headers: {
        'content-type': media.mimeType,
        'cache-control': 'public, max-age=3600, s-maxage=86400',
        etag: object.httpEtag,
        'x-content-type-options': 'nosniff',
      },
    });
    context.executionCtx.waitUntil(stockImageCache.put(cacheKey, response.clone()));
    return response;
  });
  app.get('/api/v1/test-instruction-videos/:mediaId/content', async (context) => {
    const environment = parseEnvironment(context.env);
    if (environment.MEDIA_BUCKET === undefined)
      throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);
    const media = await new InstructionService(prismaFor(environment)).videoForContent(
      z.uuid().parse(context.req.param('mediaId')),
    );
    const bucket = environment.MEDIA_BUCKET;
    const baseHeaders = {
      'content-type': media.mimeType,
      'cache-control': 'public, max-age=600, s-maxage=86400',
      'accept-ranges': 'bytes',
      'x-content-type-options': 'nosniff',
    };
    const rangeHeader = context.req.header('range');
    if (rangeHeader === undefined) {
      const object = await bucket.get(media.storageKey);
      if (object === null)
        throw new DomainError(
          'MEDIA_CONTENT_NOT_FOUND',
          'The instruction video content was not found.',
          404,
        );
      return new Response(object.body, { headers: { ...baseHeaders, etag: object.httpEtag } });
    }
    const head = await bucket.head(media.storageKey);
    if (head === null)
      throw new DomainError(
        'MEDIA_CONTENT_NOT_FOUND',
        'The instruction video content was not found.',
        404,
      );
    const parsed = parseByteRange(rangeHeader, head.size);
    if (parsed === null)
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, 'content-range': `bytes */${head.size}` },
      });
    const object = await bucket.get(media.storageKey, { range: parsed.range });
    if (object === null)
      throw new DomainError(
        'MEDIA_CONTENT_NOT_FOUND',
        'The instruction video content was not found.',
        404,
      );
    return new Response(object.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        'content-range': `bytes ${parsed.start}-${parsed.end}/${head.size}`,
        'content-length': String(parsed.end - parsed.start + 1),
      },
    });
  });
  app.post('/api/internal/scheduler/tick', async (context) => {
    const environment = parseEnvironment(context.env);
    if (
      environment.INTERNAL_SERVICE_TOKEN === undefined ||
      context.req.header('authorization') !== `Bearer ${environment.INTERNAL_SERVICE_TOKEN}`
    )
      throw new DomainError(
        'INTERNAL_UNAUTHORIZED',
        'Internal service authentication failed.',
        401,
      );
    return context.json(await new ScheduleService(prismaFor(environment)).tick());
  });
  app.use('/api/v1/me', authenticate(verifier));
  app.use('/api/v1/organisations', authenticate(verifier));
  app.use('/api/v1/organisations/*', authenticate(verifier));
  app.use('/api/v1/platform/*', authenticate(verifier));
  app.use('/api/v1/invitations/*', authenticate(verifier));
  for (const path of [
    'customers',
    'sites',
    'assets',
    'contacts',
    'tags',
    'documents',
    'media',
    'search',
    'timeline',
    'schedules',
    'calendar',
    'notifications',
    'visits',
    'inspections',
    'proposed-asset-changes',
    'modules',
    'ev-test-instructions',
  ]) {
    app.use(`/api/v1/${path}`, authenticate(verifier));
    app.use(`/api/v1/${path}/*`, authenticate(verifier));
  }
  app.use('/api/v1/*', supportSession());
  app.get('/api/v1/me', async (context) =>
    context.json(
      await identityService(parseEnvironment(context.env), options).currentUser(
        context.get('actor'),
      ),
    ),
  );
  app.post('/api/v1/organisations', async (context) => {
    const input = organisationInput.parse(await context.req.json());
    const organisation = await identityService(
      parseEnvironment(context.env),
      options,
    ).createOrganisation(context.get('actor'), input.name, context.get('correlationId'));
    return context.json({ organisation }, 201);
  });
  app.get('/api/v1/organisations/:organisationId/members', async (context) => {
    const members = await identityService(parseEnvironment(context.env), options).listMembers(
      context.get('actor'),
      context.req.param('organisationId'),
    );
    return context.json({ members });
  });
  app.get('/api/v1/organisations/:organisationId/access', async (context) => {
    const environment = parseEnvironment(context.env);
    const { user, membership } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.users.manage',
    );
    return context.json(
      await new AccessService(prismaFor(environment)).overview(
        context.req.param('organisationId'),
        {
          userId: user.id,
          roleKey: membership.role.key,
          capabilities: membership.role.capabilities,
        },
      ),
    );
  });
  app.post('/api/v1/organisations/:organisationId/roles', async (context) => {
    const environment = parseEnvironment(context.env);
    const { user, membership } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.users.manage',
    );
    const role = await new AccessService(prismaFor(environment)).createRole(
      context.req.param('organisationId'),
      { userId: user.id, roleKey: membership.role.key, capabilities: membership.role.capabilities },
      roleInput.parse(await context.req.json()),
      context.get('correlationId'),
    );
    return context.json({ role }, 201);
  });
  app.patch('/api/v1/organisations/:organisationId/roles/:roleId', async (context) => {
    const environment = parseEnvironment(context.env);
    const { user, membership } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.users.manage',
    );
    const role = await new AccessService(prismaFor(environment)).updateRole(
      context.req.param('organisationId'),
      context.req.param('roleId'),
      { userId: user.id, roleKey: membership.role.key, capabilities: membership.role.capabilities },
      roleInput.parse(await context.req.json()),
      context.get('correlationId'),
    );
    return context.json({ role });
  });
  app.delete('/api/v1/organisations/:organisationId/roles/:roleId', async (context) => {
    const environment = parseEnvironment(context.env);
    const { user, membership } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.users.manage',
    );
    await new AccessService(prismaFor(environment)).deleteRole(
      context.req.param('organisationId'),
      context.req.param('roleId'),
      { userId: user.id, roleKey: membership.role.key, capabilities: membership.role.capabilities },
      context.get('correlationId'),
    );
    return context.body(null, 204);
  });
  app.patch('/api/v1/organisations/:organisationId/members/:membershipId/role', async (context) => {
    const environment = parseEnvironment(context.env);
    const { user, membership } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.users.manage',
    );
    const input = memberRoleInput.parse(await context.req.json());
    return context.json({
      member: await new AccessService(prismaFor(environment)).setMemberRole(
        context.req.param('organisationId'),
        context.req.param('membershipId'),
        input.roleId,
        {
          userId: user.id,
          roleKey: membership.role.key,
          capabilities: membership.role.capabilities,
        },
        context.get('correlationId'),
      ),
    });
  });
  app.patch(
    '/api/v1/organisations/:organisationId/members/:membershipId/status',
    async (context) => {
      const environment = parseEnvironment(context.env);
      const { user, membership } = await identityService(environment, options).requireMembership(
        context.get('actor'),
        context.req.param('organisationId'),
        'organisation.users.manage',
      );
      const input = memberStatusInput.parse(await context.req.json());
      return context.json({
        member: await new AccessService(prismaFor(environment)).setMemberStatus(
          context.req.param('organisationId'),
          context.req.param('membershipId'),
          input.status,
          {
            userId: user.id,
            roleKey: membership.role.key,
            capabilities: membership.role.capabilities,
          },
          context.get('correlationId'),
        ),
      });
    },
  );
  app.patch('/api/v1/organisations/:organisationId/mfa-policy', async (context) => {
    const input = mfaPolicyInput.parse(await context.req.json());
    const organisation = await identityService(parseEnvironment(context.env), options).setMfaPolicy(
      context.get('actor'),
      context.req.param('organisationId'),
      input.requireMfaForPrivilegedRoles,
      context.get('correlationId'),
    );
    return context.json({ organisation });
  });
  app.get('/api/v1/organisations/:organisationId/entitlements', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
    );
    return context.json({
      entitlements: await new EntitlementService(prismaFor(environment)).list(
        context.req.param('organisationId'),
      ),
    });
  });
  app.get('/api/v1/organisations/:organisationId/portfolio-summary', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'customers.read',
    );
    return context.json({
      summary: await new PortfolioService(prismaFor(environment)).summary(
        context.req.param('organisationId'),
      ),
    });
  });
  app.get('/api/v1/organisations/:organisationId/equipment', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'thermal.equipment.read',
    );
    const prisma = prismaFor(environment);
    await new EntitlementService(prisma).requireModule(
      context.req.param('organisationId'),
      'thermal-imaging',
    );
    return context.json({
      equipment: await new EquipmentService(prisma).list(context.req.param('organisationId')),
    });
  });
  app.post('/api/v1/organisations/:organisationId/equipment', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      context.req.param('organisationId'),
      ['organisation.manage', 'thermal.equipment.manage'],
    );
    const prisma = prismaFor(environment);
    await new EntitlementService(prisma).requireModule(
      context.req.param('organisationId'),
      'thermal-imaging',
    );
    return context.json(
      {
        equipment: await new EquipmentService(prisma).create(
          context.req.param('organisationId'),
          equipmentInput.parse(await context.req.json()),
        ),
      },
      201,
    );
  });
  app.patch('/api/v1/organisations/:organisationId/equipment/:equipmentId', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      context.req.param('organisationId'),
      ['organisation.manage', 'thermal.equipment.manage'],
    );
    const prisma = prismaFor(environment);
    await new EntitlementService(prisma).requireModule(
      context.req.param('organisationId'),
      'thermal-imaging',
    );
    return context.json({
      equipment: await new EquipmentService(prisma).update(
        context.req.param('organisationId'),
        z.uuid().parse(context.req.param('equipmentId')),
        equipmentUpdateInput.parse(await context.req.json()),
      ),
    });
  });
  app.delete('/api/v1/organisations/:organisationId/equipment/:equipmentId', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      context.req.param('organisationId'),
      ['organisation.manage', 'thermal.equipment.manage'],
    );
    const prisma = prismaFor(environment);
    await new EntitlementService(prisma).requireModule(
      context.req.param('organisationId'),
      'thermal-imaging',
    );
    await new EquipmentService(prisma).archive(
      context.req.param('organisationId'),
      z.uuid().parse(context.req.param('equipmentId')),
    );
    return context.body(null, 204);
  });
  app.get('/api/v1/organisations/:organisationId/onboarding', async (context) => {
    const environment = parseEnvironment(context.env);
    const { membership } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.manage',
    );
    const onboarding = await new OnboardingService(prismaFor(environment)).get(
      context.req.param('organisationId'),
    );
    return context.json({
      ...onboarding,
      invitations: membership.role.capabilities.includes('organisation.users.manage')
        ? onboarding.invitations
        : [],
    });
  });
  app.put('/api/v1/organisations/:organisationId/brand-profile', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.manage',
    );
    return context.json({
      profile: await new OnboardingService(prismaFor(environment)).saveProfile(
        context.req.param('organisationId'),
        brandProfileInput.parse(await context.req.json()),
      ),
    });
  });
  app.post('/api/v1/organisations/:organisationId/accreditations', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.manage',
    );
    return context.json(
      {
        accreditation: await new OnboardingService(prismaFor(environment)).addAccreditation(
          context.req.param('organisationId'),
          accreditationInput.parse(await context.req.json()),
        ),
      },
      201,
    );
  });
  app.patch('/api/v1/organisations/:organisationId/brand-profile/logo', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.manage',
    );
    const input = z.object({ mediaId: z.uuid() }).parse(await context.req.json());
    return context.json({
      profile: await new OnboardingService(prismaFor(environment)).setLogo(
        context.req.param('organisationId'),
        input.mediaId,
      ),
    });
  });
  app.post('/api/v1/organisations/:organisationId/invitations', async (context) => {
    const environment = parseEnvironment(context.env);
    const { user, membership } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.users.manage',
    );
    const input = invitationInput.parse(await context.req.json());
    await new AccessService(prismaFor(environment)).assertRoleKeyAssignable(
      context.req.param('organisationId'),
      input.roleKey,
      { userId: user.id, roleKey: membership.role.key, capabilities: membership.role.capabilities },
    );
    const result = await new OnboardingService(prismaFor(environment)).invite(
      context.req.param('organisationId'),
      user.id,
      input,
    );
    return context.json(
      { invitation: result.invitation, inviteUrl: `/signup?invitation=${result.token}` },
      201,
    );
  });
  app.delete('/api/v1/organisations/:organisationId/invitations/:invitationId', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      context.req.param('organisationId'),
      'organisation.users.manage',
    );
    await new OnboardingService(prismaFor(environment)).revoke(
      context.req.param('organisationId'),
      context.req.param('invitationId'),
    );
    return context.body(null, 204);
  });
  app.post('/api/v1/invitations/accept', async (context) => {
    const environment = parseEnvironment(context.env);
    const account = await identityService(environment, options).currentUser(context.get('actor'));
    const input = z.object({ token: z.string().min(32).max(200) }).parse(await context.req.json());
    return context.json({
      organisation: await new OnboardingService(prismaFor(environment)).acceptInvitation(
        input.token,
        account.user,
        context.get('correlationId'),
      ),
    });
  });
  app.get('/api/v1/customers', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'customers.read',
    );
    return context.json(
      await new PortfolioService(prismaFor(environment)).listCustomers(
        organisationId,
        context.req.query('q') ?? '',
        Math.max(1, Number(context.req.query('page') ?? 1)),
        Math.min(100, Math.max(1, Number(context.req.query('pageSize') ?? 25))),
      ),
    );
  });
  app.post('/api/v1/customers', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = customerInput
      .extend({ organisationId: z.uuid() })
      .parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      input.organisationId,
      'customers.manage',
    );
    const { organisationId, ...customer } = input;
    return context.json(
      {
        customer: await new PortfolioService(prismaFor(environment)).createCustomer(
          organisationId,
          user.id,
          context.get('correlationId'),
          customer,
        ),
      },
      201,
    );
  });
  app.get('/api/v1/customers/:customerId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'customers.read',
    );
    return context.json({
      customer: await new PortfolioService(prismaFor(environment)).getCustomer(
        organisationId,
        context.req.param('customerId'),
      ),
    });
  });
  app.patch('/api/v1/customers/:customerId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = customerUpdateInput.parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'customers.manage',
    );
    return context.json({
      customer: await new PortfolioService(prismaFor(environment)).updateCustomer(
        organisationId,
        context.req.param('customerId'),
        user.id,
        context.get('correlationId'),
        input,
      ),
    });
  });
  app.patch('/api/v1/customers/:customerId/logo', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const customerId = z.uuid().parse(context.req.param('customerId'));
    const input = z.object({ mediaId: z.uuid().nullable() }).parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'customers.manage',
    );
    return context.json({
      customer: await new PortfolioService(prismaFor(environment)).setCustomerLogo(
        organisationId,
        customerId,
        user.id,
        context.get('correlationId'),
        input.mediaId,
      ),
    });
  });
  app.delete('/api/v1/customers/:customerId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const customerId = z.uuid().parse(context.req.param('customerId'));
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'customers.manage',
    );
    await new PortfolioService(prismaFor(environment)).archiveCustomer(
      organisationId,
      customerId,
      user.id,
      context.get('correlationId'),
    );
    return context.body(null, 204);
  });
  app.post('/api/v1/sites', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = siteInput.extend({ organisationId: z.uuid() }).parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      input.organisationId,
      'sites.manage',
    );
    const { organisationId, ...site } = input;
    return context.json(
      {
        site: await new PortfolioService(prismaFor(environment)).createSite(
          organisationId,
          user.id,
          context.get('correlationId'),
          site,
        ),
      },
      201,
    );
  });
  app.get('/api/v1/sites/:siteId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'sites.read',
    );
    return context.json({
      site: await new PortfolioService(prismaFor(environment)).getSite(
        organisationId,
        context.req.param('siteId'),
      ),
    });
  });
  app.patch('/api/v1/sites/:siteId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = siteUpdateInput.parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'sites.manage',
    );
    return context.json({
      site: await new PortfolioService(prismaFor(environment)).updateSite(
        organisationId,
        context.req.param('siteId'),
        user.id,
        context.get('correlationId'),
        input,
      ),
    });
  });
  app.post('/api/v1/assets', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = assetInput.extend({ organisationId: z.uuid() }).parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      input.organisationId,
      'assets.manage',
    );
    const prisma = prismaFor(environment);
    if (isEvAssetType(input.assetType))
      await new EntitlementService(prisma).requireModule(input.organisationId, 'ev-charging');
    if (isEvAssetType(input.assetType))
      await identityService(environment, options).requireMembership(
        context.get('actor'),
        input.organisationId,
        'ev.assets.manage',
      );
    const { organisationId, ...asset } = input;
    return context.json(
      {
        asset: await new PortfolioService(prisma).createAsset(
          organisationId,
          user.id,
          context.get('correlationId'),
          asset,
        ),
      },
      201,
    );
  });
  app.patch('/api/v1/assets/:assetId/lifecycle', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = assetLifecycleInput.parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'assets.manage',
    );
    const prisma = prismaFor(environment);
    const existing = await prisma.asset.findFirst({
      where: { id: context.req.param('assetId'), organisationId },
      select: { assetType: true },
    });
    if (isEvAssetType(existing?.assetType)) {
      await new EntitlementService(prisma).requireModule(organisationId, 'ev-charging');
      await identityService(environment, options).requireMembership(
        context.get('actor'),
        organisationId,
        'ev.assets.manage',
      );
    }
    return context.json({
      asset: await new PortfolioService(prisma).updateAssetStatus(
        organisationId,
        context.req.param('assetId'),
        user.id,
        context.get('correlationId'),
        input.status,
        input.replacementAssetId,
      ),
    });
  });
  app.patch('/api/v1/assets/:assetId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = assetUpdateInput.parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'assets.manage',
    );
    const prisma = prismaFor(environment);
    const existing = await prisma.asset.findFirst({
      where: { id: context.req.param('assetId'), organisationId },
      select: { assetType: true },
    });
    if (isEvAssetType(existing?.assetType) || isEvAssetType(input.assetType))
      await new EntitlementService(prisma).requireModule(organisationId, 'ev-charging');
    if (isEvAssetType(existing?.assetType) || isEvAssetType(input.assetType))
      await identityService(environment, options).requireMembership(
        context.get('actor'),
        organisationId,
        'ev.assets.manage',
      );
    return context.json({
      asset: await new PortfolioService(prisma).updateAsset(
        organisationId,
        context.req.param('assetId'),
        user.id,
        context.get('correlationId'),
        input,
      ),
    });
  });
  app.post('/api/v1/contacts', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = contactInput.extend({ organisationId: z.uuid() }).parse(await context.req.json());
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      input.organisationId,
      'customers.manage',
    );
    const { organisationId, ...contact } = input;
    return context.json(
      {
        contact: await new PortfolioService(prismaFor(environment)).addContact(
          organisationId,
          contact,
        ),
      },
      201,
    );
  });
  app.get('/api/v1/tags', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      organisationId,
      ['assets.read', 'ev.assets.read'],
    );
    return context.json({
      tags: await new PortfolioService(prismaFor(environment)).listTags(organisationId),
    });
  });
  app.post('/api/v1/tags', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = tagInput.extend({ organisationId: z.uuid() }).parse(await context.req.json());
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      input.organisationId,
      'assets.manage',
    );
    const { organisationId, ...tag } = input;
    return context.json(
      { tag: await new PortfolioService(prismaFor(environment)).createTag(organisationId, tag) },
      201,
    );
  });
  app.post('/api/v1/documents', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = documentInput
      .extend({ organisationId: z.uuid() })
      .parse(await context.req.json());
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      input.organisationId,
      'assets.manage',
    );
    const { organisationId, ...document } = input;
    return context.json(
      {
        document: await new PortfolioService(prismaFor(environment)).addDocument(
          organisationId,
          document,
        ),
      },
      201,
    );
  });
  app.post('/api/v1/media', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = mediaInput.extend({ organisationId: z.uuid() }).parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      input.organisationId,
      mediaWriteCapability(input.entityType),
    );
    const prisma = prismaFor(environment);
    if (input.entityType === 'Inspection') {
      const moduleKey = await requireInspectionModule(prisma, input.organisationId, input.entityId);
      await requireSpecialistRoleCapability(
        environment,
        options,
        context.get('actor'),
        input.organisationId,
        moduleKey,
        'perform',
      );
    }
    const { organisationId, ...media } = input;
    return context.json(
      {
        media: await new PortfolioService(prisma).registerMedia(organisationId, user.id, media),
      },
      201,
    );
  });
  app.put('/api/v1/media/:mediaId/content', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    if (environment.MEDIA_BUCKET === undefined)
      throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);
    const portfolio = new PortfolioService(prismaFor(environment));
    const mediaId = z.uuid().parse(context.req.param('mediaId'));
    const media = await portfolio.getMedia(organisationId, mediaId);
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      mediaWriteCapability(
        media.entityType as 'Organisation' | 'Customer' | 'Site' | 'Asset' | 'Inspection',
      ),
    );
    if (media.entityType === 'Inspection') {
      const moduleKey = await requireInspectionModule(
        prismaFor(environment),
        organisationId,
        media.entityId,
      );
      await requireSpecialistRoleCapability(
        environment,
        options,
        context.get('actor'),
        organisationId,
        moduleKey,
        'perform',
      );
    }
    const contentType = context.req.header('content-type') ?? '';
    if (contentType !== media.mimeType)
      throw new DomainError(
        'MEDIA_TYPE_MISMATCH',
        'The uploaded file type does not match its media record.',
        422,
      );
    const contentLength = Number(context.req.header('content-length') ?? 0);
    if (contentLength > 2_000_000)
      throw new DomainError('MEDIA_TOO_LARGE', 'Images must be 2 MB or smaller.', 413);
    await environment.MEDIA_BUCKET.put(media.storageKey, context.req.raw.body, {
      httpMetadata: { contentType: media.mimeType },
    });
    return context.json({ media: await portfolio.markMediaAvailable(media.id) });
  });
  app.patch('/api/v1/media/:mediaId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'inspections.perform',
    );
    const prisma = prismaFor(environment);
    const mediaId = z.uuid().parse(context.req.param('mediaId'));
    const media = await new PortfolioService(prisma).getMedia(organisationId, mediaId);
    if (media.entityType !== 'Inspection')
      throw new DomainError('INVALID_MEDIA_ENTITY', 'Only inspection media can be updated.', 422);
    const moduleKey = await requireInspectionModule(prisma, organisationId, media.entityId);
    await requireSpecialistRoleCapability(
      environment,
      options,
      context.get('actor'),
      organisationId,
      moduleKey,
      'perform',
    );
    return context.json({
      media: await new PortfolioService(prisma).updateInspectionMedia(
        organisationId,
        mediaId,
        mediaUpdateInput.parse(await context.req.json()),
      ),
    });
  });
  app.get('/api/v1/media/:mediaId/content', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    if (environment.MEDIA_BUCKET === undefined)
      throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);
    const mediaId = z.uuid().parse(context.req.param('mediaId'));
    const media = await new PortfolioService(prismaFor(environment)).getMedia(
      organisationId,
      mediaId,
    );
    if (media.entityType === 'Organisation')
      await identityService(environment, options).requireMembership(
        context.get('actor'),
        organisationId,
      );
    else if (media.entityType === 'Customer')
      await identityService(environment, options).requireMembership(
        context.get('actor'),
        organisationId,
        'customers.read',
      );
    else if (media.entityType === 'Site')
      await identityService(environment, options).requireMembership(
        context.get('actor'),
        organisationId,
        'sites.read',
      );
    else if (media.entityType === 'Asset')
      await identityService(environment, options).requireMembership(
        context.get('actor'),
        organisationId,
        'assets.read',
      );
    else {
      await identityService(environment, options).requireAnyCapability(
        context.get('actor'),
        organisationId,
        ['inspections.perform', 'inspections.review', 'inspections.approve'],
      );
      await requireInspectionModule(prismaFor(environment), organisationId, media.entityId);
    }
    const object = await environment.MEDIA_BUCKET.get(media.storageKey);
    if (object === null)
      throw new DomainError('MEDIA_CONTENT_NOT_FOUND', 'The media content was not found.', 404);
    return new Response(object.body, {
      headers: { 'content-type': media.mimeType, 'cache-control': 'private, max-age=300' },
    });
  });
  app.delete('/api/v1/media/:mediaId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const portfolio = new PortfolioService(prismaFor(environment));
    const mediaId = z.uuid().parse(context.req.param('mediaId'));
    const existingMedia = await portfolio.getMedia(organisationId, mediaId);
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      mediaWriteCapability(
        existingMedia.entityType as 'Organisation' | 'Customer' | 'Site' | 'Asset' | 'Inspection',
      ),
    );
    if (existingMedia.entityType === 'Inspection') {
      const moduleKey = await requireInspectionModule(
        prismaFor(environment),
        organisationId,
        existingMedia.entityId,
      );
      await requireSpecialistRoleCapability(
        environment,
        options,
        context.get('actor'),
        organisationId,
        moduleKey,
        'perform',
      );
    }
    const media = await portfolio.deleteMedia(organisationId, mediaId);
    if (environment.MEDIA_BUCKET !== undefined)
      await environment.MEDIA_BUCKET.delete(media.storageKey);
    return context.json({ deleted: true });
  });
  app.patch('/api/v1/sites/:siteId/photos/primary', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const siteId = context.req.param('siteId');
    const actor = context.get('actor');
    await identityService(environment, options).requireMembership(
      actor,
      organisationId,
      'sites.manage',
    );
    const body = await context.req.json<{ mediaId: string | null }>();
    const prisma = prismaFor(environment);
    await new PortfolioService(prisma).setSitePhotoPrimary(
      organisationId,
      siteId,
      body.mediaId ?? null,
    );
    return context.json({ updated: true });
  });
  app.get('/api/v1/sites', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'sites.read',
    );
    const query = (context.req.query('q') ?? '').trim();
    return context.json({
      sites: await prismaFor(environment).site.findMany({
        where: {
          organisationId,
          status: { not: 'ARCHIVED' },
          ...(query === ''
            ? {}
            : {
                OR: [
                  { name: { contains: query, mode: 'insensitive' } },
                  { postcode: { contains: query, mode: 'insensitive' } },
                  { reference: { contains: query, mode: 'insensitive' } },
                  { customer: { name: { contains: query, mode: 'insensitive' } } },
                ],
              }),
        },
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { assets: true } },
        },
        orderBy: { name: 'asc' },
        take: query === '' ? 30 : 50,
      }),
    });
  });
  app.get('/api/v1/schedules', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'sites.read',
    );
    return context.json({
      schedules: await new ScheduleService(prismaFor(environment)).listRules(organisationId),
    });
  });
  app.post('/api/v1/schedules', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = scheduleInput
      .extend({ organisationId: z.uuid() })
      .parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      input.organisationId,
      'sites.manage',
    );
    const prisma = prismaFor(environment);
    await requireModuleForKey(prisma, input.organisationId, input.moduleKey);
    const { organisationId, ...schedule } = input;
    return context.json(
      {
        schedule: await new ScheduleService(prisma).create(
          organisationId,
          user.id,
          context.get('correlationId'),
          schedule,
        ),
      },
      201,
    );
  });
  app.get('/api/v1/calendar', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'sites.read',
    );
    const from = z.coerce.date().parse(context.req.query('from'));
    const to = z.coerce.date().parse(context.req.query('to'));
    return context.json({
      occurrences: await new ScheduleService(prismaFor(environment)).calendar(
        organisationId,
        from,
        to,
      ),
    });
  });
  app.get('/api/v1/notifications/preferences', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
    );
    return context.json({
      preferences: await new ScheduleService(prismaFor(environment)).preferences(organisationId),
    });
  });
  app.put('/api/v1/notifications/preferences', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = notificationPreferenceInput.parse(await context.req.json());
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'organisation.manage',
    );
    return context.json({
      preferences: await new ScheduleService(prismaFor(environment)).updatePreferences(
        organisationId,
        input,
      ),
    });
  });
  app.get('/api/v1/notifications', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
    );
    return context.json({
      notifications: await new ScheduleService(prismaFor(environment)).notifications(
        organisationId,
      ),
    });
  });
  app.get('/api/v1/visits', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'sites.read',
    );
    const query = z
      .object({
        q: z.string().max(120).optional(),
        status: z
          .enum(['ALL', 'DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'CANCELLED'])
          .optional(),
        dateField: z.enum(['scheduled', 'completed']).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        sort: z.enum(['scheduled', 'completed', 'title', 'status']).optional(),
        direction: z.enum(['asc', 'desc']).optional(),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(10).max(100).optional(),
      })
      .parse(context.req.query());
    return context.json(
      await new VisitService(prismaFor(environment)).list(organisationId, {
        ...(query.q === undefined ? {} : { query: query.q }),
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.dateField === undefined ? {} : { dateField: query.dateField }),
        ...(query.from === undefined ? {} : { from: new Date(query.from + 'T00:00:00.000Z') }),
        ...(query.to === undefined ? {} : { to: new Date(query.to + 'T23:59:59.999Z') }),
        ...(query.sort === undefined ? {} : { sort: query.sort }),
        ...(query.direction === undefined ? {} : { direction: query.direction }),
        ...(query.page === undefined ? {} : { page: query.page }),
        ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
      }),
    );
  });
  app.post('/api/v1/visits', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = visitInput.extend({ organisationId: z.uuid() }).parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      input.organisationId,
      'visits.create',
    );
    const prisma = prismaFor(environment);
    for (const moduleKey of new Set(input.tasks.map((task) => task.moduleKey)))
      await requireModuleForKey(prisma, input.organisationId, moduleKey);
    const { organisationId, ...visit } = input;
    return context.json(
      {
        visit: await new VisitService(prisma).create(
          organisationId,
          user.id,
          context.get('correlationId'),
          visit,
        ),
      },
      201,
    );
  });
  app.get('/api/v1/visits/:visitId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'sites.read',
    );
    return context.json({
      visit: await new VisitService(prismaFor(environment)).detail(
        organisationId,
        context.req.param('visitId'),
      ),
    });
  });
  app.post('/api/v1/visits/:visitId/ev-assets', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = engineerEvAssetInput.parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'inspections.perform',
    );
    const prisma = prismaFor(environment);
    await new EntitlementService(prisma).requireModule(organisationId, 'ev-charging');
    const created = await new VisitService(prisma).addEvAsset(
      organisationId,
      context.req.param('visitId'),
      user.id,
      context.get('correlationId'),
      input,
    );
    const inspection = await new InspectionService(prisma).start(organisationId, created.task.id);
    return context.json({ ...created, inspection }, 201);
  });
  app.post('/api/v1/visits/:visitId/guest-link', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'visits.assign',
    );
    const input = z
      .object({ validDays: z.number().int().min(1).max(30).default(7) })
      .parse(await context.req.json());
    const result = await new VisitService(prismaFor(environment)).guestLink(
      organisationId,
      context.req.param('visitId'),
      input.validDays,
    );
    return context.json({ ...result, guestUrl: `/guest/visit/${result.token}` }, 201);
  });
  app.post('/api/v1/visits/:visitId/sync', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'inspections.perform',
    );
    const input = syncInput.parse(await context.req.json());
    const prisma = prismaFor(environment);
    if (input.operation === 'SUBMIT_INSPECTION') {
      const submission = z
        .object({ inspectionId: z.uuid(), submission: inspectionSubmissionInput })
        .parse(input.payload);
      const inspection = await new InspectionService(prisma).detail(
        organisationId,
        submission.inspectionId,
      );
      if (inspection.visitId !== context.req.param('visitId'))
        throw new DomainError(
          'INSPECTION_NOT_FOUND',
          'The inspection does not belong to this visit.',
          404,
        );
      await requireModuleForKey(prisma, organisationId, inspection.moduleKey);
      await new InspectionService(prisma).submit(
        organisationId,
        submission.inspectionId,
        user.id,
        context.get('correlationId'),
        submission.submission,
        input.clientMutationId,
      );
    }
    return context.json({
      mutation: await new VisitService(prisma).applySync(
        organisationId,
        context.req.param('visitId'),
        input.clientMutationId,
        input.entityType,
        input.operation,
        input.payload,
      ),
    });
  });
  app.get('/api/v1/guest/visits/:token', async (context) => {
    const environment = parseEnvironment(context.env);
    const visitService = new VisitService(prismaFor(environment));
    const inspectionService = new InspectionService(prismaFor(environment));
    let visit = await visitService.guestPack(context.req.param('token'));
    for (const task of visit.tasks) {
      if (task.inspection === null) {
        await requireModuleForKey(prismaFor(environment), visit.organisationId, task.moduleKey);
        await inspectionService.start(visit.organisationId, task.id);
      }
    }
    visit = await visitService.guestPack(context.req.param('token'));
    return context.json({
      visit,
    });
  });
  app.get('/api/v1/guest/visits/:token/inspections/:inspectionId', async (context) => {
    const environment = parseEnvironment(context.env);
    const prisma = prismaFor(environment);
    const visit = await new VisitService(prisma).guestPack(context.req.param('token'));
    const inspectionId = z.uuid().parse(context.req.param('inspectionId'));
    if (!visit.tasks.some((task) => task.inspection?.id === inspectionId))
      throw new DomainError(
        'INSPECTION_NOT_FOUND',
        'The inspection is not assigned to this visit.',
        404,
      );
    return context.json({
      inspection: await new InspectionService(prisma).detail(visit.organisationId, inspectionId),
    });
  });
  app.post('/api/v1/guest/visits/:token/ev-assets', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = engineerEvAssetInput.parse(await context.req.json());
    const prisma = prismaFor(environment);
    const visit = await new VisitService(prisma).guestPack(context.req.param('token'));
    await new EntitlementService(prisma).requireModule(visit.organisationId, 'ev-charging');
    const created = await new VisitService(prisma).addEvAsset(
      visit.organisationId,
      visit.id,
      undefined,
      context.get('correlationId'),
      input,
    );
    const inspection = await new InspectionService(prisma).start(
      visit.organisationId,
      created.task.id,
    );
    return context.json({ ...created, inspection }, 201);
  });
  app.get('/api/v1/guest/visits/:token/media/:mediaId/content', async (context) => {
    const environment = parseEnvironment(context.env);
    if (environment.MEDIA_BUCKET === undefined)
      throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);
    const media = await new VisitService(prismaFor(environment)).guestMedia(
      context.req.param('token'),
      context.req.param('mediaId'),
    );
    const object = await environment.MEDIA_BUCKET.get(media.storageKey);
    if (object === null)
      throw new DomainError('MEDIA_CONTENT_NOT_FOUND', 'The media content was not found.', 404);
    return new Response(object.body, {
      headers: { 'content-type': media.mimeType, 'cache-control': 'private, max-age=300' },
    });
  });
  app.get('/api/v1/guest/visits/:token/equipment', async (context) => {
    const environment = parseEnvironment(context.env);
    const visit = await new VisitService(prismaFor(environment)).guestPack(
      context.req.param('token'),
    );
    return context.json({
      equipment: await new EquipmentService(prismaFor(environment)).list(visit.organisationId),
    });
  });
  app.patch('/api/v1/guest/visits/:token/media/:mediaId', async (context) => {
    const environment = parseEnvironment(context.env);
    const prisma = prismaFor(environment);
    const media = await new VisitService(prisma).guestMedia(
      context.req.param('token'),
      z.uuid().parse(context.req.param('mediaId')),
    );
    if (media.entityType !== 'Inspection')
      throw new DomainError(
        'MEDIA_NOT_INSPECTION',
        'Only inspection images can be edited here.',
        422,
      );
    return context.json({
      media: await new PortfolioService(prisma).updateInspectionMedia(
        media.organisationId,
        media.id,
        mediaUpdateInput.parse(await context.req.json()),
      ),
    });
  });
  app.get('/api/v1/guest/visits/:token/assets/:assetId/display-image', async (context) => {
    const environment = parseEnvironment(context.env);
    if (environment.MEDIA_BUCKET === undefined)
      throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);
    const prisma = prismaFor(environment);
    const visit = await new VisitService(prisma).guestPack(context.req.param('token'));
    const assetId = z.uuid().parse(context.req.param('assetId'));
    if (!visit.tasks.some((task) => task.asset?.id === assetId))
      throw new DomainError('ASSET_NOT_FOUND', 'The asset was not found in this visit.', 404);
    const custom = await prisma.media.findFirst({
      where: {
        organisationId: visit.organisationId,
        entityType: 'Asset',
        entityId: assetId,
        status: 'AVAILABLE',
      },
      orderBy: { createdAt: 'desc' },
    });
    const media =
      custom ??
      (await new PlatformService(prisma).stockImageForAsset(assetId, visit.organisationId));
    if (media === null)
      throw new DomainError('DISPLAY_IMAGE_NOT_FOUND', 'No charger image is available.', 404);
    const object = await environment.MEDIA_BUCKET.get(media.storageKey);
    if (object === null)
      throw new DomainError('MEDIA_CONTENT_NOT_FOUND', 'The image content was not found.', 404);
    return new Response(object.body, {
      headers: { 'content-type': media.mimeType, 'cache-control': 'private, max-age=3600' },
    });
  });
  app.post('/api/v1/guest/visits/:token/inspections/:inspectionId/media', async (context) => {
    const environment = parseEnvironment(context.env);
    if (environment.MEDIA_BUCKET === undefined)
      throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);
    const mimeType = z
      .enum(['image/jpeg', 'image/png', 'image/webp'])
      .parse(context.req.header('content-type'));
    const size = Number(
      context.req.header('x-file-size') ?? context.req.header('content-length') ?? 0,
    );
    if (!Number.isSafeInteger(size) || size < 1 || size > 2_000_000)
      throw new DomainError('MEDIA_SIZE_INVALID', 'Images must be 2 MB or smaller.', 422);
    const visitService = new VisitService(prismaFor(environment));
    const owner = await visitService.guestInspectionAsset(
      context.req.param('token'),
      context.req.param('inspectionId'),
    );
    const portfolio = new PortfolioService(prismaFor(environment));
    const media = await portfolio.registerMedia(owner.organisationId, undefined, {
      entityType: 'Asset',
      entityId: owner.assetId,
      category: 'inspection-fault',
      caption: 'Engineer inspection evidence',
      mimeType,
      size,
    });
    await environment.MEDIA_BUCKET.put(media.storageKey, context.req.raw.body, {
      httpMetadata: { contentType: mimeType },
    });
    return context.json({ media: await portfolio.markMediaAvailable(media.id) }, 201);
  });
  app.post(
    '/api/v1/guest/visits/:token/inspections/:inspectionId/thermal-media',
    async (context) => {
      const environment = parseEnvironment(context.env);
      if (environment.MEDIA_BUCKET === undefined)
        throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);
      const mimeType = z
        .enum(['image/jpeg', 'image/png', 'image/webp'])
        .parse(context.req.header('content-type'));
      const size = Number(
        context.req.header('x-file-size') ?? context.req.header('content-length') ?? 0,
      );
      if (!Number.isSafeInteger(size) || size < 1 || size > 2_000_000)
        throw new DomainError('MEDIA_SIZE_INVALID', 'Images must be 2 MB or smaller.', 422);
      const kind = z.enum(['unclassified', 'thermal', 'standard']).parse(context.req.query('kind'));
      const originalFilename = optionalTrimmed(500).parse(context.req.query('name'));
      const prisma = prismaFor(environment);
      const visit = await new VisitService(prisma).guestPack(context.req.param('token'));
      await new EntitlementService(prisma).requireModule(visit.organisationId, 'thermal-imaging');
      const inspectionId = z.uuid().parse(context.req.param('inspectionId'));
      if (
        !visit.tasks.some(
          (task) => task.inspection?.id === inspectionId && task.moduleKey === 'thermal-imaging',
        )
      )
        throw new DomainError(
          'INSPECTION_NOT_FOUND',
          'The thermal inspection is not assigned to this visit.',
          404,
        );
      const portfolio = new PortfolioService(prisma);
      const media = await portfolio.registerMedia(visit.organisationId, undefined, {
        entityType: 'Inspection',
        entityId: inspectionId,
        category:
          kind === 'thermal'
            ? 'thermal-image'
            : kind === 'standard'
              ? 'standard-image'
              : 'unclassified-image',
        caption:
          originalFilename ??
          (kind === 'thermal'
            ? 'Infrared image'
            : kind === 'standard'
              ? 'Standard image'
              : 'Uploaded image'),
        ...(originalFilename === undefined ? {} : { originalFilename }),
        mimeType,
        size,
      });
      await environment.MEDIA_BUCKET.put(media.storageKey, context.req.raw.body, {
        httpMetadata: { contentType: mimeType },
      });
      return context.json({ media: await portfolio.markMediaAvailable(media.id) }, 201);
    },
  );
  app.post('/api/v1/guest/visits/:token/tasks/:taskId/start', async (context) => {
    const environment = parseEnvironment(context.env);
    const visit = await new VisitService(prismaFor(environment)).guestPack(
      context.req.param('token'),
    );
    if (!visit.tasks.some((task) => task.id === context.req.param('taskId')))
      throw new DomainError('VISIT_TASK_NOT_FOUND', 'The task is not assigned to this visit.', 404);
    await requireVisitTaskModule(
      prismaFor(environment),
      visit.organisationId,
      context.req.param('taskId'),
    );
    return context.json({
      inspection: await new InspectionService(prismaFor(environment)).start(
        visit.organisationId,
        context.req.param('taskId'),
      ),
    });
  });
  app.get('/api/v1/inspections', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'inspections.review',
    );
    return context.json({
      inspections: await new InspectionService(prismaFor(environment)).list(
        organisationId,
        context.req.query('status'),
      ),
    });
  });
  app.post('/api/v1/inspections/start', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = z
      .object({ organisationId: z.uuid(), visitTaskId: z.uuid() })
      .parse(await context.req.json());
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      input.organisationId,
      'inspections.perform',
    );
    const prisma = prismaFor(environment);
    const moduleKey = await requireVisitTaskModule(prisma, input.organisationId, input.visitTaskId);
    await requireSpecialistRoleCapability(
      environment,
      options,
      context.get('actor'),
      input.organisationId,
      moduleKey,
      'perform',
    );
    return context.json(
      {
        inspection: await new InspectionService(prisma).start(
          input.organisationId,
          input.visitTaskId,
        ),
      },
      201,
    );
  });
  app.get('/api/v1/inspections/:inspectionId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireAnyCapability(
      context.get('actor'),
      organisationId,
      ['inspections.perform', 'inspections.review', 'inspections.approve'],
    );
    await requireInspectionModule(
      prismaFor(environment),
      organisationId,
      context.req.param('inspectionId'),
    );
    return context.json({
      inspection: await new InspectionService(prismaFor(environment)).detail(
        organisationId,
        context.req.param('inspectionId'),
      ),
    });
  });
  app.post('/api/v1/inspections/:inspectionId/data-plate-analysis', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = z.uuid().parse(context.req.query('organisationId'));
    const inspectionId = z.uuid().parse(context.req.param('inspectionId'));
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'inspections.perform',
    );
    const moduleKey = await requireInspectionModule(
      prismaFor(environment),
      organisationId,
      inspectionId,
    );
    if (moduleKey !== 'ev-charging')
      throw new DomainError(
        'DATA_PLATE_ANALYSIS_UNAVAILABLE',
        'Data plate analysis is only available for EV charger inspections.',
        422,
      );
    await requireSpecialistRoleCapability(
      environment,
      options,
      context.get('actor'),
      organisationId,
      moduleKey,
      'perform',
    );
    return context.json(
      await analyseChargerDataPlate(environment, context.req.raw, context.get('correlationId'), {
        organisationId,
        inspectionId,
        access: 'member',
      }),
    );
  });
  app.post('/api/v1/inspections/:inspectionId/submit', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = inspectionSubmissionInput.parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'inspections.perform',
    );
    const prisma = prismaFor(environment);
    const moduleKey = await requireInspectionModule(
      prisma,
      organisationId,
      context.req.param('inspectionId'),
    );
    await requireSpecialistRoleCapability(
      environment,
      options,
      context.get('actor'),
      organisationId,
      moduleKey,
      'perform',
    );
    return context.json(
      {
        revision: await new InspectionService(prisma).submit(
          organisationId,
          context.req.param('inspectionId'),
          user.id,
          context.get('correlationId'),
          input,
        ),
      },
      201,
    );
  });
  app.post('/api/v1/guest/visits/:token/inspections/:inspectionId/submit', async (context) => {
    const environment = parseEnvironment(context.env);
    const visit = await new VisitService(prismaFor(environment)).guestPack(
      context.req.param('token'),
    );
    const inspection = await new InspectionService(prismaFor(environment)).detail(
      visit.organisationId,
      context.req.param('inspectionId'),
    );
    if (inspection.visitId !== visit.id)
      throw new DomainError(
        'INSPECTION_NOT_FOUND',
        'The inspection is not assigned to this visit.',
        404,
      );
    await requireModuleForKey(prismaFor(environment), visit.organisationId, inspection.moduleKey);
    const input = inspectionSubmissionInput.parse(await context.req.json());
    return context.json(
      {
        revision: await new InspectionService(prismaFor(environment)).submit(
          visit.organisationId,
          inspection.id,
          undefined,
          context.get('correlationId'),
          input,
          context.req.header('x-client-mutation-id'),
        ),
      },
      201,
    );
  });
  app.post(
    '/api/v1/guest/visits/:token/inspections/:inspectionId/data-plate-analysis',
    async (context) => {
      const environment = parseEnvironment(context.env);
      const visit = await new VisitService(prismaFor(environment)).guestPack(
        context.req.param('token'),
      );
      const inspection = await new InspectionService(prismaFor(environment)).detail(
        visit.organisationId,
        z.uuid().parse(context.req.param('inspectionId')),
      );
      if (inspection.visitId !== visit.id || inspection.moduleKey !== 'ev-charging')
        throw new DomainError(
          'INSPECTION_NOT_FOUND',
          'The EV inspection is not assigned to this visit.',
          404,
        );
      await requireModuleForKey(prismaFor(environment), visit.organisationId, inspection.moduleKey);
      return context.json(
        await analyseChargerDataPlate(environment, context.req.raw, context.get('correlationId'), {
          organisationId: visit.organisationId,
          inspectionId: inspection.id,
          access: 'guest',
        }),
      );
    },
  );
  app.get('/api/v1/ev-test-instructions', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = z.uuid().parse(context.req.query('organisationId'));
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'inspections.perform',
    );
    await requireModuleForKey(prismaFor(environment), organisationId, 'ev-charging');
    return context.json(
      await new InstructionService(prismaFor(environment)).contentFor(
        evTestStepSchema.parse((context.req.query('step') ?? '').trim()),
        context.req.query('manufacturer'),
      ),
    );
  });
  app.get('/api/v1/guest/visits/:token/ev-test-instructions', async (context) => {
    const environment = parseEnvironment(context.env);
    const visit = await new VisitService(prismaFor(environment)).guestPack(
      context.req.param('token'),
    );
    await requireModuleForKey(prismaFor(environment), visit.organisationId, 'ev-charging');
    return context.json(
      await new InstructionService(prismaFor(environment)).contentFor(
        evTestStepSchema.parse((context.req.query('step') ?? '').trim()),
        context.req.query('manufacturer'),
      ),
    );
  });
  app.post('/api/v1/inspections/:inspectionId/review', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = z.object({ approved: z.boolean() }).parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'inspections.approve',
    );
    const prisma = prismaFor(environment);
    await requireInspectionModule(prisma, organisationId, context.req.param('inspectionId'));
    return context.json({
      inspection: await new InspectionService(prisma).review(
        organisationId,
        context.req.param('inspectionId'),
        user.id,
        context.get('correlationId'),
        input.approved,
      ),
    });
  });
  app.post('/api/v1/inspections/:inspectionId/override', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = inspectionOverrideInput.parse(await context.req.json());
    const { user } = await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      organisationId,
      ['inspections.review', 'inspections.approve'],
    );
    const prisma = prismaFor(environment);
    await requireInspectionModule(prisma, organisationId, context.req.param('inspectionId'));
    return context.json({
      revision: await new InspectionService(prisma).overrideSubmission(
        organisationId,
        context.req.param('inspectionId'),
        user.id,
        context.get('correlationId'),
        input,
      ),
    });
  });
  app.post('/api/v1/proposed-asset-changes/:changeId/review', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = z
      .object({
        approved: z.boolean(),
        resolvedData: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await context.req.json());
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'assets.manage',
    );
    return context.json({
      change: await new InspectionService(prismaFor(environment)).reviewProposedAssetChange(
        organisationId,
        context.req.param('changeId'),
        user.id,
        context.get('correlationId'),
        input.approved,
        input.resolvedData,
      ),
    });
  });
  app.post('/api/v1/inspections/:inspectionId/documents', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'certificates.issue',
    );
    const prisma = prismaFor(environment);
    const moduleKey = await requireInspectionModule(
      prisma,
      organisationId,
      context.req.param('inspectionId'),
    );
    await requireSpecialistRoleCapability(
      environment,
      options,
      context.get('actor'),
      organisationId,
      moduleKey,
      'issue',
    );
    return context.json(
      {
        document: await new InspectionService(prisma).issueDocument(
          organisationId,
          context.req.param('inspectionId'),
          user.id,
          context.get('correlationId'),
        ),
      },
      201,
    );
  });
  app.post('/api/v1/visits/:visitId/documents', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const { user } = await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'certificates.issue',
    );
    const prisma = prismaFor(environment);
    const visitId = z.uuid().parse(context.req.param('visitId'));
    const moduleKeys = await requireVisitModules(prisma, organisationId, visitId);
    await Promise.all(
      moduleKeys.map((moduleKey) =>
        requireSpecialistRoleCapability(
          environment,
          options,
          context.get('actor'),
          organisationId,
          moduleKey,
          'issue',
        ),
      ),
    );
    return context.json(
      {
        documents: await new InspectionService(prisma).issueVisitDocuments(
          organisationId,
          visitId,
          user.id,
          context.get('correlationId'),
        ),
      },
      201,
    );
  });
  app.get('/api/v1/visits/:visitId/report.pdf', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const visitId = z.uuid().parse(context.req.param('visitId'));
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'certificates.generate',
    );
    await requireVisitModules(prismaFor(environment), organisationId, visitId);
    if (environment.PDF_WORKER === undefined && environment.PDF_WORKER_URL === undefined)
      throw new DomainError(
        'PDF_RENDERER_UNAVAILABLE',
        'PDF rendering is not configured for this environment.',
        503,
      );
    const prisma = prismaFor(environment);
    const [visit, visitDocuments, brand, accreditation] = await Promise.all([
      prisma.visit.findFirst({
        where: { id: visitId, organisationId },
        include: { customer: true, site: true },
      }),
      prisma.document.findMany({
        where: {
          organisationId,
          status: { not: 'ARCHIVED' },
          inspectionRevision: { inspection: { visitId } },
        },
        include: {
          inspectionRevision: {
            include: {
              inspection: {
                include: {
                  customer: true,
                  site: true,
                  asset: { include: { evChargePoint: true } },
                  defects: true,
                },
              },
              signatures: true,
              evData: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.organisationBrandProfile.findUnique({ where: { organisationId } }),
      prisma.organisationAccreditation.findFirst({
        where: { organisationId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The visit was not found.', 404);
    const currentDocumentByInspection = new Map<string, (typeof visitDocuments)[number]>();
    for (const document of visitDocuments) {
      const revision = document.inspectionRevision;
      if (
        revision !== null &&
        revision.revisionNumber === revision.inspection.currentRevisionNumber &&
        !currentDocumentByInspection.has(revision.inspection.id)
      )
        currentDocumentByInspection.set(revision.inspection.id, document);
    }
    const documents = [...currentDocumentByInspection.values()].sort((left, right) =>
      left.title.localeCompare(right.title),
    );
    if (documents.length === 0)
      throw new DomainError(
        'VISIT_REPORT_EMPTY',
        'Issue at least one certificate before opening the combined visit report.',
        409,
      );
    const assetIds = documents.flatMap(({ inspectionRevision }) =>
      inspectionRevision?.inspection.asset?.id ? [inspectionRevision.inspection.asset.id] : [],
    );
    const assetPhotos =
      assetIds.length === 0
        ? []
        : await prisma.media.findMany({
            where: {
              organisationId,
              entityType: 'Asset',
              entityId: { in: assetIds },
              category: 'asset-image',
              mimeType: 'image/jpeg',
              status: 'AVAILABLE',
            },
            orderBy: { createdAt: 'asc' },
          });
    const firstPhotoByAsset = new Map<string, (typeof assetPhotos)[number]>();
    for (const photo of assetPhotos)
      if (!firstPhotoByAsset.has(photo.entityId)) firstPhotoByAsset.set(photo.entityId, photo);
    const [companyLogoImage, locationLogoImage] = await Promise.all([
      mediaImageForReport(environment, prisma, organisationId, brand?.logoMediaId),
      mediaImageForReport(environment, prisma, organisationId, visit.customer.logoMediaId),
    ]);
    const printableValue = (value: unknown) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
        return `${value}`;
      return JSON.stringify(value) ?? '';
    };
    const certificates = await Promise.all(
      documents.flatMap((document) => {
        const revision = document.inspectionRevision;
        if (revision === null) return [];
        const inspection = revision.inspection;
        return [
          (async () => {
            const assetPhoto =
              inspection.asset === null ? undefined : firstPhotoByAsset.get(inspection.asset.id);
            const chargerPhotoJpegBase64 = await jpegMediaForReport(
              environment,
              prisma,
              organisationId,
              assetPhoto?.id,
            );
            return {
              title: document.title,
              organisationName:
                brand?.tradingName ?? brand?.registeredName ?? 'Ohm Audit Organisation',
              customerName: inspection.customer.name,
              siteName: inspection.site.name,
              ...(inspection.asset === null ? {} : { assetName: inspection.asset.displayName }),
              inspectionType: inspection.inspectionType,
              effectiveDate: (inspection.effectiveDate ?? revision.createdAt)
                .toISOString()
                .slice(0, 10),
              revisionNumber: revision.revisionNumber,
              engineerName: revision.signatures[0]?.signerName ?? 'Engineer',
              outcome: printableValue(
                (revision.data as Record<string, unknown>)['outcome'] ?? 'Recorded',
              ),
              summaryLines: Object.entries(revision.data as Record<string, unknown>)
                .slice(0, 25)
                .map(([key, value]) => `${key}: ${printableValue(value)}`),
              ...(inspection.moduleKey !== 'thermal-imaging'
                ? {}
                : {
                    thermalCertificate: await thermalCertificateData({
                      environment,
                      prisma,
                      organisationId,
                      revisionData: revision.data,
                      reportReference: document.id,
                      organisationName:
                        brand?.tradingName ?? brand?.registeredName ?? 'Ohm Audit Organisation',
                      customerName: inspection.customer.name,
                      siteName: inspection.site.name,
                      siteAddress: [
                        inspection.site.addressLine1 ?? '',
                        [
                          inspection.site.addressLine2,
                          inspection.site.city,
                          inspection.site.postcode,
                        ]
                          .filter(Boolean)
                          .join(', '),
                      ].filter(Boolean),
                      reportDate: inspection.effectiveDate ?? revision.createdAt,
                      engineerName: revision.signatures[0]?.signerName ?? 'Engineer',
                      ...(companyLogoImage === undefined ? {} : { logoImage: companyLogoImage }),
                    }),
                  }),
              ...(revision.evData === null || inspection.moduleKey !== 'ev-charging'
                ? {}
                : {
                    evCertificate: evCertificateData({
                      documentId: document.id,
                      testingCompany: {
                        name:
                          brand?.tradingName ?? brand?.registeredName ?? 'Ohm Audit Organisation',
                        addressLines: [
                          brand?.addressLine1 ?? '',
                          [brand?.addressLine2, brand?.city, brand?.postcode]
                            .filter(Boolean)
                            .join(', '),
                        ].filter(Boolean),
                        registrationNumber: accreditation?.registrationNumber ?? '',
                        ...reportLogoFields(companyLogoImage),
                      },
                      testingLocation: {
                        name: `${inspection.customer.name} — ${inspection.site.name}`,
                        addressLines: [
                          inspection.site.addressLine1 ?? '',
                          [
                            inspection.site.addressLine2,
                            inspection.site.city,
                            inspection.site.postcode,
                          ]
                            .filter(Boolean)
                            .join(', '),
                        ].filter(Boolean),
                        ...reportLogoFields(locationLogoImage),
                      },
                      charger: {
                        name: inspection.asset?.displayName ?? inspection.inspectionType,
                        location:
                          inspection.asset?.evChargePoint?.locationNotes ?? inspection.site.name,
                        make: inspection.asset?.manufacturer ?? '',
                        model: inspection.asset?.model ?? '',
                        serialNumber: inspection.asset?.serialNumber ?? '',
                        ...(chargerPhotoJpegBase64 === undefined
                          ? {}
                          : { photoJpegBase64: chargerPhotoJpegBase64 }),
                      },
                      evData: revision.evData,
                      revisionData: revision.data,
                      testDate: inspection.effectiveDate ?? revision.createdAt,
                      engineerName: revision.signatures[0]?.signerName ?? 'Engineer',
                      defects: inspection.defects,
                    }),
                  }),
            };
          })(),
        ];
      }),
    );
    const renderInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: `${visit.title} — combined report`,
        organisationName: brand?.tradingName ?? brand?.registeredName ?? 'Ohm Audit Organisation',
        customerName: visit.customer.name,
        siteName: visit.site.name,
        visitDate: visit.scheduledStart.toISOString().slice(0, 10),
        certificates,
        ...reportLogoFields(locationLogoImage),
      }),
    };
    return requestPdfRender(environment, '/render/visit-report', renderInit);
  });
  app.get('/api/v1/documents/:documentId/:documentFormat', async (context) => {
    const environment = parseEnvironment(context.env);
    const documentFormat = context.req.param('documentFormat');
    if (documentFormat !== 'pdf' && documentFormat !== 'html')
      throw new DomainError(
        'DOCUMENT_FORMAT_NOT_FOUND',
        'This document format is unavailable.',
        404,
      );
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'certificates.generate',
    );
    if (environment.PDF_WORKER === undefined && environment.PDF_WORKER_URL === undefined)
      throw new DomainError(
        'PDF_RENDERER_UNAVAILABLE',
        'PDF rendering is not configured for this environment.',
        503,
      );
    const documentId = z.uuid().parse(context.req.param('documentId'));
    const prisma = prismaFor(environment);
    const document = await prisma.document.findFirst({
      where: { id: documentId, organisationId },
      include: {
        inspectionRevision: {
          include: {
            inspection: {
              include: {
                customer: true,
                site: true,
                asset: { include: { evChargePoint: true } },
                defects: true,
              },
            },
            signatures: true,
            evData: true,
          },
        },
      },
    });
    if (document === null)
      throw new DomainError('DOCUMENT_NOT_FOUND', 'The document was not found.', 404);
    const revision = document.inspectionRevision;
    if (revision === null)
      throw new DomainError(
        'DOCUMENT_NOT_RENDERABLE',
        'This document does not have a structured inspection revision.',
        409,
      );
    const inspection = revision.inspection;
    const thermalPdfCacheKey =
      documentFormat === 'pdf' &&
      inspection.moduleKey === 'thermal-imaging' &&
      environment.MEDIA_BUCKET !== undefined
        ? `generated-reports/browser-v2/${organisationId}/${document.id}.pdf`
        : undefined;
    if (thermalPdfCacheKey !== undefined && environment.MEDIA_BUCKET !== undefined) {
      const cachedPdf = await environment.MEDIA_BUCKET.get(thermalPdfCacheKey);
      if (cachedPdf !== null)
        return new Response(cachedPdf.body, {
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': `inline; filename="thermal-imaging-report-${document.id}.pdf"`,
            'cache-control': 'private, no-store',
            etag: cachedPdf.httpEtag,
            'x-content-type-options': 'nosniff',
            'x-ohmaudit-pdf-cache': 'hit',
          },
        });
    }
    const [brand, accreditation, assetPhoto] = await Promise.all([
      prisma.organisationBrandProfile.findUnique({ where: { organisationId } }),
      prisma.organisationAccreditation.findFirst({
        where: { organisationId },
        orderBy: { createdAt: 'asc' },
      }),
      inspection.asset === null
        ? Promise.resolve(null)
        : prisma.media.findFirst({
            where: {
              organisationId,
              entityType: 'Asset',
              entityId: inspection.asset.id,
              category: 'asset-image',
              mimeType: 'image/jpeg',
              status: 'AVAILABLE',
            },
            orderBy: { createdAt: 'asc' },
          }),
    ]);
    const [companyLogoImage, locationLogoImage, chargerPhotoJpegBase64] = await Promise.all([
      mediaImageForReport(environment, prisma, organisationId, brand?.logoMediaId),
      mediaImageForReport(environment, prisma, organisationId, inspection.customer.logoMediaId),
      jpegMediaForReport(environment, prisma, organisationId, assetPhoto?.id),
    ]);
    const printableValue = (value: unknown) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
        return `${value}`;
      return JSON.stringify(value) ?? '';
    };
    const summaryLines = Object.entries(revision.data as Record<string, unknown>)
      .slice(0, 25)
      .map(([key, value]) => `${key}: ${printableValue(value)}`);
    const renderPath = '/render/' + (document.templateKey ?? 'inspection-certificate');
    const renderInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: document.title,
        organisationName: brand?.tradingName ?? brand?.registeredName ?? 'Ohm Audit Organisation',
        customerName: inspection.customer.name,
        siteName: inspection.site.name,
        ...(inspection.asset === null ? {} : { assetName: inspection.asset.displayName }),
        inspectionType: inspection.inspectionType,
        effectiveDate: (inspection.effectiveDate ?? revision.createdAt).toISOString().slice(0, 10),
        revisionNumber: revision.revisionNumber,
        engineerName: revision.signatures[0]?.signerName ?? 'Engineer',
        outcome: printableValue(
          (revision.data as Record<string, unknown>)['outcome'] ?? 'Recorded',
        ),
        summaryLines,
        ...reportLogoFields(locationLogoImage),
        ...(inspection.moduleKey !== 'thermal-imaging'
          ? {}
          : {
              thermalCertificate: await thermalCertificateData({
                environment,
                prisma,
                organisationId,
                revisionData: revision.data,
                reportReference: document.id,
                organisationName:
                  brand?.tradingName ?? brand?.registeredName ?? 'Ohm Audit Organisation',
                customerName: inspection.customer.name,
                siteName: inspection.site.name,
                siteAddress: [
                  inspection.site.addressLine1 ?? '',
                  [inspection.site.addressLine2, inspection.site.city, inspection.site.postcode]
                    .filter(Boolean)
                    .join(', '),
                ].filter(Boolean),
                reportDate: inspection.effectiveDate ?? revision.createdAt,
                engineerName: revision.signatures[0]?.signerName ?? 'Engineer',
                ...(companyLogoImage === undefined ? {} : { logoImage: companyLogoImage }),
              }),
            }),
        ...(revision.evData === null || inspection.moduleKey !== 'ev-charging'
          ? {}
          : {
              evCertificate: evCertificateData({
                documentId: document.id,
                testingCompany: {
                  name: brand?.tradingName ?? brand?.registeredName ?? 'Ohm Audit Organisation',
                  addressLines: [
                    brand?.addressLine1 ?? '',
                    [brand?.addressLine2, brand?.city, brand?.postcode].filter(Boolean).join(', '),
                  ].filter(Boolean),
                  registrationNumber: accreditation?.registrationNumber ?? '',
                  ...reportLogoFields(companyLogoImage),
                },
                testingLocation: {
                  name: `${inspection.customer.name} — ${inspection.site.name}`,
                  addressLines: [
                    inspection.site.addressLine1 ?? '',
                    [inspection.site.addressLine2, inspection.site.city, inspection.site.postcode]
                      .filter(Boolean)
                      .join(', '),
                  ].filter(Boolean),
                  ...reportLogoFields(locationLogoImage),
                },
                charger: {
                  name: inspection.asset?.displayName ?? inspection.inspectionType,
                  location: inspection.asset?.evChargePoint?.locationNotes ?? inspection.site.name,
                  make: inspection.asset?.manufacturer ?? '',
                  model: inspection.asset?.model ?? '',
                  serialNumber: inspection.asset?.serialNumber ?? '',
                  ...(chargerPhotoJpegBase64 === undefined
                    ? {}
                    : { photoJpegBase64: chargerPhotoJpegBase64 }),
                },
                evData: revision.evData,
                revisionData: revision.data,
                testDate: inspection.effectiveDate ?? revision.createdAt,
                engineerName: revision.signatures[0]?.signerName ?? 'Engineer',
                defects: inspection.defects,
              }),
            }),
      }),
    };
    if (documentFormat === 'html' && inspection.moduleKey !== 'thermal-imaging')
      throw new DomainError(
        'DOCUMENT_HTML_UNAVAILABLE',
        'A print preview is currently available for thermal imaging reports.',
        409,
      );
    const rendered = await requestPdfRender(
      environment,
      documentFormat === 'html' ? '/render/thermal-report-html' : renderPath,
      renderInit,
    );
    if (
      thermalPdfCacheKey === undefined ||
      environment.MEDIA_BUCKET === undefined ||
      rendered.body === null
    )
      return rendered;

    const [responseBody, cacheBody] = rendered.body.tee();
    context.executionCtx.waitUntil(
      environment.MEDIA_BUCKET.put(thermalPdfCacheKey, cacheBody, {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { documentId: document.id, renderer: 'browser-v2' },
      }).catch((error: unknown) => {
        console.warn(
          JSON.stringify({
            event: 'pdf.cache_write_failed',
            documentId: document.id,
            errorType: error instanceof Error ? error.name : 'UnknownError',
          }),
        );
      }),
    );
    const responseHeaders = new Headers(rendered.headers);
    responseHeaders.set('x-ohmaudit-pdf-cache', 'miss');
    return new Response(responseBody, {
      status: rendered.status,
      statusText: rendered.statusText,
      headers: responseHeaders,
    });
  });
  app.get('/api/v1/modules/ev/assets/:assetId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'assets.read',
    );
    await new EntitlementService(prismaFor(environment)).requireModule(
      organisationId,
      'ev-charging',
    );
    return context.json({
      asset: await new EvService(prismaFor(environment)).detail(
        organisationId,
        context.req.param('assetId'),
      ),
    });
  });
  app.put('/api/v1/modules/ev/assets/:assetId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = evChargePointInput.parse(await context.req.json());
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      organisationId,
      ['assets.manage', 'ev.assets.manage'],
    );
    await new EntitlementService(prismaFor(environment)).require(
      organisationId,
      'ev.assets.manage',
    );
    return context.json({
      chargePoint: await new EvService(prismaFor(environment)).saveChargePoint(
        organisationId,
        context.req.param('assetId'),
        input,
      ),
    });
  });
  app.post('/api/v1/modules/ev/assets/:assetId/supplies', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = evSupplyInput.parse(await context.req.json());
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      organisationId,
      ['assets.manage', 'ev.assets.manage'],
    );
    await new EntitlementService(prismaFor(environment)).require(
      organisationId,
      'ev.assets.manage',
    );
    return context.json(
      {
        supply: await new EvService(prismaFor(environment)).addSupply(
          organisationId,
          context.req.param('assetId'),
          input,
        ),
      },
      201,
    );
  });
  app.put('/api/v1/modules/ev/assets/:assetId/supplies/:supplyId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = evSupplyInput.parse(await context.req.json());
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      organisationId,
      ['assets.manage', 'ev.assets.manage'],
    );
    await new EntitlementService(prismaFor(environment)).requireModule(
      organisationId,
      'ev-charging',
    );
    return context.json({
      supply: await new EvService(prismaFor(environment)).updateSupply(
        organisationId,
        context.req.param('assetId'),
        context.req.param('supplyId'),
        input,
      ),
    });
  });
  app.delete('/api/v1/modules/ev/assets/:assetId/supplies/:supplyId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      organisationId,
      ['assets.manage', 'ev.assets.manage'],
    );
    await new EntitlementService(prismaFor(environment)).requireModule(
      organisationId,
      'ev-charging',
    );
    await new EvService(prismaFor(environment)).deleteSupply(
      organisationId,
      context.req.param('assetId'),
      context.req.param('supplyId'),
    );
    return context.json({ deleted: true });
  });
  app.post('/api/v1/modules/ev/assets/:assetId/connectors', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = evConnectorInput.parse(await context.req.json());
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      organisationId,
      ['assets.manage', 'ev.assets.manage'],
    );
    await new EntitlementService(prismaFor(environment)).require(
      organisationId,
      'ev.assets.manage',
    );
    return context.json(
      {
        connector: await new EvService(prismaFor(environment)).addConnector(
          organisationId,
          context.req.param('assetId'),
          input,
        ),
      },
      201,
    );
  });
  app.put('/api/v1/modules/ev/assets/:assetId/connectors/:connectorId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const input = evConnectorInput.parse(await context.req.json());
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      organisationId,
      ['assets.manage', 'ev.assets.manage'],
    );
    await new EntitlementService(prismaFor(environment)).requireModule(
      organisationId,
      'ev-charging',
    );
    return context.json({
      connector: await new EvService(prismaFor(environment)).updateConnector(
        organisationId,
        context.req.param('assetId'),
        context.req.param('connectorId'),
        input,
      ),
    });
  });
  app.delete('/api/v1/modules/ev/assets/:assetId/connectors/:connectorId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      organisationId,
      ['assets.manage', 'ev.assets.manage'],
    );
    await new EntitlementService(prismaFor(environment)).requireModule(
      organisationId,
      'ev-charging',
    );
    await new EvService(prismaFor(environment)).deleteConnector(
      organisationId,
      context.req.param('assetId'),
      context.req.param('connectorId'),
    );
    return context.json({ deleted: true });
  });
  app.get('/api/v1/search', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    const query = z.string().trim().min(2).max(100).parse(context.req.query('q'));
    await identityService(environment, options).requireAllCapabilities(
      context.get('actor'),
      organisationId,
      ['customers.read', 'sites.read'],
    );
    return context.json(
      await new PortfolioService(prismaFor(environment)).search(organisationId, query),
    );
  });
  app.get('/api/v1/timeline/:entityType/:entityId', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
    );
    return context.json({
      events: await new PortfolioService(prismaFor(environment)).timeline(
        organisationId,
        context.req.param('entityType'),
        context.req.param('entityId'),
      ),
    });
  });
  app.get('/api/v1/platform/me', async (context) => {
    const user = await identityService(parseEnvironment(context.env), options).requirePlatformAdmin(
      context.get('actor'),
    );
    return context.json({ user });
  });
  app.post('/api/v1/platform/ai/dataplate/debug', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    if (environment.AI_WORKER === undefined)
      throw new DomainError(
        'AI_NOT_CONFIGURED',
        'Data plate analysis is not configured. Please contact support.',
        503,
      );
    const mimeType = context.req.header('content-type')?.split(';', 1)[0]?.toLowerCase() ?? '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType))
      throw new DomainError('IMAGE_TYPE_INVALID', 'Use a JPEG, PNG, or WebP image.', 415);
    const declaredSize = Number(context.req.header('content-length') ?? 0);
    if (declaredSize > 2_000_000)
      throw new DomainError('IMAGE_TOO_LARGE', 'The image must be 2 MB or smaller.', 413);
    if (context.req.raw.body === null)
      throw new DomainError('IMAGE_EMPTY', 'Select an image to analyse.', 422);
    const correlationId = context.get('correlationId');
    let response: Response;
    try {
      response = await environment.AI_WORKER.fetch(
        'https://ohmaudit-ai.internal/v1/debug/extract/charger-dataplate',
        {
          method: 'POST',
          headers: { 'content-type': mimeType, 'x-correlation-id': correlationId },
          body: context.req.raw.body,
        },
      );
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          event: 'api.ai_dataplate.debug_worker_unreachable',
          correlationId,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new DomainError(
        'AI_ANALYSIS_FAILED',
        'The AI service is temporarily unavailable. Please try the photo again.',
        502,
      );
    }
    if (!response.ok) {
      const error = z
        .object({ message: z.string().optional() })
        .catch({})
        .parse(await response.json().catch(() => ({})));
      const status = [415, 422, 502, 503].includes(response.status)
        ? (response.status as 413 | 415 | 422 | 502 | 503)
        : 502;
      throw new DomainError(
        'AI_ANALYSIS_FAILED',
        error.message ?? 'The image could not be analysed.',
        status,
      );
    }
    const result = dataPlateDebugSchema.safeParse(await response.json().catch(() => undefined));
    if (!result.success) {
      console.error(
        JSON.stringify({
          event: 'api.ai_dataplate.invalid_debug_response',
          correlationId,
          issueCount: result.error.issues.length,
        }),
      );
      throw new DomainError(
        'AI_ANALYSIS_FAILED',
        'The AI returned an invalid result. Please try the photo again.',
        502,
      );
    }
    return context.json(result.data);
  });
  app.get('/api/v1/platform/status', async (context) => {
    const environment = parseEnvironment(context.env);
    const current = await identityService(environment, options).currentUser(context.get('actor'));
    const status = await new PlatformService(prismaFor(environment)).status(current.user.id);
    return context.json({
      status: {
        ...status,
        ...(environment.APP_ENV === 'local'
          ? { bootstrapToken: 'local-superadmin-bootstrap-change-before-sharing-2026' }
          : {}),
      },
    });
  });
  app.post('/api/v1/platform/bootstrap', async (context) => {
    const environment = parseEnvironment(context.env);
    const input = superadminBootstrapInput.parse(await context.req.json());
    const current = await identityService(environment, options).currentUser(context.get('actor'));
    const user = await new PlatformService(prismaFor(environment)).bootstrap(
      current.user.id,
      input.token,
      environment.APP_ENV === 'local'
        ? 'local-superadmin-bootstrap-change-before-sharing-2026'
        : environment.SUPERADMIN_BOOTSTRAP_TOKEN,
      context.get('correlationId'),
    );
    return context.json({ user });
  });
  app.get('/api/v1/platform/users', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    const query = (context.req.query('q') ?? '').trim().slice(0, 100);
    return context.json({
      users: await new PlatformService(prismaFor(environment)).listUsers(query),
    });
  });
  app.patch('/api/v1/platform/users/:userId/role', async (context) => {
    const environment = parseEnvironment(context.env);
    const actor = await identityService(environment, options).requirePlatformAdmin(
      context.get('actor'),
    );
    const input = platformRoleInput.parse(await context.req.json());
    const user = await new PlatformService(prismaFor(environment)).setUserRole(
      actor.id,
      z.uuid().parse(context.req.param('userId')),
      input.platformRole,
      context.get('correlationId'),
    );
    return context.json({ user });
  });
  app.get('/api/v1/platform/organisations', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    const query = (context.req.query('q') ?? '').trim().slice(0, 100);
    return context.json({
      organisations: await new PlatformService(prismaFor(environment)).listOrganisations(query),
    });
  });
  app.get('/api/v1/platform/organisations/:organisationId', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    return context.json({
      organisation: await new PlatformService(prismaFor(environment)).organisation(
        z.uuid().parse(context.req.param('organisationId')),
      ),
    });
  });
  app.patch(
    '/api/v1/platform/organisations/:organisationId/modules/:moduleKey',
    async (context) => {
      const environment = parseEnvironment(context.env);
      const actor = await identityService(environment, options).requirePlatformAdmin(
        context.get('actor'),
      );
      const input = platformModuleInput.parse(await context.req.json());
      return context.json({
        entitlement: await new PlatformService(prismaFor(environment)).setOrganisationModule(
          actor.id,
          z.uuid().parse(context.req.param('organisationId')),
          context.req.param('moduleKey'),
          input,
          context.get('correlationId'),
        ),
      });
    },
  );
  app.patch(
    '/api/v1/platform/organisations/:organisationId/members/:membershipId',
    async (context) => {
      const environment = parseEnvironment(context.env);
      const actor = await identityService(environment, options).requirePlatformAdmin(
        context.get('actor'),
      );
      return context.json({
        membership: await new PlatformService(prismaFor(environment)).setOrganisationMember(
          actor.id,
          z.uuid().parse(context.req.param('organisationId')),
          z.uuid().parse(context.req.param('membershipId')),
          platformMemberInput.parse(await context.req.json()),
          context.get('correlationId'),
        ),
      });
    },
  );
  app.post(
    '/api/v1/platform/organisations/:organisationId/users/:userId/password-reset',
    async (context) => {
      const environment = parseEnvironment(context.env);
      const actor = await identityService(environment, options).requirePlatformAdmin(
        context.get('actor'),
      );
      if (
        environment.SUPABASE_PUBLISHABLE_KEY === undefined ||
        environment.WEB_APP_URL === undefined
      )
        throw new DomainError(
          'PASSWORD_RESET_UNAVAILABLE',
          'Password reset email delivery is not configured.',
          503,
        );
      return context.json({
        reset: await new PlatformService(prismaFor(environment)).requestPasswordReset(
          actor.id,
          z.uuid().parse(context.req.param('organisationId')),
          z.uuid().parse(context.req.param('userId')),
          context.get('correlationId'),
          {
            supabaseUrl: environment.SUPABASE_URL,
            publishableKey: environment.SUPABASE_PUBLISHABLE_KEY,
            redirectTo: `${environment.WEB_APP_URL}/auth/callback`,
          },
        ),
      });
    },
  );
  app.post('/api/v1/platform/organisations/:organisationId/support-sessions', async (context) => {
    const environment = parseEnvironment(context.env);
    const actor = await identityService(environment, options).requirePlatformAdmin(
      context.get('actor'),
    );
    const input = supportSessionInput.parse(await context.req.json());
    return context.json(
      {
        supportSession: await new PlatformService(prismaFor(environment)).createSupportSession(
          actor.id,
          z.uuid().parse(context.req.param('organisationId')),
          input.targetUserId,
          input.reason,
          context.get('correlationId'),
        ),
      },
      201,
    );
  });
  app.post('/api/v1/platform/support-sessions/:sessionId/revoke', async (context) => {
    const environment = parseEnvironment(context.env);
    const actor = await identityService(environment, options).requirePlatformAdmin(
      context.get('actor'),
    );
    return context.json({
      supportSession: await new PlatformService(prismaFor(environment)).revokeSupportSession(
        actor.id,
        z.uuid().parse(context.req.param('sessionId')),
        context.get('correlationId'),
      ),
    });
  });
  app.get('/api/v1/platform/ev-stock-images', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .parse(context.req.query('limit'));
    const query = (context.req.query('q') ?? '').trim().slice(0, 100);
    return context.json(
      await new PlatformService(prismaFor(environment)).stockCatalogue(limit, query),
    );
  });
  app.post('/api/v1/platform/ev-stock-images', async (context) => {
    const environment = parseEnvironment(context.env);
    const actor = await identityService(environment, options).requirePlatformAdmin(
      context.get('actor'),
    );
    const input = stockImageInput.parse(await context.req.json());
    const result = await new PlatformService(prismaFor(environment)).registerStockImage(
      actor.id,
      input,
    );
    return context.json(result, 201);
  });
  app.put('/api/v1/platform/ev-stock-images/:mediaId/content', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    if (environment.MEDIA_BUCKET === undefined)
      throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);
    const platform = new PlatformService(prismaFor(environment));
    const media = await platform.stockMedia(z.uuid().parse(context.req.param('mediaId')), false);
    const mimeType = stockImageContentType.parse(context.req.header('content-type'));
    const size = stockImageContentSize.parse(
      context.req.header('x-file-size') ?? context.req.header('content-length'),
    );
    if (context.req.raw.body === null)
      throw new DomainError('MEDIA_CONTENT_REQUIRED', 'Choose an image to upload.', 422);
    await environment.MEDIA_BUCKET.put(media.storageKey, context.req.raw.body, {
      httpMetadata: { contentType: mimeType },
    });
    return context.json({
      media: await prismaFor(environment).media.update({
        where: { id: media.id },
        data: { status: 'AVAILABLE', mimeType, size, createdAt: new Date() },
      }),
    });
  });
  app.post('/api/v1/platform/ev-stock-images/:mediaId/models', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    const input = stockImageModelsInput.parse(await context.req.json());
    return context.json({
      models: await new PlatformService(prismaFor(environment)).addModelsToImage(
        z.uuid().parse(context.req.param('mediaId')),
        input.manufacturer,
        input.models,
      ),
    });
  });
  app.delete('/api/v1/platform/ev-stock-images/models/:assetModelId', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    await new PlatformService(prismaFor(environment)).unlinkModel(
      z.uuid().parse(context.req.param('assetModelId')),
    );
    return context.json({ deleted: true });
  });
  app.delete('/api/v1/platform/ev-stock-images/:mediaId', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    const platform = new PlatformService(prismaFor(environment));
    const media = await platform.deleteStockImage(z.uuid().parse(context.req.param('mediaId')));
    if (environment.MEDIA_BUCKET !== undefined)
      await environment.MEDIA_BUCKET.delete(media.storageKey);
    return context.json({ deleted: true });
  });
  app.get('/api/v1/platform/ev-test-instructions', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    const step = (context.req.query('step') ?? '').trim();
    return context.json({
      sets: await new InstructionService(prismaFor(environment)).platformList(
        step === '' ? undefined : evTestStepSchema.parse(step),
      ),
    });
  });
  app.get('/api/v1/platform/ev-test-instructions/coverage', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(40)
      .parse(context.req.query('limit'));
    const query = (context.req.query('q') ?? '').trim().slice(0, 100);
    return context.json(
      await new InstructionService(prismaFor(environment)).coverage(limit, query),
    );
  });
  app.post('/api/v1/platform/ev-test-instructions', async (context) => {
    const environment = parseEnvironment(context.env);
    const actor = await identityService(environment, options).requirePlatformAdmin(
      context.get('actor'),
    );
    const input = evTestInstructionInput.parse(await context.req.json());
    return context.json(
      await new InstructionService(prismaFor(environment)).create(
        actor.id,
        input,
        context.get('correlationId'),
      ),
      201,
    );
  });
  app.patch('/api/v1/platform/ev-test-instructions/:instructionId', async (context) => {
    const environment = parseEnvironment(context.env);
    const actor = await identityService(environment, options).requirePlatformAdmin(
      context.get('actor'),
    );
    const input = evTestInstructionInput.parse(await context.req.json());
    return context.json(
      await new InstructionService(prismaFor(environment)).update(
        actor.id,
        z.uuid().parse(context.req.param('instructionId')),
        input,
        context.get('correlationId'),
      ),
    );
  });
  app.post('/api/v1/platform/ev-test-instructions/:instructionId/video', async (context) => {
    const environment = parseEnvironment(context.env);
    const actor = await identityService(environment, options).requirePlatformAdmin(
      context.get('actor'),
    );
    const input = z
      .object({
        organisationId: z.uuid(),
        mimeType: evInstructionVideoContentType,
        size: evInstructionVideoContentSize,
      })
      .parse(await context.req.json());
    const instructionId = z.uuid().parse(context.req.param('instructionId'));
    const result = await new InstructionService(prismaFor(environment)).registerVideo(
      actor.id,
      input.organisationId,
      instructionId,
      input.mimeType,
      input.size,
    );
    if (result.previous !== null && environment.MEDIA_BUCKET !== undefined)
      await environment.MEDIA_BUCKET.delete(result.previous.storageKey);
    return context.json({ media: result.media }, 201);
  });
  app.put('/api/v1/platform/ev-test-instructions/:instructionId/video/content', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    if (environment.MEDIA_BUCKET === undefined)
      throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);
    if (context.req.raw.body === null)
      throw new DomainError('MEDIA_CONTENT_REQUIRED', 'Choose a video or GIF to upload.', 422);
    const instructionId = z.uuid().parse(context.req.param('instructionId'));
    const service = new InstructionService(prismaFor(environment));
    const media = await service.videoForUpload(instructionId);
    const mimeType = evInstructionVideoContentType.parse(context.req.header('content-type'));
    await environment.MEDIA_BUCKET.put(media.storageKey, context.req.raw.body, {
      httpMetadata: { contentType: mimeType },
    });
    return context.json({ media: await service.confirmVideo(instructionId) });
  });
  app.delete('/api/v1/platform/ev-test-instructions/:instructionId/video', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    const service = new InstructionService(prismaFor(environment));
    const result = await service.deleteVideo(z.uuid().parse(context.req.param('instructionId')));
    if (result.media !== null && environment.MEDIA_BUCKET !== undefined)
      await environment.MEDIA_BUCKET.delete(result.media.storageKey);
    return context.json({ deleted: true });
  });
  app.delete('/api/v1/platform/ev-test-instructions/:instructionId', async (context) => {
    const environment = parseEnvironment(context.env);
    await identityService(environment, options).requirePlatformAdmin(context.get('actor'));
    const service = new InstructionService(prismaFor(environment));
    const result = await service.deleteInstruction(
      z.uuid().parse(context.req.param('instructionId')),
    );
    if (result.media !== null && environment.MEDIA_BUCKET !== undefined)
      await environment.MEDIA_BUCKET.delete(result.media.storageKey);
    return context.json({ deleted: true });
  });
  app.get('/api/v1/assets/:assetId/display-image', async (context) => {
    const environment = parseEnvironment(context.env);
    const organisationId = context.req.query('organisationId') ?? '';
    await identityService(environment, options).requireMembership(
      context.get('actor'),
      organisationId,
      'assets.read',
    );
    if (environment.MEDIA_BUCKET === undefined)
      throw new DomainError('MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured.', 503);
    const prisma = prismaFor(environment);
    const assetId = z.uuid().parse(context.req.param('assetId'));
    const custom = await prisma.media.findFirst({
      where: { organisationId, entityType: 'Asset', entityId: assetId, status: 'AVAILABLE' },
      orderBy: { createdAt: 'desc' },
    });
    const media =
      custom ?? (await new PlatformService(prisma).stockImageForAsset(assetId, organisationId));
    if (media === null)
      throw new DomainError('DISPLAY_IMAGE_NOT_FOUND', 'No charger image is available.', 404);
    const object = await environment.MEDIA_BUCKET.get(media.storageKey);
    if (object === null)
      throw new DomainError('MEDIA_CONTENT_NOT_FOUND', 'The image content was not found.', 404);
    return new Response(object.body, {
      headers: { 'content-type': media.mimeType, 'cache-control': 'private, max-age=3600' },
    });
  });
  app.doc('/api/v1/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Ohm Audit API', version: '0.2.0' },
  });
  app.onError((error, context) => {
    if (error instanceof DomainError) {
      console.warn(
        JSON.stringify({
          event: 'api.domain_error',
          correlationId: context.get('correlationId'),
          method: context.req.method,
          path: context.req.path,
          code: error.code,
          status: error.status,
        }),
      );
      return context.json(
        { code: error.code, message: error.message, correlationId: context.get('correlationId') },
        error.status,
      );
    }
    if (error instanceof z.ZodError) {
      console.warn(
        JSON.stringify({
          event: 'api.validation_failed',
          correlationId: context.get('correlationId'),
          method: context.req.method,
          path: context.req.path,
          issueCount: error.issues.length,
          issuePaths: error.issues.map((issue) => issue.path.join('.')),
        }),
      );
      return context.json(
        {
          code: 'VALIDATION_FAILED',
          message: 'The request contains invalid data.',
          correlationId: context.get('correlationId'),
        },
        422,
      );
    }
    console.error(
      JSON.stringify({
        event: 'api.unhandled_error',
        correlationId: context.get('correlationId'),
        errorType: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
    return context.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
        correlationId: context.get('correlationId'),
      },
      500,
    );
  });
  app.notFound((context) =>
    context.json(
      {
        code: 'ROUTE_NOT_FOUND',
        message: 'The requested API route does not exist.',
        correlationId: context.get('correlationId'),
      },
      404,
    ),
  );
  return app;
}
