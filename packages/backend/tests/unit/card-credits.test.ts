import { describe, it, expect, vi, beforeEach } from 'vitest';

const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./helpers/fake-money.js').createFakeMoney> }));

vi.mock('../../src/prisma.js', async () => {
  const { createFakeMoney } = await import('./helpers/fake-money.js');
  fake.db = createFakeMoney();
  return { prisma: fake.db.client };
});

import {
  backoffMs,
  listCardCredits,
  markCardCreditPaid,
  payCardCredit,
  runCardCreditJob,
} from '../../src/modules/wallet/card-credits.service.js';
import { getPaymentProvider } from '../../src/modules/payments/payments.service.js';
import type { MockPaymentProvider } from '../../src/modules/payments/mock-payment-provider.js';

const USER = 'user-1';
const ADMIN = 'admin-1';
const provider = getPaymentProvider() as MockPaymentProvider;
const MIN = 60 * 1000;

async function addCredit(amount = '150.00', orderId = 'order-1') {
  return fake.db.client.pendingCardCredit.create({ data: { orderId, userId: USER, amount } });
}

beforeEach(() => {
  fake.db.reset();
  provider.credits.length = 0;
  provider.creditFailure = 'none';
  fake.db.addUser(USER, { walletBalance: 0 });
});

describe('card credit payout', () => {
  it('pays a pending credit to the default (newest) card', async () => {
    fake.db.addCard(USER, 'tok_old', '1111');
    fake.db.addCard(USER, 'tok_new', '2222');
    const credit = await addCredit();

    await expect(payCardCredit(credit.id)).resolves.toBe('paid');

    expect(credit).toMatchObject({ status: 'paid', lastError: null });
    expect(credit.providerTxId).toMatch(/^mock_credit_/);
    expect(provider.credits).toHaveLength(1);
    expect(provider.credits[0]).toMatchObject({ cardToken: 'tok_new', amount: 150 });
    expect(fake.db.auditActions()).toContain('card_credit:pending->paid');
  });

  it('does not pay a credit twice', async () => {
    fake.db.addCard(USER);
    const credit = await addCredit();
    await payCardCredit(credit.id);
    await expect(payCardCredit(credit.id, new Date(Date.now() + 99 * MIN))).resolves.toBe('skipped');
    expect(provider.credits).toHaveLength(1);
  });

  it('skips a credit whose next attempt is not due yet', async () => {
    fake.db.addCard(USER);
    const credit = await addCredit();
    credit.nextAttemptAt = new Date(Date.now() + 60 * MIN);
    await expect(payCardCredit(credit.id)).resolves.toBe('skipped');
    expect(provider.credits).toHaveLength(0);
  });

  it('without a saved card it stays pending, backs off, and is paid once a card exists', async () => {
    const credit = await addCredit();
    const t0 = new Date();

    await expect(payCardCredit(credit.id, t0)).resolves.toBe('no_card');
    expect(credit).toMatchObject({ status: 'pending', attempts: 1, lastError: 'NO_SAVED_CARD' });
    expect(credit.nextAttemptAt.getTime()).toBe(t0.getTime() + backoffMs(1));

    // not retried before the backoff has passed
    await expect(payCardCredit(credit.id, new Date(t0.getTime() + MIN))).resolves.toBe('skipped');
    expect(credit.attempts).toBe(1);

    fake.db.addCard(USER);
    await expect(payCardCredit(credit.id, new Date(t0.getTime() + 6 * MIN))).resolves.toBe('paid');
    expect(credit.status).toBe('paid');
    expect(provider.credits).toHaveLength(1);
  });

  it('on a provider failure it stays pending and is retried with growing backoff', async () => {
    fake.db.addCard(USER);
    const credit = await addCredit();
    const t0 = new Date();

    provider.creditFailure = 'throw';
    await expect(payCardCredit(credit.id, t0)).resolves.toBe('failed');
    expect(credit).toMatchObject({ status: 'pending', attempts: 1, lastError: 'PROVIDER_ERROR' });

    provider.creditFailure = 'decline';
    const t1 = new Date(t0.getTime() + 6 * MIN);
    await expect(payCardCredit(credit.id, t1)).resolves.toBe('failed');
    expect(credit).toMatchObject({ status: 'pending', attempts: 2, lastError: 'PROVIDER_DECLINED' });
    expect(credit.nextAttemptAt.getTime()).toBe(t1.getTime() + backoffMs(2));
    expect(backoffMs(2)).toBe(2 * backoffMs(1));

    provider.creditFailure = 'none';
    await expect(payCardCredit(credit.id, new Date(t1.getTime() + 11 * MIN))).resolves.toBe('paid');
    expect(credit.status).toBe('paid');
  });

  it('caps the backoff', () => {
    expect(backoffMs(1)).toBe(5 * MIN);
    expect(backoffMs(50)).toBe(24 * 60 * MIN);
  });

  it('the job pays what is due and leaves the rest', async () => {
    fake.db.addCard(USER);
    const due = await addCredit('10.00', 'o1');
    const later = await addCredit('20.00', 'o2');
    later.nextAttemptAt = new Date(Date.now() + 60 * MIN);

    const tally = await runCardCreditJob();
    expect(tally.paid).toBe(1);
    expect(due.status).toBe('paid');
    expect(later.status).toBe('pending');
  });
});

describe('admin: list and mark-paid', () => {
  it('lists credits by status', async () => {
    const a = await addCredit('10.00', 'o1');
    await addCredit('20.00', 'o2');
    a.status = 'paid';
    expect(await listCardCredits('pending')).toHaveLength(1);
    expect(await listCardCredits('paid')).toHaveLength(1);
    expect(await listCardCredits()).toHaveLength(2);
  });

  it('marks a stuck credit paid by hand, once, and the job then leaves it alone', async () => {
    const credit = await addCredit();
    await expect(markCardCreditPaid(credit.id, ADMIN, 'bank-ref-9')).resolves.toMatchObject({ status: 'paid' });
    expect(credit).toMatchObject({ status: 'paid', paidByAdminId: ADMIN, manualReference: 'bank-ref-9' });
    expect(fake.db.auditActions()).toContain('card_credit:pending->paid_manual');

    // repeating is a no-op; the job never pays it
    await markCardCreditPaid(credit.id, 'admin-2', 'other');
    expect(credit.paidByAdminId).toBe(ADMIN);
    fake.db.addCard(USER);
    await runCardCreditJob();
    expect(provider.credits).toHaveLength(0);
  });

  it('404 for an unknown credit', async () => {
    await expect(markCardCreditPaid('nope', ADMIN, 'x')).rejects.toMatchObject({ statusCode: 404 });
  });
});
