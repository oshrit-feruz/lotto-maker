import { describe, it, expect, vi, beforeEach } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./helpers/fake-money.js').createFakeMoney> }));

vi.mock('../../src/prisma.js', async () => {
  const { createFakeMoney } = await import('./helpers/fake-money.js');
  fake.db = createFakeMoney();
  // The user is permanently self-excluded. Withdrawals must not look at it.
  const excluded = {
    selfExcludedPermanent: true,
    selfExcludedUntil: null,
    pending: {},
    depositDaily: null,
    depositWeekly: null,
    depositMonthly: null,
    lossMonthly: null,
  };
  (fake.db.client as any).userLimits = { findUnique: vi.fn(async () => excluded) };
  return { prisma: fake.db.client };
});

import { createWithdrawal } from '../../src/modules/wallet/withdrawals.service.js';
import { assertDepositAllowed } from '../../src/modules/limits/limits.service.js';

beforeEach(() => {
  fake.db.reset();
  fake.db.addUser('user-1', { walletBalance: 500, verifiedAdult: true, fullName: 'ישראל ישראלי' });
  fake.db.addCard('user-1');
});

describe('self-exclusion does not block withdrawals', () => {
  it('a self-excluded user can still withdraw to a card, but not deposit', async () => {
    await expect(assertDepositAllowed('user-1', 10)).rejects.toMatchObject({ code: 'SELF_EXCLUDED' });
    await expect(createWithdrawal('user-1', { amount: 100, method: 'card' })).resolves.toBeDefined();
    expect(fake.db.balanceOf('user-1')).toBeLessThan(500);
  });
});
