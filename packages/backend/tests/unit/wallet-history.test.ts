import { describe, it, expect, vi } from 'vitest';

const rows = vi.hoisted(() => [
  { id: '1', userId: 'u', type: 'withdrawal_hold', amount: '100.00', description: 'whatever', createdAt: new Date() },
  { id: '2', userId: 'u', type: 'withdrawal_release', amount: '100.00', description: 'whatever', createdAt: new Date() },
  { id: '3', userId: 'u', type: 'winning', amount: '50.00', description: 'x', createdAt: new Date() },
  { id: '4', userId: 'u', type: 'refund_reversal', amount: '20.00', description: 'ביטול הפקדה (זיכוי מהספק)', createdAt: new Date() },
  { id: '5', userId: 'u', type: 'deposit', amount: '20.00', description: 'הפקדה לארנק', createdAt: new Date() },
]);

vi.mock('../../src/prisma.js', () => ({
  prisma: {
    walletTransaction: {
      findMany: async () => rows,
      count: async () => rows.length,
    },
  },
}));

import { describeTransaction, getTransactions } from '../../src/modules/wallet/wallet.service.js';

describe('wallet history descriptions', () => {
  it('uses the fixed Hebrew text for the new types', () => {
    expect(describeTransaction('withdrawal_hold', 'anything')).toBe('בקשת משיכה');
    expect(describeTransaction('withdrawal_release', 'anything')).toBe('ביטול משיכה');
    expect(describeTransaction('winning', 'anything')).toBe('זכייה');
    expect(describeTransaction('refund_reversal', 'anything')).toBe('ביטול הפקדה');
  });

  it('keeps the stored text for other types', () => {
    expect(describeTransaction('deposit', 'הפקדה לארנק')).toBe('הפקדה לארנק');
  });

  it('GET /wallet/transactions returns them with the descriptions', async () => {
    const result = await getTransactions('u', 1, 20);
    expect(result.total).toBe(5);
    expect(result.data.map((t) => [t.type, t.description])).toEqual([
      ['withdrawal_hold', 'בקשת משיכה'],
      ['withdrawal_release', 'ביטול משיכה'],
      ['winning', 'זכייה'],
      ['refund_reversal', 'ביטול הפקדה'],
      ['deposit', 'הפקדה לארנק'],
    ]);
  });
});
