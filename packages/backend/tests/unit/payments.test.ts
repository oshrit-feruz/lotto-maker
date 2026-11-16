import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import Fastify,{ type FastifyInstance } from 'fastify';

const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./helpers/fake-prisma.js').createFakePrisma> }));

vi.mock('../../src/prisma.js', async () => {
  const { createFakePrisma } = await import('./helpers/fake-prisma.js');
  fake.db = createFakePrisma();
  return { prisma: fake.db.client };
});

import { createCheckout, getPaymentProvider, processWebhook } from '../../src/modules/payments/payments.service.js';
import { MockPaymentProvider, MOCK_SIGNATURE_HEADER } from '../../src/modules/payments/mock-payment-provider.js';
import errorHandler from '../../src/plugins/error-handler.js';
import authPlugin from '../../src/plugins/auth.js';
import paymentsRoutes from '../../src/modules/payments/payments.routes.js';
import walletRoutes from '../../src/modules/wallet/wallet.routes.js';
import { config } from '../../src/config.js';

const USER = 'user-1';
const provider = getPaymentProvider() as MockPaymentProvider;

function signedWebhook(event: Record<string, unknown>) {
  const rawBody = Buffer.from(JSON.stringify(event));
  return { rawBody, headers: { [MOCK_SIGNATURE_HEADER]: provider.sign(rawBody) } };
}

async function checkout(amount: number) {
  const { paymentId } = await createCheckout(USER, amount);
  const payment = fake.db.payments.get(paymentId);
  return { paymentId, providerTxId: payment.providerTxId as string, payment };
}

beforeEach(() => {
  fake.db.users.clear();
  fake.db.payments.clear();
  fake.db.walletTxs.length = 0;
  fake.db.auditLogs.length = 0;
  fake.db.limits.clear();
  provider.refunds.length = 0;
  fake.db.addUser(USER, 0);
});

describe('payments: checkout', () => {
  it('creates a pending payment and credits nothing', async () => {
    const result = await createCheckout(USER, 100);
    expect(result.checkoutUrl).toContain('/payments/mock-checkout/');
    expect(fake.db.payments.get(result.paymentId).status).toBe('pending');
    expect(fake.db.balanceOf(USER)).toBe(0);
    expect(fake.db.walletTxs).toHaveLength(0);
  });

  it('returns the same payment for a repeated idempotency key', async () => {
    const a = await createCheckout(USER, 100, 'key-12345678');
    const b = await createCheckout(USER, 100, 'key-12345678');
    expect(b.paymentId).toBe(a.paymentId);
    expect(fake.db.payments.size).toBe(1);
    await expect(createCheckout(USER, 50, 'key-12345678')).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('rejects a checkout that would exceed the wallet cap', async () => {
    fake.db.addUser(USER, config.WALLET_BALANCE_CAP - 50);
    await expect(createCheckout(USER, 100)).rejects.toMatchObject({ statusCode: 422, code: 'WALLET_CAP_EXCEEDED' });
    expect(fake.db.payments.size).toBe(0);
    await expect(createCheckout(USER, 50)).resolves.toBeTruthy();
  });
});

describe('payments: webhook', () => {
  it('credits the wallet exactly once on approved', async () => {
    const { providerTxId, payment } = await checkout(100);
    const { rawBody, headers } = signedWebhook({ providerTxId, status: 'approved', amount: 100, cardLast4: '4242' });

    await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'credited' });

    expect(fake.db.balanceOf(USER)).toBe(100);
    expect(payment.status).toBe('approved');
    expect(payment.cardLast4).toBe('4242');
    expect(fake.db.walletTxs).toHaveLength(1);
    expect(fake.db.walletTxs[0]).toMatchObject({ type: 'deposit', userId: USER, paymentId: payment.id });
  });

  it('treats a duplicate webhook as a no-op', async () => {
    const { providerTxId } = await checkout(100);
    const { rawBody, headers } = signedWebhook({ providerTxId, status: 'approved', amount: 100 });

    await processWebhook(rawBody, headers);
    await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'duplicate' });
    await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'duplicate' });

    expect(fake.db.balanceOf(USER)).toBe(100);
    expect(fake.db.walletTxs).toHaveLength(1);
  });

  it('credits nothing for a failed payment, even if "approved" arrives later', async () => {
    const { providerTxId, payment } = await checkout(100);
    const failed = signedWebhook({ providerTxId, status: 'failed', amount: 100 });
    await expect(processWebhook(failed.rawBody, failed.headers)).resolves.toEqual({ outcome: 'failed' });
    expect(payment.status).toBe('failed');

    const approved = signedWebhook({ providerTxId, status: 'approved', amount: 100 });
    await expect(processWebhook(approved.rawBody, approved.headers)).resolves.toEqual({ outcome: 'duplicate' });

    expect(fake.db.balanceOf(USER)).toBe(0);
    expect(fake.db.walletTxs).toHaveLength(0);
  });

  it('rejects a bad, missing or stale signature and credits nothing', async () => {
    const { providerTxId, payment } = await checkout(100);
    const { rawBody, headers } = signedWebhook({ providerTxId, status: 'approved', amount: 100 });

    await expect(processWebhook(rawBody, { [MOCK_SIGNATURE_HEADER]: 'deadbeef' }))
      .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_WEBHOOK_SIGNATURE' });
    await expect(processWebhook(rawBody, {}))
      .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_WEBHOOK_SIGNATURE' });

    // A valid signature must not carry over to a different body
    const tampered = Buffer.from(JSON.stringify({ providerTxId, status: 'approved', amount: 100, cardLast4: '0000' }));
    await expect(processWebhook(tampered, headers))
      .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_WEBHOOK_SIGNATURE' });

    // Signed with the wrong secret
    const other = new MockPaymentProvider('some-other-secret-value', 'http://x');
    await expect(processWebhook(rawBody, { [MOCK_SIGNATURE_HEADER]: other.sign(rawBody) }))
      .rejects.toMatchObject({ statusCode: 401 });

    expect(payment.status).toBe('pending');
    expect(fake.db.balanceOf(USER)).toBe(0);
  });

  it('rejects an approved webhook whose amount differs from the payment', async () => {
    const { providerTxId, payment } = await checkout(20);
    const { rawBody, headers } = signedWebhook({ providerTxId, status: 'approved', amount: 2000 });
    await expect(processWebhook(rawBody, headers)).rejects.toMatchObject({ statusCode: 400, code: 'AMOUNT_MISMATCH' });
    expect(payment.status).toBe('pending');
    expect(fake.db.balanceOf(USER)).toBe(0);
  });

  it('rejects a webhook for an unknown payment', async () => {
    const { rawBody, headers } = signedWebhook({ providerTxId: 'mock_unknown', status: 'approved', amount: 100 });
    await expect(processWebhook(rawBody, headers)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('enforces the wallet cap when the payment lands: no credit, payment refunded', async () => {
    const { providerTxId, payment } = await checkout(100);
    // Balance grew between checkout and webhook (e.g. a second deposit or a win)
    fake.db.addUser(USER, config.WALLET_BALANCE_CAP - 50);

    const { rawBody, headers } = signedWebhook({ providerTxId, status: 'approved', amount: 100 });
    await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'cap_exceeded' });

    expect(fake.db.balanceOf(USER)).toBe(config.WALLET_BALANCE_CAP - 50);
    expect(fake.db.walletTxs).toHaveLength(0);
    expect(payment.status).toBe('refunded');
    expect(provider.refunds).toEqual([{ providerTxId, amount: 100 }]);
  });

  describe('responsible gaming at credit time', () => {
    const limitsRow = (patch: Record<string, unknown>) => ({
      depositDaily: null,
      depositWeekly: null,
      depositMonthly: null,
      lossMonthly: null,
      pending: {},
      selfExcludedUntil: null,
      selfExcludedPermanent: false,
      selfExcludedAt: null,
      ...patch,
    });

    it('a user who self-excluded after checkout is not credited; the payment is refunded', async () => {
      const { providerTxId, payment } = await checkout(100);
      fake.db.limits.set(USER, limitsRow({ selfExcludedPermanent: true, selfExcludedAt: new Date() }));

      const { rawBody, headers } = signedWebhook({ providerTxId, status: 'approved', amount: 100 });
      await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'rg_blocked' });

      expect(fake.db.balanceOf(USER)).toBe(0);
      expect(fake.db.walletTxs).toHaveLength(0);
      expect(payment.status).toBe('refunded');
      expect(provider.refunds).toEqual([{ providerTxId, amount: 100 }]);
      expect(fake.db.auditLogs.map((a) => a.action)).toContain('payment:rejected_responsible_gaming');
      expect(fake.db.auditLogs.find((a) => a.action === 'payment:rejected_responsible_gaming').metadata.code).toBe(
        'SELF_EXCLUDED',
      );
    });

    it('two checkouts that each fit the limit: the second credit over the limit is refused', async () => {
      // Both checkouts were opened before the limit was set (a decrease applies at once)
      const a = await checkout(100);
      const b = await checkout(100);
      fake.db.limits.set(USER, limitsRow({ depositDaily: 150 }));

      const okA = signedWebhook({ providerTxId: a.providerTxId, status: 'approved', amount: 100 });
      await expect(processWebhook(okA.rawBody, okA.headers)).resolves.toEqual({ outcome: 'credited' });
      const okB = signedWebhook({ providerTxId: b.providerTxId, status: 'approved', amount: 100 });
      await expect(processWebhook(okB.rawBody, okB.headers)).resolves.toEqual({ outcome: 'rg_blocked' });

      expect(fake.db.balanceOf(USER)).toBe(100);
      expect(b.payment.status).toBe('refunded');
      expect(provider.refunds).toEqual([{ providerTxId: b.providerTxId, amount: 100 }]);
    });

    it('a deposit within the limit is credited, counting itself once', async () => {
      fake.db.limits.set(USER, limitsRow({ depositDaily: 100 }));
      const { providerTxId } = await checkout(100);
      const { rawBody, headers } = signedWebhook({ providerTxId, status: 'approved', amount: 100 });
      await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'credited' });
      expect(fake.db.balanceOf(USER)).toBe(100);
    });
  });

  describe('refund after approval', () => {
    async function approved(amount: number) {
      const c = await checkout(amount);
      const ok = signedWebhook({ providerTxId: c.providerTxId, status: 'approved', amount });
      await processWebhook(ok.rawBody, ok.headers);
      return c;
    }
    const refundEvent = (providerTxId: string, amount: number) =>
      signedWebhook({ providerTxId, status: 'refunded', amount });

    it('debits the wallet once and links the reversal to the payment', async () => {
      const { providerTxId, payment } = await approved(100);
      const { rawBody, headers } = refundEvent(providerTxId, 100);

      await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'reversed' });

      expect(fake.db.balanceOf(USER)).toBe(0);
      expect(payment.status).toBe('refunded');
      expect(fake.db.walletTxs).toHaveLength(2);
      expect(fake.db.walletTxs[1]).toMatchObject({ type: 'refund_reversal', amount: 100, paymentId: payment.id });
      expect(fake.db.users.get(USER).status).toBe('active');
      expect(fake.db.auditLogs.some((l) => l.action === 'payment:chargeback_shortfall')).toBe(false);
    });

    it('treats a repeated refund as a no-op', async () => {
      const { providerTxId } = await approved(100);
      const { rawBody, headers } = refundEvent(providerTxId, 100);
      await processWebhook(rawBody, headers);

      await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'duplicate' });
      await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'duplicate' });

      expect(fake.db.balanceOf(USER)).toBe(0);
      expect(fake.db.walletTxs.filter((t) => t.type === 'refund_reversal')).toHaveLength(1);
    });

    it('takes only the remaining balance, suspends the user and logs the shortfall', async () => {
      const { providerTxId, payment } = await approved(100);
      fake.db.users.get(USER).walletBalance = new Decimal(30); // 70 already spent

      const { rawBody, headers } = refundEvent(providerTxId, 100);
      await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'reversed' });

      expect(fake.db.balanceOf(USER)).toBe(0);
      expect(fake.db.walletTxs[1]).toMatchObject({ type: 'refund_reversal', amount: 30, paymentId: payment.id });
      expect(fake.db.users.get(USER).status).toBe('suspended');
      const log = fake.db.auditLogs.find((l) => l.action === 'payment:chargeback_shortfall');
      expect(log.metadata).toMatchObject({ shortfall: '70', userId: USER });
    });

    it('never goes negative when the wallet is already empty', async () => {
      const { providerTxId } = await approved(100);
      fake.db.users.get(USER).walletBalance = new Decimal(0);

      const { rawBody, headers } = refundEvent(providerTxId, 100);
      await processWebhook(rawBody, headers);

      expect(fake.db.balanceOf(USER)).toBe(0);
      expect(fake.db.walletTxs.filter((t) => t.type === 'refund_reversal')).toHaveLength(0);
      expect(fake.db.users.get(USER).status).toBe('suspended');
    });
  });

  it('allows a deposit that lands exactly on the cap', async () => {
    fake.db.addUser(USER, config.WALLET_BALANCE_CAP - 100);
    const { providerTxId } = await checkout(100);
    const { rawBody, headers } = signedWebhook({ providerTxId, status: 'approved', amount: 100 });
    await expect(processWebhook(rawBody, headers)).resolves.toEqual({ outcome: 'credited' });
    expect(fake.db.balanceOf(USER)).toBe(config.WALLET_BALANCE_CAP);
  });
});

describe('payments: HTTP routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(errorHandler);
    await app.register(authPlugin);
    await app.register(walletRoutes);
    await app.register(paymentsRoutes);
    await app.ready();
    token = app.jwt.sign({ sub: USER, type: 'user' });
  });

  afterEach(() => app.close());

  it('no longer exposes POST /wallet/deposit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wallet/deposit',
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 100 },
    });
    expect(res.statusCode).toBe(404);
    expect(fake.db.balanceOf(USER)).toBe(0);
  });

  it('checkout requires auth and returns a checkout URL without crediting', async () => {
    const anon = await app.inject({ method: 'POST', url: '/payments/checkout', payload: { amount: 50 } });
    expect(anon.statusCode).toBe(401);

    const res = await app.inject({
      method: 'POST',
      url: '/payments/checkout',
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 50 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().checkoutUrl).toMatch(/^http/);
    expect(fake.db.balanceOf(USER)).toBe(0);
  });

  it('webhook verifies the signature over the raw request body', async () => {
    const { providerTxId } = await checkout(100);
    // Unusual spacing: the signature only matches if the server hashes the bytes as sent
    const body = `{ "providerTxId": "${providerTxId}",  "status": "approved", "amount": 100 }`;

    const bad = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      headers: { 'content-type': 'application/json', [MOCK_SIGNATURE_HEADER]: 'nope' },
      payload: body,
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error).toBe('INVALID_WEBHOOK_SIGNATURE');
    expect(fake.db.balanceOf(USER)).toBe(0);

    const send = () =>
      app.inject({
        method: 'POST',
        url: '/payments/webhook',
        headers: { 'content-type': 'application/json', [MOCK_SIGNATURE_HEADER]: provider.sign(body) },
        payload: body,
      });

    const ok = await send();
    expect(ok.statusCode).toBe(200);
    expect(ok.json().outcome).toBe('credited');

    const again = await send();
    expect(again.statusCode).toBe(200);
    expect(again.json().outcome).toBe('duplicate');
    expect(fake.db.balanceOf(USER)).toBe(100);
  });
});
