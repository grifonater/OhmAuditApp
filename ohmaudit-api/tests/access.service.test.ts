import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { AccessService } from '../src/identity/access.service';

describe('organisation access administration', () => {
  it('prevents an administrator granting a permission they do not hold', async () => {
    const createRole = vi.fn();
    const prisma = { role: { create: createRole } } as unknown as PrismaClient;
    const service = new AccessService(prisma);

    await expect(
      service.createRole(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        {
          userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          roleKey: 'custom-user-manager',
          capabilities: ['organisation.users.manage'],
        },
        { name: 'Billing manager', capabilityKeys: ['billing.manage'] },
        'correlation-id',
      ),
    ).rejects.toMatchObject({ code: 'CAPABILITY_ESCALATION', status: 403 });
    expect(createRole).not.toHaveBeenCalled();
  });

  it('prevents built-in roles being changed', async () => {
    const prisma = {
      role: {
        findFirst: vi.fn().mockResolvedValue({ id: 'role-id', isSystem: true }),
      },
    } as unknown as PrismaClient;
    const service = new AccessService(prisma);

    await expect(
      service.updateRole(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'role-id',
        {
          userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          roleKey: 'organisation-owner',
          capabilities: ['customers.read'],
        },
        { name: 'Changed role', capabilityKeys: ['customers.read'] },
        'correlation-id',
      ),
    ).rejects.toMatchObject({ code: 'SYSTEM_ROLE_IMMUTABLE', status: 409 });
  });

  it('prevents invitation into a role with greater access than the inviter', async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue({
          capabilities: [{ capability: { key: 'organisation.manage' } }],
        }),
      },
    } as unknown as PrismaClient;
    const service = new AccessService(prisma);

    await expect(
      service.assertRoleKeyAssignable(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'organisation-administrator',
        {
          userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          roleKey: 'custom-user-manager',
          capabilities: ['organisation.users.manage'],
        },
      ),
    ).rejects.toMatchObject({ code: 'CAPABILITY_ESCALATION', status: 403 });
  });
});
