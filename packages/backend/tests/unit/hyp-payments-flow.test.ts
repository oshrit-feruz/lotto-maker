import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./helpers/fake-prisma.js').createFakePrisma> }));

vi.mock('../../src/prisma.js', async () => {
  const { createFakePrisma } = await import('./helpers/fake-prisma.js');
  fake.db = createFakePrisma();
  return { prisma: fake.db.client };
});

import { config } from '../../src/config.js';
import {
  chargeSavedCard,
  createCheckout,
  getPaymentProvider,
  processReturn,
} from '../../src/modules/payments/payments.service.js';
import { HypPaymentProvider } from '../../src/modules/payments/hyp/hyp-payment-provider.js';
import {
  dealOk,
  fakeHypGateway,
  field,
  foundDeal,
  HYP_NOT_FOUND as NOT_FOUND,
  HYP_OPTS,
  mpiRow,
  returnParams,
  setupResponse,
} from './helpers/fake-hyp.js';

const USER = 'user-1';

// Select the Hyp provider through the same config the app reads
Object.assign(config, {
  PAYMENT_PROVIDER: 'hyp',
  HYP_GATEWAY_URL: HYP_OPTS.gatewayUrl,
  HYP_TERMINAL_NUMBER: HYP_OPTS.terminalNumber,
  HYP_USER: HYP_OPTS.user,
  HYP_PASSWORD: HYP_OPTS.password,
  HYP_MID: HYP_OPTS.mid,
  CHECKOUT_RETURN_ORIGINS: ['https://lotto.example'],
});

beforeEach(() => {
  fake.db.users.clear();
  fake.db.payments.clear();
  fake.db.walletTxs.length = 0;
  fake.db.savedCards.length = 0;
  fake.db.auditLogs.length = 0;
  fake.db.addUser(USER, 0);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function hostedCheckout(amount: number) {
  let txN = 0;
  const gw = fakeHypGateway({ doDeal: () => setupResponse(`tx-${++txN}`) });
  const result = await createCheckout(USER, amount, undefined, {
    successUrl: 'https://lotto.example/payment/success',
    cancelUrl: 'https://lotto.example/payment/canceled',
  });
  return { result, uniqueId: field(gw.calls[0]!.xml, 'uniqueid')!, xml: gw.calls[0]!.xml };
}

describe('hyp: provider selection', () => {
  it('PAYMENT_PROVIDER=hyp selects the Hyp provider', () => {
    expect(getPaymentProvider()).toBeInstanceOf(HypPaymentProvider);
  });
});

describe('hyp: hosted-page deposit', () => {
  it('stores the txId, sends our payment id as uniqueid and asks for an iframe', async () => {
    const { result, uniqueId, xml } = await hostedCheckout(47.3);
    expect(result.embed).toBe(true);
    expect(result.checkoutUrl).toBe('https://ppsuat.creditguard.co.il/?txId=tx-1');
    expect(uniqueId).toBe(result.paymentId);
    expect(field(xml, 'successUrl')).toContain(`paymentId=${result.paymentId}`);
    const payment = fake.db.payments.get(result.paymentId);
    expect(payment).toMatchObject({ provider: 'hyp', providerTxId: 'tx-1', status: 'pending' });
  });

  it('credits the wallet once for repeated returns of the same transaction', async () => {
    const { result } = await hostedCheckout(47.3);
    fakeHypGateway({ inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: result.paymentId, agorot: 4730 }) });
    const params = returnParams('tx-1', result.paymentId);

    await expect(processReturn(params)).resolves.toEqual({ outcome: 'credited', paymentId: result.paymentId, status: 'approved' });
    await expect(processReturn(params)).resolves.toMatchObject({ outcome: 'duplicate', status: 'approved' });

    expect(fake.db.balanceOf(USER)).toBe(47.3);
    expect(fake.db.walletTxs).toHaveLength(1);
    expect(fake.db.savedCards).toEqual([
      expect.objectContaining({ userId: USER, token: '4580000000004242.1228', last4: '4242' }),
    ]);
  });

  it('refuses a result whose amount differs from the payment', async () => {
    const { result } = await hostedCheckout(47.3);
    fakeHypGateway({ inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: result.paymentId, agorot: 100 }) });
    await expect(processReturn(returnParams('tx-1', result.paymentId))).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' });
    expect(fake.db.balanceOf(USER)).toBe(0);
  });

  it('refuses a uniqueID that is not the payment of that txId', async () => {
    await hostedCheckout(10);
    fakeHypGateway({ inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: 'pay-someone-else', agorot: 1000 }) });
    await expect(processReturn(returnParams('tx-1', 'pay-someone-else'))).rejects.toMatchObject({
      code: 'PAYMENT_REFERENCE_MISMATCH',
    });
    expect(fake.db.balanceOf(USER)).toBe(0);
  });

  it('marks a declined payment failed and credits nothing', async () => {
    const { result } = await hostedCheckout(10);
    fakeHypGateway({
      inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: result.paymentId, agorot: 1000, statusCode: '4' }),
    });
    await expect(processReturn(returnParams('tx-1', result.paymentId, { errorCode: '033' }))).resolves.toMatchObject({
      outcome: 'failed',
      status: 'failed',
    });
    expect(fake.db.balanceOf(USER)).toBe(0);
  });
});

describe('hyp: saved-card deposit', () => {
  function addCard() {
    fake.db.savedCards.push({ id: 'card-1', userId: USER, token: '4580000000004242.1228', last4: '4242', active: true });
  }

  it('charges once and credits once for a repeated request', async () => {
    addCard();
    let deals = 0;
    const gw = fakeHypGateway({
      inquireTransactions: () => NOT_FOUND,
      doDeal: () => dealOk(`800${++deals}`),
    });
    const first = await chargeSavedCard(USER, 'card-1', 30, 'saved-key-0001');
    expect(first.status).toBe('approved');
    const again = await chargeSavedCard(USER, 'card-1', 30, 'saved-key-0001');
    expect(again).toEqual(first);
    expect(gw.commands()).toEqual(['inquireTransactions', 'doDeal']);
    expect(fake.db.balanceOf(USER)).toBe(30);
    expect(fake.db.payments.get(first.paymentId).providerTxId).toBe('8001');
  });

  it('leaves the payment pending when the outcome is unknown, and a retry does not double-charge', async () => {
    addCard();
    fakeHypGateway({ inquireTransactions: () => NOT_FOUND, doDeal: () => '<html>502</html>' });
    await expect(chargeSavedCard(USER, 'card-1', 30, 'saved-key-0002')).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' });
    expect(fake.db.balanceOf(USER)).toBe(0);

    // The first deal did go through: the retry finds it by key instead of charging again
    const gw = fakeHypGateway({ inquireTransactions: () => foundDeal('8100') });
    await expect(chargeSavedCard(USER, 'card-1', 30, 'saved-key-0002')).resolves.toMatchObject({ status: 'approved' });
    expect(gw.commands()).toEqual(['inquireTransactions']);
    expect(fake.db.balanceOf(USER)).toBe(30);
  });

  it('refuses a card of another user', async () => {
    fake.db.savedCards.push({ id: 'card-x', userId: 'other', token: 't', last4: '1111', active: true });
    await expect(chargeSavedCard(USER, 'card-x', 30, 'saved-key-0003')).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
  });
});
