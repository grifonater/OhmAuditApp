import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { InstructionService } from '../src/platform/instruction.service';

interface MockOptions {
  findManyInstructions?: () => unknown;
  findUniqueInstruction?: () => unknown;
  createInstruction?: (args: unknown) => unknown;
  updateInstruction?: (args: unknown) => unknown;
  deleteInstruction?: (args: unknown) => unknown;
  mediaFindFirst?: () => unknown;
  mediaFindMany?: () => unknown;
  mediaDelete?: () => unknown;
  organisationCount?: () => unknown;
  groupByAssets?: () => unknown;
  findManyModels?: () => unknown;
  createAudit?: (args: unknown) => unknown;
}

function createPrismaMock(options: MockOptions = {}) {
  const transaction = {
    evTestInstruction: {
      create: options.createInstruction ?? vi.fn().mockResolvedValue({ id: 'new-instruction' }),
      update:
        options.updateInstruction ?? vi.fn().mockResolvedValue({ id: 'existing-instruction' }),
      delete: options.deleteInstruction ?? vi.fn().mockResolvedValue(undefined),
    },
    media: { delete: options.mediaDelete ?? vi.fn().mockResolvedValue(undefined) },
    auditEvent: { create: options.createAudit ?? vi.fn().mockResolvedValue(undefined) },
  };
  const prisma = {
    evTestInstruction: {
      findMany: options.findManyInstructions ?? vi.fn().mockResolvedValue([]),
      findUnique: options.findUniqueInstruction ?? vi.fn().mockResolvedValue(null),
    },
    media: {
      findFirst: options.mediaFindFirst ?? vi.fn().mockResolvedValue(null),
      findMany: options.mediaFindMany ?? vi.fn().mockResolvedValue([]),
    },
    asset: { groupBy: options.groupByAssets ?? vi.fn().mockResolvedValue([]) },
    assetModel: { findMany: options.findManyModels ?? vi.fn().mockResolvedValue([]) },
    organisation: { count: options.organisationCount ?? vi.fn().mockResolvedValue(1) },
    $transaction: vi.fn((operation: (client: typeof transaction) => unknown) =>
      Promise.resolve(operation(transaction)),
    ),
  } as unknown as PrismaClient;
  return { prisma, transaction };
}

describe('InstructionService contentFor', () => {
  it('serves the specific manufacturer guide even when a generic set exists (case-insensitive)', async () => {
    const { prisma } = createPrismaMock({
      findManyInstructions: () =>
        Promise.resolve([
          {
            id: 'generic',
            step: 'unit',
            title: 'Generic unit check',
            manufacturers: [],
            steps: ['G1'],
            notes: null,
            videoMediaId: null,
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'abb',
            step: 'unit',
            title: 'ABB unit check',
            manufacturers: ['  ABB  '],
            steps: ['A1'],
            notes: null,
            videoMediaId: null,
            updatedAt: new Date('2026-02-01T00:00:00Z'),
          },
        ]),
    });
    const result = await new InstructionService(prisma).contentFor('unit', 'abb');
    expect(result).toMatchObject({ id: 'abb', matchedManufacturer: true, steps: ['A1'] });
  });

  it('falls back to the generic set when no specific manufacturer matches', async () => {
    const { prisma } = createPrismaMock({
      findManyInstructions: () =>
        Promise.resolve([
          {
            id: 'schneider',
            step: 'supplies',
            title: 'Schneider supplies',
            manufacturers: ['schneider'],
            steps: ['S1'],
            notes: null,
            videoMediaId: null,
            updatedAt: new Date('2026-02-01T00:00:00Z'),
          },
          {
            id: 'generic',
            step: 'supplies',
            title: 'Generic supplies',
            manufacturers: [],
            steps: ['G1'],
            notes: 'Careful with voltage.',
            videoMediaId: null,
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          },
        ]),
    });
    const result = await new InstructionService(prisma).contentFor('supplies', 'wojtech');
    expect(result).toMatchObject({
      id: 'generic',
      matchedManufacturer: false,
      notes: 'Careful with voltage.',
    });
  });

  it('returns null when nothing matches and no generic set exists', async () => {
    const { prisma } = createPrismaMock({
      findManyInstructions: () =>
        Promise.resolve([
          {
            id: 'abb',
            step: 'connectors',
            title: 'ABB connectors',
            manufacturers: ['abb'],
            steps: ['C1'],
            notes: null,
            videoMediaId: null,
            updatedAt: new Date('2026-02-01T00:00:00Z'),
          },
        ]),
    });
    await expect(new InstructionService(prisma).contentFor('connectors', 'tesla')).resolves.toBe(
      null,
    );
  });

  it('rejects an unknown step', async () => {
    const { prisma } = createPrismaMock();
    await expect(
      new InstructionService(prisma).contentFor('faulty', undefined),
    ).rejects.toMatchObject({
      code: 'EV_TEST_STEP_INVALID',
      status: 422,
    });
  });

  it('attaches the video only when the linked media is available', async () => {
    const { prisma } = createPrismaMock({
      findManyInstructions: () =>
        Promise.resolve([
          {
            id: 'abb',
            step: 'submit',
            title: 'ABB submit',
            manufacturers: ['abb'],
            steps: ['S1'],
            notes: null,
            videoMediaId: 'media-1',
            updatedAt: new Date('2026-02-01T00:00:00Z'),
          },
        ]),
      mediaFindFirst: () =>
        Promise.resolve({
          id: 'media-1',
          mimeType: 'video/mp4',
          createdAt: new Date('2026-02-01T00:00:00Z'),
        }),
    });
    const result = await new InstructionService(prisma).contentFor('submit', 'abb');
    expect(result?.video).toMatchObject({ id: 'media-1', mimeType: 'video/mp4' });
  });

  it('falls back to the generic video when the specific set has none', async () => {
    const { prisma } = createPrismaMock({
      findManyInstructions: () =>
        Promise.resolve([
          {
            id: 'generic',
            step: 'condition',
            title: 'Generic condition',
            manufacturers: [],
            steps: ['G1'],
            notes: null,
            videoMediaId: 'generic-media',
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'abb',
            step: 'condition',
            title: 'ABB condition',
            manufacturers: ['abb'],
            steps: ['A1'],
            notes: null,
            videoMediaId: null,
            updatedAt: new Date('2026-02-01T00:00:00Z'),
          },
        ]),
      mediaFindFirst: () =>
        Promise.resolve({
          id: 'generic-media',
          mimeType: 'video/mp4',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
    });
    const result = await new InstructionService(prisma).contentFor('condition', 'abb');
    expect(result).toMatchObject({ id: 'abb', matchedManufacturer: true });
    expect(result?.video).toMatchObject({ id: 'generic-media', mimeType: 'video/mp4' });
  });

  it('keeps the specific video when it exists even if the generic set also has one', async () => {
    const { prisma } = createPrismaMock({
      findManyInstructions: () =>
        Promise.resolve([
          {
            id: 'generic',
            step: 'connectors',
            title: 'Generic connectors',
            manufacturers: [],
            steps: ['G1'],
            notes: null,
            videoMediaId: 'generic-media',
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'abb',
            step: 'connectors',
            title: 'ABB connectors',
            manufacturers: ['abb'],
            steps: ['A1'],
            notes: null,
            videoMediaId: 'abb-media',
            updatedAt: new Date('2026-02-01T00:00:00Z'),
          },
        ]),
      mediaFindFirst: vi.fn().mockImplementation((args: { where: { id: string } }) =>
        Promise.resolve(
          args.where.id === 'abb-media'
            ? {
                id: 'abb-media',
                mimeType: 'video/mp4',
                createdAt: new Date('2026-02-01T00:00:00Z'),
              }
            : {
                id: 'generic-media',
                mimeType: 'video/webm',
                createdAt: new Date('2026-01-01T00:00:00Z'),
              },
        ),
      ),
    });
    const result = await new InstructionService(prisma).contentFor('connectors', 'abb');
    expect(result?.video).toMatchObject({ id: 'abb-media' });
  });

  it('returns no video when neither the specific nor the generic set has an available video', async () => {
    const { prisma } = createPrismaMock({
      findManyInstructions: () =>
        Promise.resolve([
          {
            id: 'generic',
            step: 'condition',
            title: 'Generic condition',
            manufacturers: [],
            steps: ['G1'],
            notes: null,
            videoMediaId: 'generic-media',
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'abb',
            step: 'condition',
            title: 'ABB condition',
            manufacturers: ['abb'],
            steps: ['A1'],
            notes: null,
            videoMediaId: null,
            updatedAt: new Date('2026-02-01T00:00:00Z'),
          },
        ]),
      mediaFindFirst: () => Promise.resolve(null),
    });
    const result = await new InstructionService(prisma).contentFor('condition', 'abb');
    expect(result).toMatchObject({ id: 'abb', matchedManufacturer: true });
    expect(result?.video).toBeNull();
  });
});

describe('InstructionService create', () => {
  it('normalises and dedupes manufacturers and trims instruction steps', async () => {
    const createInstruction = vi
      .fn()
      .mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-set', ...args.data }),
      );
    const createAudit = vi.fn().mockResolvedValue(undefined);
    const { prisma, transaction } = createPrismaMock({ createInstruction, createAudit });
    const service = new InstructionService(prisma);
    await service.create(
      'user-1',
      {
        step: 'unit',
        manufacturers: ['  ABB ', 'ABB', 'schneider', '  '],
        title: '  Unit checks  ',
        steps: ['  Step one  ', '', 'Step two'],
        notes: '  Read carefully  ',
      },
      'correlation-1',
    );
    expect(createInstruction).toHaveBeenCalledWith({
      data: {
        step: 'unit',
        manufacturers: ['ABB', 'schneider'],
        title: 'Unit checks',
        steps: ['Step one', 'Step two'],
        notes: 'Read carefully',
      },
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: {
        organisationId: null,
        actorUserId: 'user-1',
        eventType: 'EvTestInstructionCreated',
        entityType: 'EvTestInstruction',
        entityId: 'new-set',
        correlationId: 'correlation-1',
        data: { step: 'unit', manufacturers: ['ABB', 'schneider'], title: 'Unit checks' },
      },
    });
    expect(transaction).toBeDefined();
  });

  it('rejects an empty instruction list', async () => {
    const { prisma } = createPrismaMock();
    await expect(
      new InstructionService(prisma).create(
        'user-1',
        { step: 'unit', manufacturers: ['abb'], title: 'Empty', steps: [] },
        'correlation-1',
      ),
    ).rejects.toMatchObject({ code: 'EV_INSTRUCTION_STEPS_REQUIRED', status: 422 });
  });

  it('rejects a second generic set for the same step', async () => {
    const { prisma } = createPrismaMock({
      findManyInstructions: () =>
        Promise.resolve([{ manufacturers: [], title: 'Existing generic unit' }]),
    });
    await expect(
      new InstructionService(prisma).create(
        'user-1',
        { step: 'unit', manufacturers: [], title: 'Another generic', steps: ['A1'] },
        'correlation-1',
      ),
    ).rejects.toMatchObject({ code: 'EV_INSTRUCTION_CONFLICT', status: 409 });
  });

  it('rejects a manufacturer that overlaps another set on the same step', async () => {
    const { prisma } = createPrismaMock({
      findManyInstructions: () =>
        Promise.resolve([{ manufacturers: ['abb'], title: 'Existing ABB unit' }]),
    });
    await expect(
      new InstructionService(prisma).create(
        'user-1',
        { step: 'unit', manufacturers: ['ABB', 'tesla'], title: 'Unit + Tesla', steps: ['A1'] },
        'correlation-1',
      ),
    ).rejects.toMatchObject({ code: 'EV_INSTRUCTION_CONFLICT', status: 409 });
  });
});

describe('InstructionService update', () => {
  it('rejects an unknown instruction', async () => {
    const { prisma } = createPrismaMock({ findUniqueInstruction: () => Promise.resolve(null) });
    await expect(
      new InstructionService(prisma).update(
        'user-1',
        'missing-id',
        { step: 'unit', manufacturers: ['abb'], title: 'T', steps: ['A1'] },
        'correlation-1',
      ),
    ).rejects.toMatchObject({ code: 'EV_INSTRUCTION_NOT_FOUND', status: 404 });
  });

  it('ignores the instruction itself when checking for conflicts', async () => {
    const updateInstruction = vi
      .fn()
      .mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'own-id', ...args.data }),
      );
    const { prisma } = createPrismaMock({
      findUniqueInstruction: () =>
        Promise.resolve({ id: 'own-id', step: 'unit', manufacturers: ['abb'], title: 'Mine' }),
      findManyInstructions: vi
        .fn()
        .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            where['NOT'] !== undefined ? [] : [{ manufacturers: ['abb'], title: 'Deny me' }],
          ),
        ),
      updateInstruction,
    });
    const service = new InstructionService(prisma);
    await service.update(
      'user-1',
      'own-id',
      { step: 'unit', manufacturers: ['ABB'], title: 'Mine 2', steps: ['A1'] },
      'correlation-1',
    );
    expect(updateInstruction).toHaveBeenCalledWith({
      where: { id: 'own-id' },
      data: {
        step: 'unit',
        manufacturers: ['ABB'],
        title: 'Mine 2',
        steps: ['A1'],
        notes: null,
      },
    });
  });
});

describe('InstructionService coverage', () => {
  it('computes manufacturers, covered steps, count and generic steps', async () => {
    const { prisma } = createPrismaMock({
      groupByAssets: () =>
        Promise.resolve([
          { manufacturer: 'ABB', _count: { _all: 3 } },
          { manufacturer: 'Schneider', _count: { _all: 5 } },
        ]),
      findManyModels: () =>
        Promise.resolve([{ manufacturer: 'Schneider' }, { manufacturer: 'NewBrand' }]),
      findManyInstructions: () =>
        Promise.resolve([
          { step: 'unit', manufacturers: ['abb'] },
          { step: 'submit', manufacturers: [] },
        ]),
    });
    const result = await new InstructionService(prisma).coverage(40, '');
    expect(result.total).toBe(3);
    expect(result.genericSteps).toEqual(['submit']);
    expect(result.manufacturers).toHaveLength(3);
    const [top, abbr, newbrand] = result.manufacturers;
    expect(top).toMatchObject({ manufacturer: 'Schneider', count: 5 });
    expect(top!.missingSteps).toEqual(['unit', 'supplies', 'connectors', 'condition', 'submit']);
    expect(abbr).toMatchObject({ manufacturer: 'ABB', count: 3, coveredSteps: ['unit'] });
    expect(abbr!.missingSteps).toEqual(['supplies', 'connectors', 'condition', 'submit']);
    expect(newbrand).toMatchObject({ manufacturer: 'NewBrand', count: 0 });
  });

  it('filters manufacturers by query', async () => {
    const { prisma } = createPrismaMock({
      groupByAssets: () =>
        Promise.resolve([
          { manufacturer: 'ABB', _count: { _all: 3 } },
          { manufacturer: 'Schneider', _count: { _all: 5 } },
        ]),
    });
    const result = await new InstructionService(prisma).coverage(40, 'schn');
    expect(result.manufacturers.map((item) => item.manufacturer)).toEqual(['Schneider']);
    expect(result.total).toBe(2);
  });
});
