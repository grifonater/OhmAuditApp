import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { OnboardingService } from '../src/onboarding/onboarding.service';

describe('Invitation membership permissions', () => {
  it('does not reactivate a suspended membership through invitation acceptance', async () => {
    let transactionCalled = false;
    const prisma = {
      organisationInvitation: {
        findUnique: () =>
          Promise.resolve({
            id: 'invitation-a',
            organisationId: 'organisation-a',
            roleId: 'role-a',
            email: 'user@example.test',
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 60_000),
            organisation: { id: 'organisation-a' },
          }),
      },
      organisationMembership: {
        findUnique: () => Promise.resolve({ status: 'INACTIVE' }),
      },
      $transaction: () => {
        transactionCalled = true;
        return Promise.resolve();
      },
    } as unknown as PrismaClient;

    await expect(
      new OnboardingService(prisma).acceptInvitation(
        'a'.repeat(32),
        { id: 'user-a', email: 'user@example.test' },
        'correlation-a',
      ),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_INACTIVE', status: 403 });
    expect(transactionCalled).toBe(false);
  });
});
