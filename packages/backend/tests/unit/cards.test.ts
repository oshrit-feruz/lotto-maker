import { describe, it, expect, vi, beforeEach } from 'vitest';

const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./helpers/fake-prisma.js').createFakePrisma> }));

vi.mock('../../src/prisma.js', async () => {
  const { createFakePrisma } = await import('./helpers/fake-prisma.js');
  fake.db = createFakePrisma();
  return { prisma: fake.db.client };
});

import { createCheckout, getPaymentProvider, processWebhook } from '../../src/modules/payments/payments.service.js';
import { MockPaymentProvider, MOCK_SIGNATURE_HEADER } from '../../src/modules/payments/mock-payment-provider.js';
import { deactivateCard, getDefaultCard, listCards } from '../../src/modules/payments/cards.service.js';

const USER = 'user-1';
const provider = getPaymentProvider() as MockPaymentProvider;

async function pay(amount: number, card: { cardToken?: string; cardLast4?: string; cardBrand?: string }) {
  const { paymentId } = await createCheckout(USER, amount);
  const providerTxId = fake.db.payments.get(paymentId).providerTxId as string;
  const rawBody = Buffer.from(JSON.stringify({ providerTxId, status: 'approved', amount, ...card }));
  return processWebhook(rawBody, { [MOCK_SIGNATURE_HEADER]: provider.sign(rawBody) });
}

beforeEach(() => {
  fake.db.users.clear();
  fake.db.payments.clear();
  fake.db.savedCards.length = 0;
  fake.db.walletTxs.length = 0;
  fake.db.auditLogs.length = 0;
  provider.credits.length = 0;
  provider.creditFailure = 'none';
  fake.db.addUser(USER, 0);
});

describe('saved cards', () => {
  it('saves the card of an approved payment', async () => {
    await pay(100, { cardToken: 'tok_a', cardLast4: '4242', cardBrand: 'visa' });
    expect(fake.db.savedCards).toHaveLength(1);
    expect(fake.db.savedCards[0]).toMatchObject({ userId: USER, token: 'tok_a', last4: '4242', brand: 'visa', active: true });
  });

  it('does not save a card twice or without a token', async () => {
    await pay(10, { cardToken: 'tok_a', cardLast4: '4242' });
    await pay(10, { cardToken: 'tok_a', cardLast4: '4242' });
    await pay(10, { cardLast4: '4242' });
    expect(fake.db.savedCards).toHaveLength(1);
  });

  it('the newest active card is the default', async () => {
    await pay(10, { cardToken: 'tok_a', cardLast4: '1111' });
    await pay(10, { cardToken: 'tok_b', cardLast4: '2222' });
    expect((await getDefaultCard(USER))?.token).toBe('tok_b');
  });

  it('lists last4 and brand only, never the token', async () => {
    await pay(10, { cardToken: 'tok_a', cardLast4: '1111', cardBrand: 'visa' });
    const cards = await listCards(USER);
    expect(cards).toEqual([{ id: expect.any(String), last4: '1111', brand: 'visa', isDefault: true }]);
    expect(JSON.stringify(cards)).not.toContain('tok_a');
  });

  it('deactivating the default card makes the next one the default', async () => {
    await pay(10, { cardToken: 'tok_a', cardLast4: '1111' });
    await pay(10, { cardToken: 'tok_b', cardLast4: '2222' });
    const newest = await getDefaultCard(USER);
    await deactivateCard(USER, newest!.id);
    expect((await getDefaultCard(USER))?.token).toBe('tok_a');
    expect(await listCards(USER)).toHaveLength(1);
  });

  it("cannot deactivate another user's card", async () => {
    await pay(10, { cardToken: 'tok_a', cardLast4: '1111' });
    const card = await getDefaultCard(USER);
    await expect(deactivateCard('someone-else', card!.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(fake.db.savedCards[0].active).toBe(true);
  });
});

describe('mock provider: creditCard', () => {
  it('pays, and answers a repeated idempotency key with the same result', async () => {
    const a = await provider.creditCard('tok', 50, 'k1');
    const b = await provider.creditCard('tok', 50, 'k1');
    expect(a.status).toBe('paid');
    expect(b).toEqual(a);
  });

  it('declines or throws on the test switch', async () => {
    provider.creditFailure = 'decline';
    await expect(provider.creditCard('tok', 50, 'k2')).resolves.toMatchObject({ status: 'failed' });
    provider.creditFailure = 'throw';
    await expect(provider.creditCard('tok', 50, 'k3')).rejects.toThrow();
  });
});
