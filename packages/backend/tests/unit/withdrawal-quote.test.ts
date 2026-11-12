import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

vi.mock('../../src/prisma.js', () => ({ prisma: {} }));

import { config } from '../../src/config.js';
import errorHandler from '../../src/plugins/error-handler.js';
import authPlugin from '../../src/plugins/auth.js';
import walletRoutes from '../../src/modules/wallet/wallet.routes.js';

let app: FastifyInstance;
let token: string;

beforeEach(async () => {
  app = Fastify();
  await app.register(errorHandler);
  await app.register(authPlugin);
  await app.register(walletRoutes);
  await app.ready();
  token = app.jwt.sign({ sub: 'user-1', type: 'user' });
});
afterEach(() => app.close());

const quote = (qs: string, auth = true) =>
  app.inject({
    method: 'GET',
    url: `/wallet/withdrawals/quote?${qs}`,
    headers: auth ? { authorization: `Bearer ${token}` } : {},
  });

describe('GET /wallet/withdrawals/quote', () => {
  it('a bank withdrawal pays the bank fee', async () => {
    const res = await quote('amount=100&method=bank');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      amount: '100.00',
      method: 'bank',
      fee: config.BANK_WITHDRAWAL_FEE.toFixed(2),
      net: (100 - config.BANK_WITHDRAWAL_FEE).toFixed(2),
      min: config.MIN_WITHDRAWAL_AMOUNT.toFixed(2),
      belowMinimum: false,
    });
  });

  it('a card withdrawal is free', async () => {
    expect((await quote('amount=50.5&method=card')).json()).toMatchObject({ amount: '50.50', fee: '0.00', net: '50.50' });
  });

  it('flags an amount below the minimum, or not above the bank fee', async () => {
    expect((await quote(`amount=${config.MIN_WITHDRAWAL_AMOUNT - 1}&method=card`)).json().belowMinimum).toBe(true);
    const tooSmall = (await quote(`amount=${config.BANK_WITHDRAWAL_FEE}&method=bank`)).json();
    expect(tooSmall).toMatchObject({ net: '0.00', belowMinimum: true });
  });

  it('validates the query and requires a user token', async () => {
    expect((await quote('amount=10&method=paypal')).statusCode).toBe(400);
    expect((await quote('amount=-5&method=card')).statusCode).toBe(400);
    expect((await quote('amount=10.123&method=card')).statusCode).toBe(400);
    expect((await quote('amount=100&method=bank', false)).statusCode).toBe(401);
  });
});
