import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./helpers/fake-prisma.js').createFakePrisma> }));

vi.mock('../../src/prisma.js', async () => {
  const { createFakePrisma } = await import('./helpers/fake-prisma.js');
  fake.db = createFakePrisma();
  return { prisma: fake.db.client };
});

import { createCheckout, getPaymentProvider } from '../../src/modules/payments/payments.service.js';
import type { MockPaymentProvider } from '../../src/modules/payments/mock-payment-provider.js';
import { isAllowedReturnUrl } from '../../src/modules/payments/return-urls.js';
import errorHandler from '../../src/plugins/error-handler.js';
import authPlugin from '../../src/plugins/auth.js';
import paymentsRoutes from '../../src/modules/payments/payments.routes.js';
import { config } from '../../src/config.js';

const USER = 'user-1';
const SITE = 'https://lotto.example';
const provider = getPaymentProvider() as MockPaymentProvider;
const originalOrigins = [...config.CHECKOUT_RETURN_ORIGINS];

beforeEach(() => {
  fake.db.users.clear();
  fake.db.payments.clear();
  fake.db.auditLogs.length = 0;
  fake.db.addUser(USER, 0);
  config.CHECKOUT_RETURN_ORIGINS.splice(0, Infinity, SITE, 'http://localhost:5173');
});
afterEach(() => {
  config.CHECKOUT_RETURN_ORIGINS.splice(0, Infinity, ...originalOrigins);
  vi.restoreAllMocks();
});

describe('return URL allowlist', () => {
  it('accepts only http(s) URLs on an allowed origin', () => {
    expect(isAllowedReturnUrl(`${SITE}/payment/success`)).toBe(true);
    expect(isAllowedReturnUrl('http://localhost:5173/payment/canceled')).toBe(true);
    expect(isAllowedReturnUrl('http://lotto.example/payment/success')).toBe(false); // wrong scheme = other origin
    expect(isAllowedReturnUrl('https://lotto.example.evil.com/x')).toBe(false);
    expect(isAllowedReturnUrl('https://user:pw@lotto.example/x')).toBe(false);
    expect(isAllowedReturnUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedReturnUrl('/payment/success')).toBe(false);
  });

  it('refuses everything when CHECKOUT_RETURN_ORIGINS is empty', () => {
    expect(isAllowedReturnUrl(`${SITE}/payment/success`, [])).toBe(false);
  });
});

describe('createCheckout with return URLs', () => {
  it('passes them to the provider with paymentId added', async () => {
    const spy = vi.spyOn(provider, 'createCheckout');
    const result = await createCheckout(USER, 50, undefined, {
      successUrl: `${SITE}/payment/success`,
      cancelUrl: `${SITE}/payment/canceled`,
    });
    const passed = spy.mock.calls[0]![2]!;
    expect(passed.successUrl).toBe(`${SITE}/payment/success?paymentId=${result.paymentId}`);
    expect(passed.cancelUrl).toBe(`${SITE}/payment/canceled?paymentId=${result.paymentId}`);
    // The payment row has that same id, so GET /payments/:id works with it
    expect(fake.db.payments.get(result.paymentId)).toBeTruthy();
    // The mock echoes them on its hosted-page link
    const link = new URL(result.checkoutUrl);
    expect(link.searchParams.get('successUrl')).toBe(passed.successUrl);
    expect(link.searchParams.get('cancelUrl')).toBe(passed.cancelUrl);
  });

  it('refuses a URL off the allowlist with 422 before creating anything', async () => {
    await expect(
      createCheckout(USER, 50, undefined, { successUrl: 'https://evil.example/steal' }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_RETURN_URL' });
    expect(fake.db.payments.size).toBe(0);
  });

  it('without return URLs behaves as before', async () => {
    const spy = vi.spyOn(provider, 'createCheckout');
    await createCheckout(USER, 50);
    expect(spy.mock.calls[0]![2]).toBeUndefined();
  });
});

describe('HTTP: POST /payments/checkout and polling GET /payments/:id', () => {
  let app: FastifyInstance;
  let token: string;
  beforeEach(async () => {
    app = Fastify();
    await app.register(errorHandler);
    await app.register(authPlugin);
    await app.register(paymentsRoutes);
    await app.ready();
    token = app.jwt.sign({ sub: USER, type: 'user' });
  });
  afterEach(() => app.close());

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('accepts allowed return URLs, and the owner can poll the payment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/checkout',
      headers: auth(),
      payload: { amount: 50, successUrl: `${SITE}/payment/success`, cancelUrl: `${SITE}/payment/canceled` },
    });
    expect(res.statusCode).toBe(201);
    const { paymentId } = res.json();

    const poll = await app.inject({ method: 'GET', url: `/payments/${paymentId}`, headers: auth() });
    expect(poll.statusCode).toBe(200);
    expect(poll.json()).toMatchObject({ paymentId, status: 'pending', amount: '50.00' });

    const other = app.jwt.sign({ sub: 'user-2', type: 'user' });
    const stranger = await app.inject({ method: 'GET', url: `/payments/${paymentId}`, headers: { authorization: `Bearer ${other}` } });
    expect(stranger.statusCode).toBe(403);
  });

  it('rejects a return URL on another origin with 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/checkout',
      headers: auth(),
      payload: { amount: 50, cancelUrl: 'https://evil.example/' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('INVALID_RETURN_URL');
  });

  it('the mock hosted page sends the user back to successUrl after paying', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/payments/checkout',
      headers: auth(),
      payload: { amount: 50, successUrl: `${SITE}/payment/success` },
    });
    const link = new URL(created.json().checkoutUrl);
    const page = await app.inject({ method: 'GET', url: `${link.pathname}${link.search}` });
    expect(page.statusCode).toBe(200);
    const href = /href="([^"]*complete\?result=approved[^"]*)"/.exec(page.body)![1]!.replace(/&amp;/g, '&');

    // The link is relative to /payments/mock-checkout/
    const done = await app.inject({ method: 'GET', url: `/payments/mock-checkout/${href}` });
    expect(done.statusCode).toBe(302);
    expect(done.headers.location).toBe(`${SITE}/payment/success?paymentId=${created.json().paymentId}`);
  });

  it('the mock page ignores a return URL off the allowlist in its query string', async () => {
    const created = await app.inject({ method: 'POST', url: '/payments/checkout', headers: auth(), payload: { amount: 50 } });
    const providerTxId = new URL(created.json().checkoutUrl).pathname.split('/').pop();
    const done = await app.inject({
      method: 'GET',
      url: `/payments/mock-checkout/${providerTxId}/complete?result=approved&successUrl=${encodeURIComponent('https://evil.example/')}`,
    });
    expect(done.statusCode).toBe(200);
  });
});
