import type { PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';

export class EntitlementService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organisationId: string, now = new Date()) {
    const modules = await this.prisma.moduleDefinition.findMany({
      where: { active: true },
      include: { entitlements: { where: { organisationId }, take: 1 } },
      orderBy: { displayOrder: 'asc' },
    });
    return modules.map((module) => {
      const record = module.entitlements[0];
      const expiresAt =
        record?.status === 'TRIAL' ? record.trialEndsAt : record?.currentPeriodEndsAt;
      const expired =
        record !== undefined &&
        (record.status === 'TRIAL' || record.status === 'ACTIVE') &&
        expiresAt !== null &&
        expiresAt !== undefined &&
        expiresAt <= now;
      const status =
        record === undefined
          ? ('CANCELLED' as const)
          : expired
            ? ('EXPIRED' as const)
            : record.status;
      const daysRemaining =
        (status === 'TRIAL' || status === 'ACTIVE') && expiresAt !== null && expiresAt !== undefined
          ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000))
          : 0;
      return {
        module: {
          key: module.key,
          name: module.name,
          description: module.description,
          capabilities: module.capabilities,
        },
        status,
        trialEndsAt: record?.trialEndsAt ?? null,
        currentPeriodEndsAt: record?.currentPeriodEndsAt ?? null,
        expiresAt: expiresAt ?? null,
        daysRemaining,
        entitled: status === 'ACTIVE' || status === 'TRIAL',
      };
    });
  }

  async can(organisationId: string, capability: string): Promise<boolean> {
    const entitlements = await this.list(organisationId);
    return entitlements.some(
      (item) => item.entitled && (item.module.capabilities as string[]).includes(capability),
    );
  }

  async require(organisationId: string, capability: string): Promise<void> {
    if (!(await this.can(organisationId, capability))) {
      throw new DomainError('MODULE_ENTITLEMENT_REQUIRED', 'This module is not active.', 403);
    }
  }

  async requireModule(organisationId: string, moduleKey: string): Promise<void> {
    const entitlements = await this.list(organisationId);
    if (!entitlements.some((item) => item.module.key === moduleKey && item.entitled)) {
      throw new DomainError(
        'MODULE_ENTITLEMENT_REQUIRED',
        `The ${moduleKey === 'thermal-imaging' ? 'Thermal Imaging' : moduleKey === 'ev-charging' ? 'EV Charging' : moduleKey} module is not active for this organisation.`,
        403,
      );
    }
  }
}
