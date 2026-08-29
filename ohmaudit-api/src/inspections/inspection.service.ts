import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { ScheduleService } from '../scheduling/schedule.service';
import { DomainError } from '../shared/domain-error';

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonBlankString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function evRcdFailureReasons(evData: {
  stableDetails: Record<string, unknown>;
  connectorTests: unknown[];
}): string[] {
  const chargePoint = objectValue(evData.stableDetails['chargePoint']);
  const dcRcdType = chargePoint['dcRcdType'];
  const failures: string[] = [];
  for (const [index, value] of evData.connectorTests.entries()) {
    const connector = objectValue(value);
    const name = `Connector ${index + 1}`;
    const readings: Array<[string, string, number]> = [
      ['rcd1x0Ms', '1× at 0°', 300],
      ['rcd1x180Ms', '1× at 180°', 300],
      ['rcd5x0Ms', '5× at 0°', 40],
      ['rcd5x180Ms', '5× at 180°', 40],
    ];
    for (const [key, label, maximum] of readings) {
      const reading = numericValue(connector[key]);
      if (reading !== undefined && reading > maximum)
        failures.push(`${name}: ${label} is ${reading} ms (maximum ${maximum} ms)`);
    }
    if (dcRcdType === 'RDC_DD') {
      for (const [key, label] of [
        ['dcRamp0Ma', 'RDC-DD ramp at 0°'],
        ['dcRamp180Ma', 'RDC-DD ramp at 180°'],
      ] as const) {
        const reading = numericValue(connector[key]);
        if (reading !== undefined && reading > 6)
          failures.push(`${name}: ${label} is ${reading} mA (maximum 6 mA)`);
      }
    }
  }
  return failures;
}

export class InspectionService {
  constructor(private readonly prisma: PrismaClient) {}

  list(organisationId: string, status?: string) {
    return this.prisma.inspection.findMany({
      where: {
        organisationId,
        ...(status === undefined
          ? {}
          : {
              status: status as
                | 'DRAFT'
                | 'IN_PROGRESS'
                | 'SUBMITTED'
                | 'UNDER_REVIEW'
                | 'APPROVED'
                | 'REJECTED'
                | 'SUPERSEDED',
            }),
      },
      include: {
        customer: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
        asset: { select: { id: true, displayName: true, assetReference: true } },
        visit: { select: { id: true, title: true, scheduledStart: true } },
        revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
        defects: true,
        proposedAssetChanges: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async start(organisationId: string, visitTaskId: string) {
    const existing = await this.prisma.inspection.findFirst({
      where: { visitTaskId, organisationId },
    });
    if (existing !== null) return existing;
    const task = await this.prisma.visitTask.findFirst({
      where: { id: visitTaskId, organisationId },
      include: { visit: true },
    });
    if (task === null)
      throw new DomainError('VISIT_TASK_NOT_FOUND', 'The inspection task was not found.', 404);
    return this.prisma.$transaction(async (transaction) => {
      const inspection = await transaction.inspection.create({
        data: {
          organisationId,
          visitId: task.visitId,
          visitTaskId: task.id,
          customerId: task.visit.customerId,
          siteId: task.visit.siteId,
          ...(task.assetId === null ? {} : { assetId: task.assetId }),
          moduleKey: task.moduleKey,
          inspectionType: task.title,
          status: 'IN_PROGRESS',
        },
      });
      await transaction.visitTask.update({
        where: { id: task.id },
        data: { status: 'IN_PROGRESS' },
      });
      await transaction.visit.update({
        where: { id: task.visitId },
        data: { status: 'IN_PROGRESS' },
      });
      return inspection;
    });
  }

  async detail(organisationId: string, inspectionId: string) {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id: inspectionId, organisationId },
      include: {
        customer: true,
        site: true,
        asset: {
          include: {
            evChargePoint: {
              include: { supplies: true, connectors: { include: { supplyMappings: true } } },
            },
          },
        },
        visit: true,
        visitTask: true,
        revisions: {
          include: { signatures: true, documents: true, evData: true },
          orderBy: { revisionNumber: 'desc' },
        },
        defects: true,
        proposedAssetChanges: true,
      },
    });
    if (inspection === null)
      throw new DomainError('INSPECTION_NOT_FOUND', 'The inspection was not found.', 404);
    const evidenceMedia =
      typeof this.prisma.media?.findMany !== 'function'
        ? []
        : await this.prisma.media.findMany({
            where: {
              organisationId,
              status: 'AVAILABLE',
              OR: [
                {
                  entityType: 'Inspection',
                  entityId: inspection.id,
                  category: {
                    in: ['unclassified-image', 'thermal-image', 'standard-image'],
                  },
                },
                ...(inspection.assetId === null
                  ? []
                  : [
                      {
                        entityType: 'Asset',
                        entityId: inspection.assetId,
                        category: 'inspection-fault',
                      },
                    ]),
              ],
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            take: 100,
          });
    const seenDefects = new Set<string>();
    const defects = inspection.defects.filter((defect) => {
      const fingerprint = JSON.stringify([
        defect.assetId,
        defect.title.trim(),
        defect.description?.trim() ?? '',
        defect.severity,
        defect.status,
        defect.photoMediaIds,
      ]);
      if (seenDefects.has(fingerprint)) return false;
      seenDefects.add(fingerprint);
      return true;
    });
    return { ...inspection, defects, evidenceMedia };
  }

  async overrideSubmission(
    organisationId: string,
    inspectionId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      reason: string;
      data: Record<string, unknown>;
      evData?:
        | {
            stableDetails: Record<string, unknown>;
            supplyTests: unknown[];
            connectorTests: unknown[];
            functionalChecks: Record<string, unknown>;
            engineerObservations?: string | undefined;
          }
        | undefined;
      defects?:
        | Array<{
            id: string;
            title: string;
            description?: string | undefined;
            severity: 'ADVISORY' | 'MINOR' | 'MAJOR' | 'DANGEROUS';
            status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
          }>
        | undefined;
    },
  ) {
    const inspection = await this.detail(organisationId, inspectionId);
    if (inspection.status !== 'SUBMITTED' && inspection.status !== 'UNDER_REVIEW')
      throw new DomainError(
        'INSPECTION_NOT_OVERRIDABLE',
        'Only inspections awaiting review can be corrected.',
        409,
      );
    const source = inspection.revisions[0];
    if (source === undefined)
      throw new DomainError(
        'INSPECTION_REVISION_MISSING',
        'The submitted inspection revision was not found.',
        409,
      );
    const revisionNumber = inspection.currentRevisionNumber + 1;
    const rcdFailures = input.evData === undefined ? [] : evRcdFailureReasons(input.evData);
    const effectiveData =
      rcdFailures.length === 0
        ? input.data
        : { ...input.data, outcome: 'FAIL', automaticFailureReason: 'Faulty RCD reading' };
    const sourceValidation = objectValue(source.validation);
    const effectiveValidation = {
      ...sourceValidation,
      ...(rcdFailures.length === 0
        ? { rcdResult: 'PASS', rcdFailureReasons: [] }
        : { rcdResult: 'FAIL', rcdFailureReasons: rcdFailures }),
      administratorOverride: {
        reason: input.reason,
        actorUserId,
        previousRevisionNumber: source.revisionNumber,
        reviewedAt: new Date().toISOString(),
      },
    };
    const effectiveEvData =
      input.evData === undefined
        ? undefined
        : {
            ...input.evData,
            functionalChecks: {
              ...input.evData.functionalChecks,
              ...(rcdFailures.length === 0 ? {} : { outcome: 'FAIL' }),
            },
          };

    return this.prisma.$transaction(async (transaction) => {
      const revision = await transaction.inspectionRevision.create({
        data: {
          organisationId,
          inspectionId,
          revisionNumber,
          data: effectiveData as Prisma.InputJsonValue,
          validation: effectiveValidation,
          snapshots: source.snapshots as Prisma.InputJsonValue,
          createdByUserId: actorUserId,
          signatures: {
            create: source.signatures.map((signature) => ({
              signerName: signature.signerName,
              signerRole: signature.signerRole,
              signatureData: signature.signatureData,
              signedAt: signature.signedAt,
            })),
          },
          ...(effectiveEvData === undefined
            ? {}
            : {
                evData: {
                  create: {
                    stableDetails: effectiveEvData.stableDetails as Prisma.InputJsonValue,
                    supplyTests: effectiveEvData.supplyTests as Prisma.InputJsonValue,
                    connectorTests: effectiveEvData.connectorTests as Prisma.InputJsonValue,
                    functionalChecks: effectiveEvData.functionalChecks,
                    ...(effectiveEvData.engineerObservations === undefined
                      ? {}
                      : { engineerObservations: effectiveEvData.engineerObservations }),
                  },
                },
              }),
        },
      });
      for (const defect of input.defects ?? []) {
        const existing = inspection.defects.find(({ id }) => id === defect.id);
        if (existing === undefined)
          throw new DomainError(
            'INSPECTION_DEFECT_NOT_FOUND',
            'A defect selected for correction was not found.',
            404,
          );
        await transaction.defect.update({
          where: { id: defect.id },
          data: {
            title: defect.title,
            description: defect.description?.trim() || null,
            severity: defect.severity,
            status: defect.status,
            ...(defect.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
          },
        });
      }
      await transaction.inspection.update({
        where: { id: inspectionId },
        data: { status: 'UNDER_REVIEW', currentRevisionNumber: revisionNumber },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'InspectionSubmissionOverridden',
          entityType: 'Inspection',
          entityId: inspectionId,
          data: {
            reason: input.reason,
            previousRevisionNumber: source.revisionNumber,
            revisionNumber,
            defectCount: input.defects?.length ?? 0,
          },
        },
      });
      return revision;
    });
  }

  async submit(
    organisationId: string,
    inspectionId: string,
    actorUserId: string | undefined,
    correlationId: string,
    input: {
      data: Record<string, unknown>;
      validation: Record<string, unknown>;
      signature: { signerName: string; signerRole: string; signatureData: string };
      defects: Array<{
        assetId?: string | undefined;
        title: string;
        description?: string | undefined;
        severity: 'ADVISORY' | 'MINOR' | 'MAJOR' | 'DANGEROUS';
        photoMediaIds?: string[] | undefined;
      }>;
      evData?:
        | {
            stableDetails: Record<string, unknown>;
            supplyTests: unknown[];
            connectorTests: unknown[];
            functionalChecks: Record<string, unknown>;
            engineerObservations?: string | undefined;
          }
        | undefined;
      proposedAssetChanges?: Record<string, unknown> | undefined;
    },
    clientMutationId?: string,
  ) {
    if (clientMutationId !== undefined) {
      const existing = await this.prisma.inspectionRevision.findUnique({
        where: { clientMutationId },
      });
      if (existing !== null) return existing;
    }
    const inspection = await this.detail(organisationId, inspectionId);
    if (inspection.status === 'APPROVED')
      throw new DomainError(
        'INSPECTION_ALREADY_APPROVED',
        'Create a revision before changing an approved inspection.',
        409,
      );
    const revisionNumber = inspection.currentRevisionNumber + 1;
    const rcdFailures = input.evData === undefined ? [] : evRcdFailureReasons(input.evData);
    const effectiveData =
      rcdFailures.length === 0
        ? input.data
        : { ...input.data, outcome: 'FAIL', automaticFailureReason: 'Faulty RCD reading' };
    const effectiveValidation =
      rcdFailures.length === 0
        ? input.validation
        : { ...input.validation, rcdResult: 'FAIL', rcdFailureReasons: rcdFailures };
    const effectiveEvData =
      input.evData === undefined
        ? undefined
        : {
            ...input.evData,
            functionalChecks:
              rcdFailures.length === 0
                ? input.evData.functionalChecks
                : { ...input.evData.functionalChecks, outcome: 'FAIL' },
          };
    const hasAutomaticRcdDefect = input.defects.some(
      ({ title }) => title.trim().toLowerCase() === 'faulty rcd reading',
    );
    const effectiveDefects =
      rcdFailures.length === 0 || hasAutomaticRcdDefect
        ? input.defects
        : [
            ...input.defects,
            {
              ...(inspection.assetId === null ? {} : { assetId: inspection.assetId }),
              title: 'Faulty RCD reading',
              description: rcdFailures.join('; '),
              severity: 'MAJOR' as const,
            },
          ];
    const brand = await this.prisma.organisationBrandProfile.findUnique({
      where: { organisationId },
    });
    return this.prisma.$transaction(async (transaction) => {
      const revision = await transaction.inspectionRevision.create({
        data: {
          organisationId,
          inspectionId,
          revisionNumber,
          ...(clientMutationId === undefined ? {} : { clientMutationId }),
          data: effectiveData as Prisma.InputJsonValue,
          validation: effectiveValidation as Prisma.InputJsonValue,
          snapshots: {
            organisation: brand,
            customer: inspection.customer,
            site: inspection.site,
            asset: inspection.asset,
          },
          ...(actorUserId === undefined ? {} : { createdByUserId: actorUserId }),
          signatures: {
            create: {
              signerName: input.signature.signerName,
              signerRole: input.signature.signerRole,
              signatureData: input.signature.signatureData,
            },
          },
          ...(effectiveEvData === undefined
            ? {}
            : {
                evData: {
                  create: {
                    stableDetails: effectiveEvData.stableDetails as Prisma.InputJsonValue,
                    supplyTests: effectiveEvData.supplyTests as Prisma.InputJsonValue,
                    connectorTests: effectiveEvData.connectorTests as Prisma.InputJsonValue,
                    functionalChecks: effectiveEvData.functionalChecks as Prisma.InputJsonValue,
                    ...(effectiveEvData.engineerObservations === undefined
                      ? {}
                      : { engineerObservations: effectiveEvData.engineerObservations }),
                  },
                },
              }),
        },
      });
      await transaction.defect.deleteMany({ where: { organisationId, inspectionId } });
      if (effectiveDefects.length > 0)
        await transaction.defect.createMany({
          data: effectiveDefects.map((defect) => ({
            organisationId,
            inspectionId,
            ...(defect.assetId === undefined ? {} : { assetId: defect.assetId }),
            title: defect.title,
            ...(defect.description === undefined ? {} : { description: defect.description }),
            severity: defect.severity,
            photoMediaIds: defect.photoMediaIds ?? [],
          })),
        });
      const isNewAsset = inspection.asset?.status === 'PROPOSED';
      const proposedAssetChanges =
        input.proposedAssetChanges ?? (isNewAsset ? input.evData?.stableDetails : undefined);
      if (
        inspection.assetId !== null &&
        proposedAssetChanges !== undefined &&
        Object.keys(proposedAssetChanges).length > 0
      ) {
        const proposed = objectValue(proposedAssetChanges);
        const asset = objectValue(proposed['asset']);
        await transaction.proposedAssetChange.create({
          data: {
            organisationId,
            assetId: inspection.assetId,
            inspectionId,
            proposedData: {
              ...proposed,
              ...(isNewAsset ? { _operation: 'CREATE' } : {}),
              asset: {
                ...asset,
                ...(isNewAsset
                  ? {
                      assetReference: inspection.asset?.assetReference,
                      displayName: inspection.asset?.displayName,
                    }
                  : {}),
              },
            },
          },
        });
      }
      await transaction.inspection.update({
        where: { id: inspectionId },
        data: {
          status: 'SUBMITTED',
          currentRevisionNumber: revisionNumber,
          submittedAt: new Date(),
          effectiveDate: new Date(),
        },
      });
      if (inspection.visitTaskId !== null)
        await transaction.visitTask.update({
          where: { id: inspection.visitTaskId },
          data: { status: 'SUBMITTED' },
        });
      if (inspection.visitId !== null) {
        const outstandingTasks = await transaction.visitTask.count({
          where: {
            visitId: inspection.visitId,
            status: { notIn: ['SUBMITTED', 'COMPLETED', 'CANCELLED'] },
          },
        });
        if (outstandingTasks === 0)
          await transaction.visit.update({
            where: { id: inspection.visitId },
            data: { status: 'SUBMITTED', submittedAt: new Date() },
          });
      }
      await transaction.auditEvent.create({
        data: {
          organisationId,
          ...(actorUserId === undefined ? {} : { actorUserId }),
          correlationId,
          eventType: 'InspectionSubmitted',
          entityType: 'Inspection',
          entityId: inspectionId,
          data: { revisionNumber, defectCount: input.defects.length },
        },
      });
      return revision;
    });
  }

  async review(
    organisationId: string,
    inspectionId: string,
    actorUserId: string,
    correlationId: string,
    approved: boolean,
  ) {
    const inspection = await this.detail(organisationId, inspectionId);
    if (inspection.status !== 'SUBMITTED' && inspection.status !== 'UNDER_REVIEW')
      throw new DomainError(
        'INSPECTION_NOT_REVIEWABLE',
        'Only submitted inspections can be reviewed.',
        409,
      );
    return this.prisma.$transaction(async (transaction) => {
      const reviewedAt = new Date();
      const updated = await transaction.inspection.update({
        where: { id: inspectionId },
        data: {
          status: approved ? 'APPROVED' : 'REJECTED',
          reviewedAt,
          reviewedByUserId: actorUserId,
          ...(approved ? { approvedAt: reviewedAt } : {}),
        },
      });
      if (inspection.visitTaskId !== null)
        await transaction.visitTask.update({
          where: { id: inspection.visitTaskId },
          data: { status: approved ? 'COMPLETED' : 'IN_PROGRESS' },
        });
      if (approved && inspection.visitId !== null) {
        const outstandingTasks = await transaction.visitTask.count({
          where: {
            visitId: inspection.visitId,
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
        });
        if (outstandingTasks === 0)
          await transaction.visit.update({
            where: { id: inspection.visitId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
      }
      const rebasedScheduleCount = approved
        ? await new ScheduleService(this.prisma).completeAndRebaseForInspection(
            transaction,
            inspection,
            reviewedAt,
          )
        : 0;
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: approved ? 'InspectionApproved' : 'InspectionRejected',
          entityType: 'Inspection',
          entityId: inspectionId,
          data: { revisionNumber: inspection.currentRevisionNumber, rebasedScheduleCount },
        },
      });
      return updated;
    });
  }

  async reviewProposedAssetChange(
    organisationId: string,
    changeId: string,
    actorUserId: string,
    correlationId: string,
    approved: boolean,
    resolvedData?: Record<string, unknown>,
  ) {
    const change = await this.prisma.proposedAssetChange.findFirst({
      where: { id: changeId, organisationId },
      include: {
        asset: {
          include: { evChargePoint: { include: { supplies: true, connectors: true } } },
        },
      },
    });
    if (change === null)
      throw new DomainError('PROPOSED_CHANGE_NOT_FOUND', 'The proposed change was not found.', 404);
    if (change.status !== 'PENDING')
      throw new DomainError(
        'PROPOSED_CHANGE_REVIEWED',
        'This change has already been reviewed.',
        409,
      );
    const proposed = objectValue(change.proposedData);
    const effectiveProposed = resolvedData ?? proposed;
    const isNewAsset = proposed['_operation'] === 'CREATE';
    return this.prisma.$transaction(async (transaction) => {
      if (approved) {
        const assetInput = objectValue(effectiveProposed['asset']);
        const assetData = Object.fromEntries(
          ['assetReference', 'displayName', 'manufacturer', 'model', 'serialNumber'].flatMap(
            (key) => {
              const value = nonBlankString(assetInput[key]);
              return value === undefined ? [] : [[key, value]];
            },
          ),
        );
        if (Object.keys(assetData).length > 0 || isNewAsset)
          await transaction.asset.update({
            where: { id: change.assetId },
            data: { ...assetData, ...(isNewAsset ? { status: 'ACTIVE' } : {}) },
          });

        const chargePointInput = objectValue(effectiveProposed['chargePoint']);
        const dcRcdType = nonBlankString(chargePointInput['dcRcdType']);
        const chargePointData = {
          ...(typeof chargePointInput['maximumPowerKw'] === 'number'
            ? { maximumPowerKw: chargePointInput['maximumPowerKw'] }
            : {}),
          ...(dcRcdType === undefined ? {} : { dcRcdType }),
        };
        const chargePoint = await transaction.evChargePoint.upsert({
          where: { assetId: change.assetId },
          create: { organisationId, assetId: change.assetId, ...chargePointData },
          update: chargePointData,
        });
        const knownSupplies = change.asset.evChargePoint?.supplies ?? [];
        const knownConnectors = change.asset.evChargePoint?.connectors ?? [];
        const knownSupplyIds = new Set(knownSupplies.map(({ id }) => id));
        const knownConnectorIds = new Set(knownConnectors.map(({ id }) => id));
        const matchedSupplyIds = new Set<string>();
        const matchedConnectorIds = new Set<string>();
        const supplyIds = new Map<string, string>();
        for (const [index, rawSupply] of arrayValue(effectiveProposed['supplies']).entries()) {
          const supply = objectValue(rawSupply);
          const sourceId = typeof supply['id'] === 'string' ? supply['id'] : crypto.randomUUID();
          const label = nonBlankString(supply['label']);
          const protectiveDeviceType = nonBlankString(supply['protectiveDeviceType']);
          const earthingArrangement = nonBlankString(supply['earthingArrangement']);
          const updateData = {
            ...(label === undefined ? {} : { label }),
            ...(typeof supply['phaseCount'] === 'number'
              ? { phaseCount: supply['phaseCount'] }
              : {}),
            ...(protectiveDeviceType === undefined ? {} : { protectiveDeviceType }),
            ...(typeof supply['protectiveDeviceRating'] === 'number'
              ? { protectiveDeviceRating: supply['protectiveDeviceRating'] }
              : {}),
            ...(earthingArrangement === undefined ? {} : { earthingArrangement }),
          };
          const matchedSupply = knownSupplyIds.has(sourceId)
            ? knownSupplies.find(({ id }) => id === sourceId)
            : (knownSupplies.find(
                (candidate) =>
                  !matchedSupplyIds.has(candidate.id) &&
                  label !== undefined &&
                  candidate.label.trim().toLocaleLowerCase('en-GB') ===
                    label.toLocaleLowerCase('en-GB'),
              ) ??
              knownSupplies.find(
                (candidate, candidateIndex) =>
                  candidateIndex === index && !matchedSupplyIds.has(candidate.id),
              ));
          const saved = matchedSupply
            ? await transaction.evSupply.update({
                where: { id: matchedSupply.id },
                data: updateData,
              })
            : await transaction.evSupply.create({
                data: {
                  organisationId,
                  chargePointId: chargePoint.id,
                  label: label ?? 'Supply',
                  phaseCount: typeof supply['phaseCount'] === 'number' ? supply['phaseCount'] : 1,
                  ...(protectiveDeviceType === undefined ? {} : { protectiveDeviceType }),
                  ...(typeof supply['protectiveDeviceRating'] === 'number'
                    ? { protectiveDeviceRating: supply['protectiveDeviceRating'] }
                    : {}),
                  ...(earthingArrangement === undefined ? {} : { earthingArrangement }),
                },
              });
          if (matchedSupply) matchedSupplyIds.add(matchedSupply.id);
          supplyIds.set(sourceId, saved.id);
        }
        for (const [index, rawConnector] of arrayValue(effectiveProposed['connectors']).entries()) {
          const connector = objectValue(rawConnector);
          const sourceId =
            typeof connector['id'] === 'string' ? connector['id'] : crypto.randomUUID();
          const label = nonBlankString(connector['label']);
          const connectorType = nonBlankString(connector['connectorType']);
          const updateData = {
            ...(label === undefined ? {} : { label }),
            ...(connectorType === undefined ? {} : { connectorType }),
          };
          const mappedSupplies = arrayValue(connector['supplyIds'])
            .filter((value): value is string => typeof value === 'string')
            .map((id) => supplyIds.get(id) ?? (knownSupplyIds.has(id) ? id : undefined))
            .filter((id): id is string => id !== undefined)
            .slice(0, 1);
          const matchedConnector = knownConnectorIds.has(sourceId)
            ? knownConnectors.find(({ id }) => id === sourceId)
            : (knownConnectors.find(
                (candidate) =>
                  !matchedConnectorIds.has(candidate.id) &&
                  label !== undefined &&
                  candidate.label.trim().toLocaleLowerCase('en-GB') ===
                    label.toLocaleLowerCase('en-GB'),
              ) ??
              knownConnectors.find(
                (candidate, candidateIndex) =>
                  candidateIndex === index && !matchedConnectorIds.has(candidate.id),
              ));
          const existing = matchedConnector
            ? await transaction.evConnector.findFirst({
                where: { id: matchedConnector.id, chargePointId: chargePoint.id, organisationId },
              })
            : null;
          if (existing === null)
            await transaction.evConnector.create({
              data: {
                organisationId,
                chargePointId: chargePoint.id,
                label: label ?? 'Connector',
                connectorType: connectorType ?? 'Type 2',
                supplyMappings: {
                  create: mappedSupplies.map((supplyId) => ({ supplyId })),
                },
              },
            });
          else {
            matchedConnectorIds.add(existing.id);
            await transaction.evConnector.update({
              where: { id: existing.id },
              data: {
                ...updateData,
                ...(mappedSupplies.length === 0
                  ? {}
                  : {
                      supplyMappings: {
                        deleteMany: {},
                        create: mappedSupplies.map((supplyId) => ({ supplyId })),
                      },
                    }),
              },
            });
          }
        }
      } else if (isNewAsset) {
        await transaction.asset.update({
          where: { id: change.assetId },
          data: {
            status: 'REMOVED',
            assetReference: `${change.asset.assetReference.slice(0, 78)}-REJECTED-${change.id.slice(0, 8)}`,
          },
        });
      }
      const status = approved ? 'APPLIED' : 'REJECTED';
      const updated = await transaction.proposedAssetChange.update({
        where: { id: change.id },
        data: { status, reviewedAt: new Date(), reviewedByUserId: actorUserId },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: approved ? 'ProposedAssetChangeApplied' : 'ProposedAssetChangeRejected',
          entityType: 'Asset',
          entityId: change.assetId,
          data: {
            proposedAssetChangeId: change.id,
            selectivelyResolved: resolvedData !== undefined,
            ...(resolvedData === undefined ? {} : { resolvedData }),
          } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  async issueDocument(
    organisationId: string,
    inspectionId: string,
    actorUserId: string,
    correlationId: string,
  ) {
    const inspection = await this.detail(organisationId, inspectionId);
    if (inspection.status !== 'APPROVED')
      throw new DomainError(
        'INSPECTION_NOT_APPROVED',
        'Approve the inspection before issuing a document.',
        409,
      );
    const revision = inspection.revisions[0];
    if (revision === undefined)
      throw new DomainError(
        'INSPECTION_REVISION_MISSING',
        'The inspection has no submitted revision.',
        409,
      );
    const existing = revision.documents[0];
    if (existing !== undefined) return existing;
    const reportName =
      inspection.moduleKey === 'ev-charging'
        ? 'EV Charging Inspection Certificate'
        : inspection.moduleKey === 'thermal-imaging'
          ? 'Thermal Imaging Report'
          : 'Inspection Report';
    const title = `${reportName} — ${inspection.asset?.displayName ?? inspection.site.name}`;
    const document = await this.prisma.document.create({
      data: {
        organisationId,
        entityType: inspection.assetId === null ? 'Site' : 'Asset',
        entityId: inspection.assetId ?? inspection.siteId,
        title,
        category:
          inspection.moduleKey === 'ev-charging'
            ? 'EV Certificate'
            : inspection.moduleKey === 'thermal-imaging'
              ? 'Thermal Imaging Report'
              : 'Inspection Report',
        issuedAt: new Date(),
        inspectionRevisionId: revision.id,
        templateKey: `${inspection.moduleKey}-certificate`,
        templateVersion: 1,
        snapshot: revision.snapshots as Prisma.InputJsonValue,
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        organisationId,
        actorUserId,
        correlationId,
        eventType: 'CertificateIssued',
        entityType: 'Document',
        entityId: document.id,
        data: { inspectionId, revisionNumber: revision.revisionNumber },
      },
    });
    return document;
  }

  async issueVisitDocuments(
    organisationId: string,
    visitId: string,
    actorUserId: string,
    correlationId: string,
  ) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, organisationId },
      select: { id: true },
    });
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
    const inspections = await this.prisma.inspection.findMany({
      where: { organisationId, visitId, status: 'APPROVED' },
      include: {
        asset: { select: { displayName: true } },
        site: { select: { name: true } },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          include: { documents: true },
        },
      },
    });
    const missing = inspections.flatMap((inspection) => {
      const revision = inspection.revisions[0];
      if (revision === undefined || revision.documents.length > 0) return [];
      return [
        {
          organisationId,
          entityType: inspection.assetId === null ? 'Site' : 'Asset',
          entityId: inspection.assetId ?? inspection.siteId,
          title: `${inspection.moduleKey === 'ev-charging' ? 'EV Charging Inspection Certificate' : inspection.moduleKey === 'thermal-imaging' ? 'Thermal Imaging Report' : 'Inspection Report'} — ${inspection.asset?.displayName ?? inspection.site.name}`,
          category:
            inspection.moduleKey === 'ev-charging'
              ? 'EV Certificate'
              : inspection.moduleKey === 'thermal-imaging'
                ? 'Thermal Imaging Report'
                : 'Inspection Report',
          issuedAt: new Date(),
          inspectionRevisionId: revision.id,
          templateKey: `${inspection.moduleKey}-certificate`,
          templateVersion: 1,
          snapshot: revision.snapshots as Prisma.InputJsonValue,
        },
      ];
    });
    if (missing.length > 0)
      await this.prisma.$transaction(async (transaction) => {
        await transaction.document.createMany({ data: missing });
        await transaction.auditEvent.create({
          data: {
            organisationId,
            actorUserId,
            correlationId,
            eventType: 'VisitCertificatesIssued',
            entityType: 'Visit',
            entityId: visitId,
            data: { issuedCount: missing.length, approvedInspectionCount: inspections.length },
          },
        });
      });
    const revisionIds = inspections.flatMap(({ revisions }) =>
      revisions[0] === undefined ? [] : [revisions[0].id],
    );
    const documents = await this.prisma.document.findMany({
      where: { organisationId, inspectionRevisionId: { in: revisionIds } },
      orderBy: { createdAt: 'desc' },
    });
    const currentByRevision = new Map<string, (typeof documents)[number]>();
    for (const document of documents)
      if (
        document.inspectionRevisionId !== null &&
        !currentByRevision.has(document.inspectionRevisionId)
      )
        currentByRevision.set(document.inspectionRevisionId, document);
    return [...currentByRevision.values()].sort((left, right) =>
      left.title.localeCompare(right.title),
    );
  }

  async listDocuments(organisationId: string, visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, organisationId },
      select: { id: true },
    });
    if (visit === null) throw new DomainError('VISIT_NOT_FOUND', 'The job was not found.', 404);
    const inspections = await this.prisma.inspection.findMany({
      where: { organisationId, visitId, status: 'APPROVED' },
      include: {
        asset: { select: { id: true, displayName: true, assetReference: true } },
        site: { select: { name: true } },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            revisionNumber: true,
            documents: {
              where: { status: { not: 'ARCHIVED' } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    const documents = inspections.flatMap((inspection) => {
      const revision = inspection.revisions[0];
      const document = revision?.documents[0];
      if (revision === undefined || document === undefined) return [];
      return [
        {
          ...document,
          inspection: {
            id: inspection.id,
            moduleKey: inspection.moduleKey,
            inspectionType: inspection.inspectionType,
            status: inspection.status,
            revisionNumber: revision.revisionNumber,
            asset: inspection.asset,
            siteName: inspection.site.name,
          },
        },
      ];
    });
    return documents.sort((left, right) => left.title.localeCompare(right.title));
  }
}
