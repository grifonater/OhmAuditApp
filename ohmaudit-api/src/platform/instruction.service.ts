import type { PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

export const EV_TEST_STEPS = ['unit', 'supplies', 'connectors', 'condition', 'submit'] as const;
export type EvTestStep = (typeof EV_TEST_STEPS)[number];

export interface EvTestInstructionInput {
  step: EvTestStep;
  manufacturers: string[];
  title: string;
  steps: string[];
  notes?: string | undefined;
}

export function normalise(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-GB');
}

export class InstructionService {
  constructor(private readonly prisma: PrismaClient) {}

  async platformList(step?: string) {
    const sets = await this.prisma.evTestInstruction.findMany({
      where: step === undefined || step === '' ? {} : { step },
      orderBy: [{ step: 'asc' }, { updatedAt: 'desc' }],
    });
    const videoRows = await this.prisma.media.findMany({
      where: {
        entityType: 'EvTestInstruction',
        entityId: { in: sets.map((set) => set.id) },
        category: 'ev-test-instruction-video',
      },
      select: {
        id: true,
        entityId: true,
        mimeType: true,
        status: true,
        createdAt: true,
      },
    });
    const videoByInstruction = new Map(videoRows.map((video) => [video.entityId, video] as const));
    return sets.map((set) => this.toPlatformItem(set, videoByInstruction.get(set.id)));
  }

  async coverage(limit: number, query: string) {
    const [groups, modelRows, sets] = await Promise.all([
      this.prisma.asset.groupBy({
        by: ['manufacturer'],
        where: {
          assetType: { contains: 'EV', mode: 'insensitive' },
          manufacturer: { not: null },
          status: { notIn: ['REMOVED', 'DECOMMISSIONED', 'REPLACED'] },
        },
        _count: { _all: true },
      }),
      this.prisma.assetModel.findMany({
        where: { category: { contains: 'EV', mode: 'insensitive' } },
        select: { manufacturer: true },
        distinct: ['manufacturer'],
      }),
      this.prisma.evTestInstruction.findMany({
        select: { step: true, manufacturers: true },
      }),
    ]);
    const coveredByManufacturer = new Map<string, Set<string>>();
    for (const set of sets) {
      for (const manufacturer of set.manufacturers) {
        let steps = coveredByManufacturer.get(manufacturer);
        if (steps === undefined) {
          steps = new Set<string>();
          coveredByManufacturer.set(manufacturer, steps);
        }
        steps.add(set.step);
      }
    }
    const entries = new Map<string, { manufacturer: string; count: number }>();
    for (const group of groups) {
      if (group.manufacturer === null) continue;
      const key = normalise(group.manufacturer);
      const existing = entries.get(key);
      entries.set(key, {
        manufacturer: existing?.manufacturer ?? group.manufacturer,
        count: (existing?.count ?? 0) + group._count._all,
      });
    }
    for (const model of modelRows) {
      const key = normalise(model.manufacturer);
      if (entries.has(key)) continue;
      entries.set(key, { manufacturer: model.manufacturer, count: 0 });
    }
    const needle = normalise(query);
    const manufacturers = [...entries.values()]
      .filter((item) => needle === '' || normalise(item.manufacturer).includes(needle))
      .map((item) => {
        const covered =
          coveredByManufacturer.get(normalise(item.manufacturer)) ?? new Set<string>();
        return {
          manufacturer: item.manufacturer,
          count: item.count,
          coveredSteps: EV_TEST_STEPS.filter((step) => covered.has(step)),
          missingSteps: EV_TEST_STEPS.filter((step) => !covered.has(step)),
        };
      })
      .sort(
        (left, right) =>
          right.count - left.count || left.manufacturer.localeCompare(right.manufacturer),
      )
      .slice(0, limit);
    return {
      manufacturers,
      total: entries.size,
      genericSteps: EV_TEST_STEPS.filter((step) =>
        sets.some((set) => set.step === step && set.manufacturers.length === 0),
      ),
    };
  }

  async create(actorUserId: string, input: EvTestInstructionInput, correlationId: string) {
    const prepared = this.prepare(input);
    await this.assertNoConflict(prepared);
    return this.prisma.$transaction(async (transaction) => {
      const created = await transaction.evTestInstruction.create({
        data: {
          step: prepared.step,
          manufacturers: prepared.manufacturers,
          title: prepared.title,
          steps: prepared.steps,
          notes: prepared.notes ?? null,
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId: null,
          actorUserId,
          eventType: 'EvTestInstructionCreated',
          entityType: 'EvTestInstruction',
          entityId: created.id,
          correlationId,
          data: {
            step: created.step,
            manufacturers: created.manufacturers,
            title: created.title,
          },
        },
      });
      return created;
    });
  }

  async update(
    actorUserId: string,
    instructionId: string,
    input: EvTestInstructionInput,
    correlationId: string,
  ) {
    const existing = await this.prisma.evTestInstruction.findUnique({
      where: { id: instructionId },
    });
    if (existing === null)
      throw new DomainError('EV_INSTRUCTION_NOT_FOUND', 'The instruction set was not found.', 404);
    const prepared = this.prepare(input);
    await this.assertNoConflict(prepared, instructionId);
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.evTestInstruction.update({
        where: { id: instructionId },
        data: {
          step: prepared.step,
          manufacturers: prepared.manufacturers,
          title: prepared.title,
          steps: prepared.steps,
          notes: prepared.notes ?? null,
        },
      });
      await transaction.auditEvent.create({
        data: {
          organisationId: null,
          actorUserId,
          eventType: 'EvTestInstructionUpdated',
          entityType: 'EvTestInstruction',
          entityId: instructionId,
          correlationId,
          data: {
            step: prepared.step,
            manufacturers: prepared.manufacturers,
            title: prepared.title,
          },
        },
      });
      return updated;
    });
  }

  async deleteInstruction(instructionId: string) {
    const instruction = await this.prisma.evTestInstruction.findUnique({
      where: { id: instructionId },
    });
    if (instruction === null)
      throw new DomainError('EV_INSTRUCTION_NOT_FOUND', 'The instruction set was not found.', 404);
    const media = await this.videoMedia(instructionId, true);
    await this.prisma.$transaction(async (transaction) => {
      if (media !== null) await transaction.media.delete({ where: { id: media.id } });
      await transaction.evTestInstruction.delete({ where: { id: instructionId } });
    });
    return { instruction, media };
  }

  async registerVideo(
    actorUserId: string,
    organisationId: string,
    instructionId: string,
    mimeType: string,
    size: number,
  ) {
    if ((await this.prisma.organisation.count({ where: { id: organisationId } })) === 0)
      throw new DomainError('ORGANISATION_NOT_FOUND', 'The organisation was not found.', 404);
    const instruction = await this.prisma.evTestInstruction.findUnique({
      where: { id: instructionId },
    });
    if (instruction === null)
      throw new DomainError('EV_INSTRUCTION_NOT_FOUND', 'The instruction set was not found.', 404);
    const previous = await this.videoMedia(instructionId, false);
    const storageKey = `platform/ev-test-instruction/${crypto.randomUUID()}`;
    return this.prisma.$transaction(async (transaction) => {
      if (previous !== null) await transaction.media.delete({ where: { id: previous.id } });
      const media = await transaction.media.create({
        data: {
          organisationId,
          capturedByUserId: actorUserId,
          storageKey,
          entityType: 'EvTestInstruction',
          entityId: instructionId,
          category: 'ev-test-instruction-video',
          caption: `Instructions video for ${instruction.title}`,
          mimeType,
          size,
        },
      });
      await transaction.evTestInstruction.update({
        where: { id: instructionId },
        data: { videoMediaId: media.id },
      });
      return { media, previous };
    });
  }

  async deleteVideo(instructionId: string) {
    const instruction = await this.prisma.evTestInstruction.findUnique({
      where: { id: instructionId },
    });
    if (instruction === null)
      throw new DomainError('EV_INSTRUCTION_NOT_FOUND', 'The instruction set was not found.', 404);
    const media = await this.videoMedia(instructionId, false);
    if (media === null) return { instruction, media: null };
    await this.prisma.$transaction(async (transaction) => {
      await transaction.media.delete({ where: { id: media.id } });
      await transaction.evTestInstruction.update({
        where: { id: instructionId },
        data: { videoMediaId: null },
      });
    });
    return { instruction, media };
  }

  async videoForUpload(instructionId: string) {
    const media = await this.prisma.media.findFirst({
      where: {
        entityType: 'EvTestInstruction',
        entityId: instructionId,
        category: 'ev-test-instruction-video',
        status: 'PENDING_UPLOAD',
      },
    });
    if (media === null)
      throw new DomainError(
        'INSTRUCTION_VIDEO_NOT_REGISTERED',
        'Register the video upload before sending its content.',
        404,
      );
    return media;
  }

  async confirmVideo(instructionId: string) {
    const media = await this.prisma.media.findFirst({
      where: {
        entityType: 'EvTestInstruction',
        entityId: instructionId,
        category: 'ev-test-instruction-video',
        status: 'PENDING_UPLOAD',
      },
    });
    if (media === null) return null;
    return this.prisma.media.update({
      where: { id: media.id },
      data: { status: 'AVAILABLE', createdAt: new Date() },
    });
  }

  async contentFor(step: string, manufacturer: string | undefined) {
    if (!EV_TEST_STEPS.includes(step as EvTestStep))
      throw new DomainError('EV_TEST_STEP_INVALID', `“${step}” is not a valid EV test step.`, 422);
    const target = normalise(manufacturer ?? '');
    const sets = await this.prisma.evTestInstruction.findMany({
      where: { step },
      orderBy: { updatedAt: 'desc' },
    });
    const specific =
      target === ''
        ? undefined
        : sets.find((set) => set.manufacturers.some((item) => normalise(item) === target));
    const generic =
      specific === undefined ? sets.find((set) => set.manufacturers.length === 0) : undefined;
    const chosen = specific ?? generic;
    if (chosen === undefined) return null;
    const video =
      chosen.videoMediaId === null
        ? null
        : await this.prisma.media.findFirst({
            where: { id: chosen.videoMediaId, status: 'AVAILABLE' },
            select: { id: true, mimeType: true, createdAt: true },
          });
    return {
      id: chosen.id,
      step: chosen.step,
      title: chosen.title,
      manufacturers: chosen.manufacturers,
      steps: chosen.steps,
      notes: chosen.notes,
      matchedManufacturer: specific !== undefined,
      video,
    };
  }

  async videoForContent(mediaId: string) {
    const media = await this.prisma.media.findFirst({
      where: {
        id: mediaId,
        entityType: 'EvTestInstruction',
        category: 'ev-test-instruction-video',
        status: 'AVAILABLE',
      },
    });
    if (media === null)
      throw new DomainError(
        'INSTRUCTION_VIDEO_NOT_FOUND',
        'The instruction video was not found.',
        404,
      );
    return media;
  }

  private async videoMedia(instructionId: string, availableOnly: boolean) {
    const instruction = await this.prisma.evTestInstruction.findUnique({
      where: { id: instructionId },
      select: { videoMediaId: true },
    });
    if (instruction === null || instruction.videoMediaId === null) return null;
    const media = await this.prisma.media.findFirst({
      where: {
        id: instruction.videoMediaId,
        entityType: 'EvTestInstruction',
        category: 'ev-test-instruction-video',
        ...(availableOnly ? { status: 'AVAILABLE' } : {}),
      },
    });
    return media;
  }

  private prepare(input: EvTestInstructionInput) {
    const manufacturers = [
      ...new Map(input.manufacturers.map((item) => [normalise(item), item.trim()])).values(),
    ].filter((item) => item !== '');
    const steps = input.steps.map((item) => item.trim()).filter((item) => item !== '');
    if (steps.length === 0)
      throw new DomainError(
        'EV_INSTRUCTION_STEPS_REQUIRED',
        'Provide at least one instruction step.',
        422,
      );
    return {
      step: input.step,
      manufacturers,
      title: input.title.trim(),
      steps,
      notes: input.notes === undefined ? null : input.notes.trim() || null,
    };
  }

  private async assertNoConflict(
    prepared: ReturnType<InstructionService['prepare']>,
    excludeInstructionId?: string,
  ) {
    const normalized = new Set(prepared.manufacturers.map((item) => normalise(item)));
    const existing = await this.prisma.evTestInstruction.findMany({
      where: {
        step: prepared.step,
        ...(excludeInstructionId === undefined ? {} : { NOT: { id: excludeInstructionId } }),
      },
      select: { manufacturers: true, title: true },
    });
    const conflict = existing.find((set) =>
      normalized.size === 0
        ? set.manufacturers.length === 0
        : set.manufacturers.some((item) => normalized.has(normalise(item))),
    );
    if (conflict !== undefined)
      throw new DomainError(
        'EV_INSTRUCTION_CONFLICT',
        normalized.size === 0
          ? 'Generic instructions already exist for this step. Delete or edit that set first.'
          : `These instructions overlap the set “${conflict.title}” for this step. Choose a different manufacturer or edit the overlapping set.`,
        409,
      );
  }

  private toPlatformItem(
    instruction: {
      id: string;
      step: string;
      title: string;
      manufacturers: string[];
      steps: string[];
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    video: { id: string; mimeType: string; status: string; createdAt: Date } | undefined,
  ) {
    return {
      id: instruction.id,
      step: instruction.step,
      title: instruction.title,
      manufacturers: instruction.manufacturers,
      steps: instruction.steps,
      notes: instruction.notes,
      generic: instruction.manufacturers.length === 0,
      video:
        video === undefined
          ? null
          : {
              mediaId: video.id,
              mimeType: video.mimeType,
              status: video.status,
              createdAt: video.createdAt,
            },
      createdAt: instruction.createdAt,
      updatedAt: instruction.updatedAt,
    };
  }
}
