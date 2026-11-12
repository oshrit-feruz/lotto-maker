import { describe, it, expect, vi, beforeEach } from 'vitest';

const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./helpers/fake-money.js').createFakeMoney> }));

vi.mock('../../src/prisma.js', async () => {
  const { createFakeMoney } = await import('./helpers/fake-money.js');
  fake.db = createFakeMoney();
  return { prisma: fake.db.client };
});

import {
  approveWithdrawal,
  cancelWithdrawal,
  createWithdrawal,
  getBankDetails,
  markWithdrawalPaid,
  namesMatch,
  rejectWithdrawal,
  retryStuckCardPayouts,
  withdrawalAmounts,
} from '../../src/modules/wallet/withdrawals.service.js';
import { getPaymentProvider } from '../../src/modules/payments/payments.service.js';
import type { MockPaymentProvider } from '../../src/modules/payments/mock-payment-provider.js';
import { config } from '../../src/config.js';

const USER = 'user-1';
const ADMIN = 'admin-1';
const provider = getPaymentProvider() as MockPaymentProvider;
const bank = { holderName: 'ישראל ישראלי', bankCode: '12', branchCode: '345', accountNumber: '12345678' };

const hold = () => fake.db.walletTransaction.filter((t) => t.type === 'withdrawal_hold');
const release = () => fake.db.walletTransaction.filter((t) => t.type === 'withdrawal_release');

beforeEach(() => {
  fake.db.reset();
  provider.credits.length = 0;
  provider.creditFailure = 'none';
  fake.db.addUser(USER, { walletBalance: 2000, verifiedAdult: true, fullName: 'ישראל ישראלי' });
  fake.db.addCard(USER);
});

describe('withdrawal amounts and fee', () => {
  it('card is free, bank costs the configured fee out of the amount', () => {
    expect(withdrawalAmounts(100, 'card')).toMatchObject({ fee: expect.anything() });
    expect(withdrawalAmounts(100, 'card').fee.toNumber()).toBe(0);
    expect(withdrawalAmounts(100, 'card').payout.toNumber()).toBe(100);
    expect(withdrawalAmounts(100, 'bank').fee.toNumber()).toBe(config.BANK_WITHDRAWAL_FEE);
    expect(withdrawalAmounts(100, 'bank').payout.toNumber()).toBe(100 - config.BANK_WITHDRAWAL_FEE);
  });

  it('rejects zero, negative and sub-agora amounts', async () => {
    for (const amount of [0, -5, 10.005]) {
      await expect(createWithdrawal(USER, { amount, method: 'card' })).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    }
    expect(fake.db.balanceOf(USER)).toBe(2000);
  });

  it('rejects an amount under the minimum', async () => {
    await expect(createWithdrawal(USER, { amount: 9.99, method: 'card' })).rejects.toMatchObject({
      statusCode: 422,
      code: 'AMOUNT_BELOW_MINIMUM',
    });
    await expect(createWithdrawal(USER, { amount: config.MIN_WITHDRAWAL_AMOUNT, method: 'card' })).resolves.toBeTruthy();
  });

  it('rejects a bank withdrawal that the fee would eat entirely', async () => {
    await expect(
      createWithdrawal(USER, { amount: config.BANK_WITHDRAWAL_FEE, method: 'bank', bank }),
    ).rejects.toMatchObject({ code: 'AMOUNT_BELOW_MINIMUM' });
  });

  it('rejects more than the balance and holds nothing', async () => {
    await expect(createWithdrawal(USER, { amount: 2000.01, method: 'card' })).rejects.toMatchObject({
      statusCode: 402,
      code: 'INSUFFICIENT_BALANCE',
    });
    expect(fake.db.balanceOf(USER)).toBe(2000);
    expect(hold()).toHaveLength(0);
  });

  it('refuses a card withdrawal without a saved card', async () => {
    fake.db.savedCard.length = 0;
    await expect(createWithdrawal(USER, { amount: 100, method: 'card' })).rejects.toMatchObject({ code: 'NO_SAVED_CARD' });
  });

  it('refuses a suspended user with 403', async () => {
    fake.db.users.get(USER).status = 'suspended';
    await expect(createWithdrawal(USER, { amount: 100, method: 'card' })).rejects.toMatchObject({
      statusCode: 403,
      code: 'ACCOUNT_SUSPENDED',
    });
  });
});

describe('bank eligibility and name match', () => {
  it('matches names regardless of order, case, punctuation and niqqud', () => {
    expect(namesMatch('ישראל ישראלי', 'ישראלי ישראל')).toBe(true);
    expect(namesMatch('Dana  Levi', 'dana levi')).toBe(true);
    expect(namesMatch('ישראל ישראלי', 'ישראל כהן')).toBe(false);
    expect(namesMatch('', '')).toBe(false);
  });

  it('rejects a different account holder with 422 ACCOUNT_NAME_MISMATCH', async () => {
    await expect(
      createWithdrawal(USER, { amount: 100, method: 'bank', bank: { ...bank, holderName: 'דני כהן' } }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ACCOUNT_NAME_MISMATCH' });
    expect(fake.db.balanceOf(USER)).toBe(2000);
    expect(fake.db.withdrawal).toHaveLength(0);
  });

  it('rejects a user with no full name with ACCOUNT_NAME_MISMATCH', async () => {
    fake.db.users.get(USER).fullName = null;
    await expect(createWithdrawal(USER, { amount: 100, method: 'bank', bank })).rejects.toMatchObject({
      code: 'ACCOUNT_NAME_MISMATCH',
    });
  });

  it('requires a verified adult', async () => {
    fake.db.users.get(USER).verifiedAdult = false;
    await expect(createWithdrawal(USER, { amount: 100, method: 'bank', bank })).rejects.toMatchObject({
      statusCode: 403,
      code: 'KYC_REQUIRED',
    });
  });

  it('stores bank details encrypted, keeps only the last 4 digits in the clear, and waits for an admin', async () => {
    const w = await createWithdrawal(USER, { amount: 100, method: 'bank', bank });
    const row = fake.db.withdrawal[0];
    expect(w).toMatchObject({ status: 'requested', fee: '25.00', payout: '75.00', bankAccountLast4: '5678' });
    expect(row.bankDetailsEnc).not.toContain('12345678');
    expect(JSON.stringify(w)).not.toContain('bankDetailsEnc');
    expect(provider.credits).toHaveLength(0);
    // the admin can read them back, and that read is audited
    const details = await getBankDetails(row.id, ADMIN);
    expect(details.bank).toEqual(bank);
    expect(fake.db.auditActions()).toContain('withdrawal:bank_details_viewed');
  });
});

describe('hold, reject and release', () => {
  it('holds the money at request time with a withdrawal_hold transaction', async () => {
    await createWithdrawal(USER, { amount: 800, method: 'card' });
    expect(fake.db.balanceOf(USER)).toBe(1200);
    expect(hold()).toHaveLength(1);
    expect(hold()[0]).toMatchObject({ userId: USER, amount: '800.00', description: 'בקשת משיכה' });
  });

  it('reject releases the hold with a withdrawal_release transaction', async () => {
    const w = await createWithdrawal(USER, { amount: 800, method: 'card' });
    const rejected = await rejectWithdrawal(w.id, ADMIN, 'suspicious');
    expect(rejected).toMatchObject({ status: 'rejected', failureReason: 'suspicious' });
    expect(fake.db.balanceOf(USER)).toBe(2000);
    expect(release()).toHaveLength(1);
    expect(release()[0]).toMatchObject({ amount: '800.00', description: 'ביטול משיכה' });
    expect(fake.db.auditActions()).toContain('withdrawal:requested->rejected');
  });

  it('rejecting twice releases once', async () => {
    const w = await createWithdrawal(USER, { amount: 800, method: 'card' });
    await rejectWithdrawal(w.id, ADMIN, 'no');
    await rejectWithdrawal(w.id, ADMIN, 'no');
    expect(release()).toHaveLength(1);
    expect(fake.db.balanceOf(USER)).toBe(2000);
  });

  it('cannot reject a paid withdrawal', async () => {
    const w = await createWithdrawal(USER, { amount: 100, method: 'card' });
    expect(fake.db.withdrawal[0].status).toBe('paid');
    await expect(rejectWithdrawal(w.id, ADMIN, 'late')).rejects.toMatchObject({ statusCode: 409 });
    expect(release()).toHaveLength(0);
  });

  it('a bank withdrawal approved but not yet paid can still be rejected', async () => {
    const w = await createWithdrawal(USER, { amount: 300, method: 'bank', bank });
    await approveWithdrawal(w.id, { id: ADMIN, type: 'admin' });
    await rejectWithdrawal(w.id, ADMIN, 'transfer bounced');
    expect(fake.db.balanceOf(USER)).toBe(2000);
    expect(fake.db.withdrawal[0].status).toBe('rejected');
  });
});

describe('approval', () => {
  it('auto-approves and pays a card withdrawal at or under the limit', async () => {
    const w = await createWithdrawal(USER, { amount: config.AUTO_APPROVE_WITHDRAWAL_LIMIT, method: 'card' });
    expect(w.status).toBe('paid');
    expect(provider.credits).toEqual([
      { cardToken: `tok_${USER}`, amount: config.AUTO_APPROVE_WITHDRAWAL_LIMIT, idempotencyKey: `withdrawal:${w.id}` },
    ]);
    expect(fake.db.withdrawal[0]).toMatchObject({ adminId: null });
    expect(fake.db.withdrawal[0].providerTxId).toMatch(/^mock_credit_/);
    expect(fake.db.balanceOf(USER)).toBe(2000 - config.AUTO_APPROVE_WITHDRAWAL_LIMIT);
  });

  it('leaves a card withdrawal over the limit for an admin, who then pays it', async () => {
    const amount = config.AUTO_APPROVE_WITHDRAWAL_LIMIT + 0.01;
    const w = await createWithdrawal(USER, { amount, method: 'card' });
    expect(w.status).toBe('requested');
    expect(provider.credits).toHaveLength(0);

    const approved = await approveWithdrawal(w.id, { id: ADMIN, type: 'admin' });
    expect(approved).toMatchObject({ status: 'paid', adminId: ADMIN });
    expect(provider.credits).toHaveLength(1);
    expect(provider.credits[0]!.amount).toBe(amount);
    expect(fake.db.auditActions()).toEqual(expect.arrayContaining(['withdrawal:requested->approved', 'withdrawal:approved->paid']));
  });

  it('approving twice pays once', async () => {
    const w = await createWithdrawal(USER, { amount: 900, method: 'card' });
    await approveWithdrawal(w.id, { id: ADMIN, type: 'admin' });
    const again = await approveWithdrawal(w.id, { id: ADMIN, type: 'admin' });
    expect(again.status).toBe('paid');
    expect(provider.credits).toHaveLength(1);
  });

  it('two concurrent approvals pay once', async () => {
    const w = await createWithdrawal(USER, { amount: 900, method: 'card' });
    await Promise.all([
      approveWithdrawal(w.id, { id: ADMIN, type: 'admin' }),
      approveWithdrawal(w.id, { id: 'admin-2', type: 'admin' }),
    ]);
    expect(provider.credits).toHaveLength(1);
  });

  it('bank approval does not pay; the admin marks it paid with a reference, once', async () => {
    const w = await createWithdrawal(USER, { amount: 300, method: 'bank', bank });
    const approved = await approveWithdrawal(w.id, { id: ADMIN, type: 'admin' });
    expect(approved.status).toBe('approved');
    expect(provider.credits).toHaveLength(0);

    const paid = await markWithdrawalPaid(w.id, ADMIN, 'REF-77');
    expect(paid).toMatchObject({ status: 'paid', bankReference: 'REF-77' });
    await markWithdrawalPaid(w.id, ADMIN, 'REF-OTHER');
    expect(fake.db.withdrawal[0].bankReference).toBe('REF-77');
    expect(fake.db.balanceOf(USER)).toBe(1700);
    expect(release()).toHaveLength(0);
  });

  it('cannot mark a bank withdrawal paid before approval, nor a card one at all', async () => {
    const b = await createWithdrawal(USER, { amount: 300, method: 'bank', bank });
    await expect(markWithdrawalPaid(b.id, ADMIN, 'REF')).rejects.toMatchObject({ code: 'WITHDRAWAL_NOT_PAYABLE' });
    const c = await createWithdrawal(USER, { amount: 100, method: 'card' });
    await expect(markWithdrawalPaid(c.id, ADMIN, 'REF')).rejects.toMatchObject({ code: 'WITHDRAWAL_NOT_BANK' });
  });
});

describe('failed payout', () => {
  it('a declined card payout fails the withdrawal and releases the hold', async () => {
    provider.creditFailure = 'decline';
    const w = await createWithdrawal(USER, { amount: 100, method: 'card' });
    expect(w).toMatchObject({ status: 'failed', failureReason: 'PROVIDER_DECLINED' });
    expect(fake.db.balanceOf(USER)).toBe(2000);
    expect(hold()).toHaveLength(1);
    expect(release()).toHaveLength(1);
  });

  it('a payout that throws keeps the money held and is retried, then paid once', async () => {
    provider.creditFailure = 'throw';
    const w = await createWithdrawal(USER, { amount: 100, method: 'card' });
    expect(w.status).toBe('approved');
    expect(fake.db.balanceOf(USER)).toBe(1900);
    expect(release()).toHaveLength(0);

    provider.creditFailure = 'none';
    // too young to be picked up yet
    expect(await retryStuckCardPayouts(new Date())).toBe(0);
    expect(await retryStuckCardPayouts(new Date(Date.now() + 10 * 60 * 1000))).toBe(1);
    expect(fake.db.withdrawal[0].status).toBe('paid');
    expect(await retryStuckCardPayouts(new Date(Date.now() + 20 * 60 * 1000))).toBe(0);
    expect(new Set(provider.credits.map((c) => c.idempotencyKey)).size).toBe(1);
  });

  it('fails and releases when the card is no longer available', async () => {
    const w = await createWithdrawal(USER, { amount: 900, method: 'card' });
    fake.db.withdrawal[0].savedCardId = null;
    const result = await approveWithdrawal(w.id, { id: ADMIN, type: 'admin' });
    expect(result).toMatchObject({ status: 'failed', failureReason: 'CARD_NOT_AVAILABLE' });
    expect(fake.db.balanceOf(USER)).toBe(2000);
  });
});

describe('cancel', () => {
  it('the user cancels a requested withdrawal and gets the hold back', async () => {
    const w = await createWithdrawal(USER, { amount: 900, method: 'card' });
    const cancelled = await cancelWithdrawal(USER, w.id);
    expect(cancelled.status).toBe('cancelled');
    expect(fake.db.balanceOf(USER)).toBe(2000);
    expect(release()).toHaveLength(1);
  });

  it('cancelling twice releases once', async () => {
    const w = await createWithdrawal(USER, { amount: 900, method: 'card' });
    await cancelWithdrawal(USER, w.id);
    await cancelWithdrawal(USER, w.id);
    expect(release()).toHaveLength(1);
    expect(fake.db.balanceOf(USER)).toBe(2000);
  });

  it('cannot cancel once approved or paid', async () => {
    const w = await createWithdrawal(USER, { amount: 100, method: 'card' });
    await expect(cancelWithdrawal(USER, w.id)).rejects.toMatchObject({ statusCode: 409, code: 'WITHDRAWAL_NOT_CANCELLABLE' });
    expect(fake.db.balanceOf(USER)).toBe(1900);
  });

  it("cannot cancel someone else's withdrawal", async () => {
    const w = await createWithdrawal(USER, { amount: 900, method: 'card' });
    await expect(cancelWithdrawal('intruder', w.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(fake.db.withdrawal[0].status).toBe('requested');
  });

  it('a cancelled withdrawal cannot be approved afterwards', async () => {
    const w = await createWithdrawal(USER, { amount: 900, method: 'card' });
    await cancelWithdrawal(USER, w.id);
    await expect(approveWithdrawal(w.id, { id: ADMIN, type: 'admin' })).rejects.toMatchObject({ statusCode: 409 });
    expect(provider.credits).toHaveLength(0);
  });
});
