import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

export interface CreateScheduleInput {
  customerId?: string | undefined;
  siteId: string;
  assetId?: string | undefined;
  title: string;
  moduleKey: string;
  frequencyMonths: number;
  startDate: Date;
  notificationLeadDays: number;
}

export function materialiseDates(
  startDate: Date,
  frequencyMonths: number,
  horizonYears = 5,
): Date[] {
  const dates: Date[] = [];
  const horizon = new Date(startDate);
  horizon.setUTCFullYear(horizon.getUTCFullYear() + horizonYears);
  const anchorDay = startDate.getUTCDate();
  for (let index = 0; ; index += 1) {
    const firstOfMonth = new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + index * frequencyMonths, 1),
    );
    const lastDay = new Date(
      Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const cursor = new Date(firstOfMonth);
    cursor.setUTCDate(Math.min(anchorDay, lastDay));
    if (cursor > horizon) break;
    dates.push(new Date(cursor));
  }
  return dates;
}

export function recurringDateAfter(anchorDate: Date, frequencyMonths: number): Date {
  const firstOfMonth = new Date(
    Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() + frequencyMonths, 1),
  );
  const lastDay = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  firstOfMonth.setUTCDate(Math.min(anchorDate.getUTCDate(), lastDay));
  return firstOfMonth;
}

export class ScheduleService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    organisationId: string,
    actorUserId: string,
    correlationId: string,
    input: CreateScheduleInput,
  ) {
    const site = await this.prisma.site.findFirst({ where: { id: input.siteId, organisationId } });
    if (site === null) throw new DomainError('SITE_NOT_FOUND', 'The site was not found.', 404);
    if (
      input.assetId !== undefined &&
      (await this.prisma.asset.findFirst({
        where: { id: input.assetId, siteId: input.siteId, organisationId },
      })) === null
    )
      throw new DomainError(
        'ASSET_NOT_FOUND',
        'The selected asset was not found at this site.',
        404,
      );
    return this.prisma.$transaction(async (transaction) => {
      const rule = await transaction.scheduleRule.create({
        data: {
          organisationId,
          customerId: input.customerId ?? site.customerId,
          siteId: input.siteId,
          ...(input.assetId === undefined ? {} : { assetId: input.assetId }),
          title: input.title,
          moduleKey: input.moduleKey,
          frequencyMonths: input.frequencyMonths,
          startDate: input.startDate,
          notificationLeadDays: input.notificationLeadDays,
        },
      });
      await transaction.scheduleOccurrence.createMany({
        data: materialiseDates(input.startDate, input.frequencyMonths).map((dueDate) => ({
          organisationId,
          scheduleRuleId: rule.id,
          dueDate,
          windowStartsAt: new Date(dueDate.getTime() - input.notificationLeadDays * 86400000),
          windowEndsAt: new Date(dueDate.getTime() + 30 * 86400000),
        })),
      });
      await transaction.auditEvent.create({
        data: {
          organisationId,
          actorUserId,
          correlationId,
          eventType: 'ScheduleRuleCreated',
          entityType: 'ScheduleRule',
          entityId: rule.id,
          data: { title: rule.title, frequencyMonths: rule.frequencyMonths, siteId: rule.siteId },
        },
      });
      return rule;
    });
  }

  listRules(organisationId: string) {
    return this.prisma.scheduleRule.findMany({
      where: { organisationId, active: true },
      include: {
        site: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        asset: { select: { id: true, displayName: true } },
        _count: { select: { occurrences: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async suggestions(organisationId: string, siteId: string) {
    const [site, inspections, rules] = await Promise.all([
      this.prisma.site.findFirst({ where: { id: siteId, organisationId }, select: { id: true } }),
      this.prisma.inspection.findMany({
        where: { organisationId, siteId, status: 'APPROVED', effectiveDate: { not: null } },
        select: {
          id: true,
          assetId: true,
          moduleKey: true,
          inspectionType: true,
          effectiveDate: true,
          asset: { select: { id: true, displayName: true } },
        },
        orderBy: { effectiveDate: 'desc' },
      }),
      this.prisma.scheduleRule.findMany({
        where: { organisationId, siteId, active: true },
        select: { moduleKey: true, assetId: true },
      }),
    ]);
    if (site === null) throw new DomainError('SITE_NOT_FOUND', 'The site was not found.', 404);

    const latest = new Map<string, (typeof inspections)[number]>();
    for (const inspection of inspections) {
      const key = `${inspection.moduleKey}:${inspection.assetId ?? 'site'}`;
      if (!latest.has(key)) latest.set(key, inspection);
    }
    return [...latest.values()].flatMap((inspection) => {
      const covered = rules.some(
        (rule) =>
          rule.moduleKey === inspection.moduleKey &&
          (rule.assetId === null || rule.assetId === inspection.assetId),
      );
      if (covered || inspection.effectiveDate === null) return [];
      return [
        {
          inspectionId: inspection.id,
          asset: inspection.asset,
          moduleKey: inspection.moduleKey,
          title: inspection.inspectionType,
          lastInspectionDate: inspection.effectiveDate,
          suggestedStartDate: recurringDateAfter(inspection.effectiveDate, 12),
          suggestedFrequencyMonths: 12,
        },
      ];
    });
  }

  async completeAndRebaseForInspection(
    transaction: Prisma.TransactionClient,
    inspection: {
      id: string;
      organisationId: string;
      siteId: string;
      assetId: string | null;
      moduleKey: string;
      visitId: string | null;
      effectiveDate: Date | null;
    },
    completedAt: Date,
  ): Promise<number> {
    if (inspection.effectiveDate === null) return 0;
    const rules = await transaction.scheduleRule.findMany({
      where: {
        organisationId: inspection.organisationId,
        siteId: inspection.siteId,
        moduleKey: inspection.moduleKey,
        active: true,
        OR: [
          { assetId: null },
          ...(inspection.assetId === null ? [] : [{ assetId: inspection.assetId }]),
        ],
      },
      include: {
        occurrences: {
          where: { status: { in: ['FUTURE', 'UPCOMING', 'DUE', 'OVERDUE'] } },
          orderBy: { dueDate: 'asc' },
        },
      },
    });
    for (const rule of rules) {
      const alreadyCompleted = await transaction.scheduleOccurrence.findFirst({
        where: { scheduleRuleId: rule.id, inspectionId: inspection.id, status: 'COMPLETED' },
        select: { id: true },
      });
      if (alreadyCompleted !== null) continue;

      const performedAt = inspection.effectiveDate;
      const matched = rule.occurrences.reduce<(typeof rule.occurrences)[number] | undefined>(
        (closest, occurrence) =>
          closest === undefined ||
          Math.abs(occurrence.dueDate.getTime() - performedAt.getTime()) <
            Math.abs(closest.dueDate.getTime() - performedAt.getTime())
            ? occurrence
            : closest,
        undefined,
      );
      if (matched !== undefined)
        await transaction.scheduleOccurrence.update({
          where: { id: matched.id },
          data: {
            status: 'COMPLETED',
            completedAt,
            inspectionId: inspection.id,
            visitId: inspection.visitId,
          },
        });

      const staleIds = rule.occurrences
        .filter((occurrence) => occurrence.id !== matched?.id)
        .map(({ id }) => id);
      if (staleIds.length > 0) {
        await transaction.notificationEvent.updateMany({
          where: {
            scheduleOccurrenceId: { in: staleIds },
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          data: { status: 'CANCELLED' },
        });
        await transaction.notificationEvent.updateMany({
          where: { scheduleOccurrenceId: { in: staleIds } },
          data: { scheduleOccurrenceId: null },
        });
        await transaction.scheduleOccurrence.deleteMany({ where: { id: { in: staleIds } } });
      }

      const nextDueDate = recurringDateAfter(performedAt, rule.frequencyMonths);
      await transaction.scheduleRule.update({
        where: { id: rule.id },
        data: { startDate: nextDueDate },
      });
      await transaction.scheduleOccurrence.createMany({
        data: materialiseDates(nextDueDate, rule.frequencyMonths).map((dueDate) => ({
          organisationId: inspection.organisationId,
          scheduleRuleId: rule.id,
          dueDate,
          windowStartsAt: new Date(dueDate.getTime() - rule.notificationLeadDays * 86400000),
          windowEndsAt: new Date(dueDate.getTime() + 30 * 86400000),
        })),
        skipDuplicates: true,
      });
    }
    return rules.length;
  }

  calendar(organisationId: string, from: Date, to: Date) {
    return this.prisma.scheduleOccurrence.findMany({
      where: {
        organisationId,
        dueDate: { gte: from, lte: to },
        status: { not: 'SUPERSEDED' },
        scheduleRule: { active: true },
      },
      include: {
        scheduleRule: {
          include: {
            site: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true } },
            asset: { select: { id: true, displayName: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async preferences(organisationId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { organisationId },
      create: { organisationId },
      update: {},
    });
  }

  updatePreferences(
    organisationId: string,
    input: {
      inAppEnabled: boolean;
      emailEnabled: boolean;
      defaultLeadDays: number;
      overdueReminders: boolean;
      inspectionSubmitted: boolean;
    },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { organisationId },
      create: { organisationId, ...input },
      update: input,
    });
  }

  notifications(organisationId: string) {
    return this.prisma.notificationEvent.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async tick(now = new Date()) {
    const occurrences = await this.prisma.scheduleOccurrence.findMany({
      where: {
        status: { in: ['FUTURE', 'UPCOMING', 'DUE', 'OVERDUE'] },
        scheduleRule: { active: true },
      },
      include: { scheduleRule: { include: { site: true, customer: true } } },
      take: 5000,
    });
    let notificationsCreated = 0;
    for (const occurrence of occurrences) {
      const dueAt = occurrence.dueDate.getTime();
      const leadAt = dueAt - occurrence.scheduleRule.notificationLeadDays * 86400000;
      const nextStatus =
        now.getTime() > dueAt + 86400000
          ? 'OVERDUE'
          : now.getTime() >= dueAt
            ? 'DUE'
            : now.getTime() >= leadAt
              ? 'UPCOMING'
              : 'FUTURE';
      if (occurrence.status !== nextStatus)
        await this.prisma.scheduleOccurrence.update({
          where: { id: occurrence.id },
          data: { status: nextStatus },
        });
      if (now.getTime() >= leadAt) {
        const result = await this.prisma.notificationEvent.createMany({
          data: [
            {
              organisationId: occurrence.organisationId,
              scheduleOccurrenceId: occurrence.id,
              eventType: nextStatus === 'OVERDUE' ? 'ScheduleOverdue' : 'ScheduleReminder',
              channel: 'IN_APP',
              dedupeKey: `${occurrence.id}:${nextStatus}`,
              payload: {
                title: occurrence.scheduleRule.title,
                customerName: occurrence.scheduleRule.customer?.name,
                siteName: occurrence.scheduleRule.site.name,
                dueDate: occurrence.dueDate.toISOString(),
                status: nextStatus,
              },
            },
          ],
          skipDuplicates: true,
        });
        notificationsCreated += result.count;
      }
    }
    return { processed: occurrences.length, notificationsCreated };
  }
}
