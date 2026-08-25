import type { PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

export interface EquipmentInput {
  name: string;
  equipmentType: string;
  manufacturer?: string | undefined;
  model?: string | undefined;
  serialNumber?: string | undefined;
  calibrationDueAt?: string | undefined;
  notes?: string | undefined;
}
export interface EquipmentUpdateInput {
  name?: string | undefined;
  equipmentType?: string | undefined;
  manufacturer?: string | undefined;
  model?: string | undefined;
  serialNumber?: string | undefined;
  calibrationDueAt?: string | undefined;
  notes?: string | undefined;
}

export class EquipmentService {
  constructor(private readonly prisma: PrismaClient) {}

  list(organisationId: string, includeArchived = false) {
    return this.prisma.organisationEquipment.findMany({
      where: { organisationId, ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }) },
      orderBy: [{ equipmentType: 'asc' }, { name: 'asc' }],
    });
  }

  create(organisationId: string, input: EquipmentInput) {
    return this.prisma.organisationEquipment.create({
      data: {
        organisationId,
        name: input.name,
        equipmentType: input.equipmentType,
        ...(input.manufacturer === undefined ? {} : { manufacturer: input.manufacturer }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.serialNumber === undefined ? {} : { serialNumber: input.serialNumber }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.calibrationDueAt === undefined
          ? {}
          : { calibrationDueAt: new Date(`${input.calibrationDueAt}T00:00:00.000Z`) }),
      },
    });
  }

  async update(organisationId: string, equipmentId: string, input: EquipmentUpdateInput) {
    const equipment = await this.requireEquipment(organisationId, equipmentId);
    return this.prisma.organisationEquipment.update({
      where: { id: equipment.id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.equipmentType === undefined ? {} : { equipmentType: input.equipmentType }),
        ...(input.manufacturer === undefined ? {} : { manufacturer: input.manufacturer }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.serialNumber === undefined ? {} : { serialNumber: input.serialNumber }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.calibrationDueAt === undefined
          ? {}
          : {
              calibrationDueAt:
                input.calibrationDueAt === ''
                  ? null
                  : new Date(`${input.calibrationDueAt}T00:00:00.000Z`),
            }),
      },
    });
  }

  async archive(organisationId: string, equipmentId: string) {
    const equipment = await this.requireEquipment(organisationId, equipmentId);
    return this.prisma.organisationEquipment.update({
      where: { id: equipment.id },
      data: { status: 'ARCHIVED' },
    });
  }

  private async requireEquipment(organisationId: string, equipmentId: string) {
    const equipment = await this.prisma.organisationEquipment.findFirst({
      where: { id: equipmentId, organisationId },
    });
    if (equipment === null)
      throw new DomainError('EQUIPMENT_NOT_FOUND', 'The equipment record was not found.', 404);
    return equipment;
  }
}
