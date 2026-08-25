import type { PrismaClient } from '../../generated/prisma/client';
import { DomainError } from '../../shared/domain-error';

export class EvService {
  constructor(private readonly prisma: PrismaClient) {}

  async detail(organisationId: string, assetId: string) {
    const [asset, media] = await Promise.all([
      this.prisma.asset.findFirst({
        where: { id: assetId, organisationId },
        include: {
          customer: { select: { id: true, name: true } },
          site: { select: { id: true, name: true } },
          evChargePoint: {
            include: {
              supplies: { orderBy: { createdAt: 'asc' } },
              connectors: {
                include: { supplyMappings: { include: { supply: true } } },
                orderBy: { displayOrder: 'asc' },
              },
            },
          },
        },
      }),
      this.prisma.media.findMany({
        where: { organisationId, entityType: 'Asset', entityId: assetId, status: 'AVAILABLE' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (asset === null)
      throw new DomainError('ASSET_NOT_FOUND', 'The EV charger was not found.', 404);
    return { ...asset, media };
  }

  async saveChargePoint(
    organisationId: string,
    assetId: string,
    input: {
      chargePointId?: string | undefined;
      operatorName?: string | undefined;
      firmwareVersion?: string | undefined;
      installationDate?: Date | undefined;
      nominalVoltage?: number | undefined;
      phaseCount?: number | undefined;
      maximumPowerKw?: number | undefined;
      dcRcdType?: string | undefined;
      locationNotes?: string | undefined;
    },
  ) {
    await this.detail(organisationId, assetId);
    const data = Object.fromEntries(
      Object.entries(input).filter((entry) => entry[1] !== undefined),
    );
    return this.prisma.evChargePoint.upsert({
      where: { assetId },
      create: { organisationId, assetId, ...data },
      update: data,
    });
  }

  async addSupply(
    organisationId: string,
    assetId: string,
    input: {
      label: string;
      phaseCount: number;
      protectiveDeviceType?: string | undefined;
      protectiveDeviceRating?: number | undefined;
      earthingArrangement?: string | undefined;
    },
  ) {
    const asset = await this.detail(organisationId, assetId);
    const chargePoint =
      asset.evChargePoint ??
      (await this.prisma.evChargePoint.create({ data: { organisationId, assetId } }));
    return this.prisma.evSupply.create({
      data: {
        organisationId,
        chargePointId: chargePoint.id,
        label: input.label,
        phaseCount: input.phaseCount,
        ...(input.protectiveDeviceType === undefined
          ? {}
          : { protectiveDeviceType: input.protectiveDeviceType }),
        ...(input.protectiveDeviceRating === undefined
          ? {}
          : { protectiveDeviceRating: input.protectiveDeviceRating }),
        ...(input.earthingArrangement === undefined
          ? {}
          : { earthingArrangement: input.earthingArrangement }),
      },
    });
  }

  async updateSupply(
    organisationId: string,
    assetId: string,
    supplyId: string,
    input: {
      label: string;
      phaseCount: number;
      protectiveDeviceType?: string | undefined;
      protectiveDeviceRating?: number | undefined;
      earthingArrangement?: string | undefined;
    },
  ) {
    const asset = await this.detail(organisationId, assetId);
    if (!asset.evChargePoint?.supplies.some((supply) => supply.id === supplyId))
      throw new DomainError('EV_SUPPLY_NOT_FOUND', 'The supply was not found.', 404);
    return this.prisma.evSupply.update({
      where: { id: supplyId },
      data: {
        label: input.label,
        phaseCount: input.phaseCount,
        ...(input.protectiveDeviceType === undefined
          ? {}
          : { protectiveDeviceType: input.protectiveDeviceType }),
        ...(input.protectiveDeviceRating === undefined
          ? {}
          : { protectiveDeviceRating: input.protectiveDeviceRating }),
        ...(input.earthingArrangement === undefined
          ? {}
          : { earthingArrangement: input.earthingArrangement }),
      },
    });
  }

  async deleteSupply(organisationId: string, assetId: string, supplyId: string) {
    const asset = await this.detail(organisationId, assetId);
    if (!asset.evChargePoint?.supplies.some((supply) => supply.id === supplyId))
      throw new DomainError('EV_SUPPLY_NOT_FOUND', 'The supply was not found.', 404);
    return this.prisma.evSupply.delete({ where: { id: supplyId } });
  }

  async addConnector(
    organisationId: string,
    assetId: string,
    input: {
      label: string;
      connectorType: string;
      supplyIds: string[];
    },
  ) {
    const supplyIds = input.supplyIds.slice(0, 1);
    const asset = await this.detail(organisationId, assetId);
    const chargePoint =
      asset.evChargePoint ??
      (await this.prisma.evChargePoint.create({ data: { organisationId, assetId } }));
    const supplies = await this.prisma.evSupply.findMany({
      where: { id: { in: supplyIds }, chargePointId: chargePoint.id, organisationId },
    });
    if (supplies.length !== new Set(supplyIds).size)
      throw new DomainError(
        'EV_SUPPLY_INVALID',
        'One or more selected supplies do not belong to this charger.',
        422,
      );
    return this.prisma.evConnector.create({
      data: {
        organisationId,
        chargePointId: chargePoint.id,
        label: input.label,
        connectorType: input.connectorType,
        supplyMappings: { create: supplyIds.map((supplyId) => ({ supplyId })) },
      },
      include: { supplyMappings: true },
    });
  }

  async updateConnector(
    organisationId: string,
    assetId: string,
    connectorId: string,
    input: { label: string; connectorType: string; supplyIds: string[] },
  ) {
    const supplyIds = input.supplyIds.slice(0, 1);
    const asset = await this.detail(organisationId, assetId);
    const chargePoint = asset.evChargePoint;
    if (!chargePoint?.connectors.some((connector) => connector.id === connectorId))
      throw new DomainError('EV_CONNECTOR_NOT_FOUND', 'The connector was not found.', 404);
    const supplies = await this.prisma.evSupply.findMany({
      where: { id: { in: supplyIds }, chargePointId: chargePoint.id, organisationId },
    });
    if (supplies.length !== new Set(supplyIds).size)
      throw new DomainError('EV_SUPPLY_INVALID', 'A mapped supply is invalid.', 422);
    return this.prisma.evConnector.update({
      where: { id: connectorId },
      data: {
        label: input.label,
        connectorType: input.connectorType,
        supplyMappings: {
          deleteMany: {},
          create: supplyIds.map((supplyId) => ({ supplyId })),
        },
      },
      include: { supplyMappings: true },
    });
  }

  async deleteConnector(organisationId: string, assetId: string, connectorId: string) {
    const asset = await this.detail(organisationId, assetId);
    if (!asset.evChargePoint?.connectors.some((connector) => connector.id === connectorId))
      throw new DomainError('EV_CONNECTOR_NOT_FOUND', 'The connector was not found.', 404);
    return this.prisma.evConnector.delete({ where: { id: connectorId } });
  }
}
