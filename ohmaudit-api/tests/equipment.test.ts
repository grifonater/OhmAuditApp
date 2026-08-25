import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { EquipmentService } from '../src/equipment/equipment.service';

describe('Organisation equipment register', () => {
  it('always scopes equipment listing to the active organisation', async () => {
    let where: unknown;
    const prisma = {
      organisationEquipment: {
        findMany: (input: { where: unknown }) => {
          where = input.where;
          return Promise.resolve([]);
        },
      },
    } as unknown as PrismaClient;

    await new EquipmentService(prisma).list('organisation-a');

    expect(where).toEqual({ organisationId: 'organisation-a', status: { not: 'ARCHIVED' } });
  });

  it('archives only an equipment record found in the active organisation', async () => {
    let lookup: unknown;
    let update: unknown;
    const prisma = {
      organisationEquipment: {
        findFirst: (input: { where: unknown }) => {
          lookup = input.where;
          return Promise.resolve({ id: 'equipment-a' });
        },
        update: (input: unknown) => {
          update = input;
          return Promise.resolve({ id: 'equipment-a', status: 'ARCHIVED' });
        },
      },
    } as unknown as PrismaClient;

    await new EquipmentService(prisma).archive('organisation-a', 'equipment-a');

    expect(lookup).toEqual({ id: 'equipment-a', organisationId: 'organisation-a' });
    expect(update).toEqual({ where: { id: 'equipment-a' }, data: { status: 'ARCHIVED' } });
  });
});
