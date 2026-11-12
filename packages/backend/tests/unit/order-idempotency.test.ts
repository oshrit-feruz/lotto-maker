import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Decimal } from 'decimal.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// A small stateful fake of what createOrder touches: one user, one location, open draws,
// a price row, and the tickets / orders / wallet rows it writes.
const state = vi.hoisted(() => ({
  balance: 0,
  tickets: [] as any[],
  orders: [] as any[],
  walletTxs: [] as any[],
  audit: [] as any[],
  draws: [] as any[],
  seq: 0,
  salesClosed: false,
  /** Simulates a concurrent request that inserted the same key first. */
  raceOnCreate: null as null | (() => void),
}));

vi.mock('../../src/prisma.js', () => {
  const id = (p: string) => `${p}_${++state.seq}`;
  const prisma: any = {
    user: {
      findUniqueOrThrow: async () => ({ id: 'user-1', verifiedAdult: true, status: 'active' }),
      update: async ({ data }: any) => {
        state.balance = new Decimal(state.balance).minus(data.walletBalance.decrement).toNumber();
      },
    },
    draw: { findMany: async ({ take }: any) => (state.salesClosed ? [] : state.draws.slice(0, take)) },
    location: { findFirst: async () => ({ id: 'loc-1' }) },
    operator: { aggregate: async () => ({ _count: { id: 2 }, _sum: { throughputPerHour: 100 } }) },
    queueSlot: { count: async () => 0, create: async () => ({}) },
    priceList: {
      findFirst: async () => ({
        pricePerTable: new Decimal('3'), extraPricePerForm: new Decimal('5'), feePerOrder: new Decimal('5'),
      }),
    },
    ticket: {
      findUnique: async ({ where }: any) => {
        const { userId, idempotencyKey } = where.userId_idempotencyKey;
        const t = state.tickets.find((x) => x.userId === userId && x.idempotencyKey === idempotencyKey);
        if (!t) return null;
        return {
          ...t,
          orders: state.orders
            .filter((o) => o.ticketId === t.id)
            .map((o) => ({ ...o, draw: state.draws.find((d) => d.id === o.drawId) })),
        };
      },
      create: async ({ data }: any) => {
        if (state.raceOnCreate) {
          state.raceOnCreate();
          state.raceOnCreate = null;
        }
        if (data.idempotencyKey && state.tickets.some((t) => t.userId === data.userId && t.idempotencyKey === data.idempotencyKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const { tables, ...rest } = data;
        const t = { id: id('ticket'), ...rest, tables: tables.create };
        state.tickets.push(t);
        return t;
      },
    },
    order: {
      create: async ({ data }: any) => {
        const o = { id: id('order'), ...data, totalCharged: new Decimal(data.totalCharged) };
        state.orders.push(o);
        return o;
      },
    },
    walletTransaction: {
      create: async ({ data }: any) => {
        const w = { id: id('wtx'), ...data };
        state.walletTxs.push(w);
        return w;
      },
    },
    auditLog: { create: async ({ data }: any) => state.audit.push(data) },
    $executeRaw: async () => 0,
    $queryRaw: async () => [{ walletBalance: new Decimal(state.balance).toFixed(2) }],
  };
  prisma.$transaction = (fn: (tx: any) => Promise<unknown>) => fn(prisma);
  return { prisma };
});
// Phase 6 checks run before the order; they have their own tests (limits, receipts).
vi.mock('../../src/modules/limits/limits.service.js', () => ({ assertCanPlaceOrder: vi.fn(async () => undefined) }));
vi.mock('../../src/modules/receipts/receipts.service.js', () => ({ issueReceiptsInBackground: vi.fn() }));
vi.mock('../../src/storage/r2.service.js', () => ({ r2Service: {}, DEFAULT_SIGNED_URL_TTL_SECONDS: 60 }));

import { createOrder } from '../../src/modules/orders/orders.service.js';
import errorHandler from '../../src/plugins/error-handler.js';
import authPlugin from '../../src/plugins/auth.js';
import ordersRoutes from '../../src/modules/orders/orders.routes.js';

const HOUR = 3_600_000;
const ticket = (numbers = [1, 2, 3, 4, 5, 6], drawCount = 2) => ({
  type: 'regular' as const,
  systematicType: null,
  extra: false,
  drawCount,
  tables: [
    { numbers, strongNumbers: [1] },
    { numbers: [7, 8, 9, 10, 11, 12], strongNumbers: [2] },
  ],
});

beforeEach(() => {
  state.balance = 100;
  state.tickets = [];
  state.orders = [];
  state.walletTxs = [];
  state.audit = [];
  state.seq = 0;
  state.raceOnCreate = null;
  state.salesClosed = false;
  const now = Date.now();
  state.draws = [1, 2, 3].map((n) => ({
    id: `draw-${n}`,
    drawNumber: 3990 + n,
    drawAt: new Date(now + n * 24 * HOUR),
    salesCloseAt: new Date(now + n * 24 * HOUR - 15 * 60_000),
    status: 'scheduled',
  }));
});

describe('createOrder with an Idempotency-Key', () => {
  it('a repeat returns the original orders and charges nothing', async () => {
    const first = await createOrder({ userId: 'user-1', ticket: ticket(), type: 'one_time', idempotencyKey: 'key-12345' });
    // 2 tables x 3 + 5 fee = 11 per draw, 2 draws
    expect(first.totalCharged).toBe('22.00');
    expect(first.replayed).toBe(false);
    expect(state.balance).toBe(78);

    const again = await createOrder({ userId: 'user-1', ticket: ticket(), type: 'one_time', idempotencyKey: 'key-12345' });
    expect(again).toMatchObject({
      ticketId: first.ticketId,
      orderId: first.orderId,
      totalCharged: '22.00',
      status: 'in_queue',
      replayed: true,
    });
    expect(again.orders.map((o) => o.orderId)).toEqual(first.orders.map((o) => o.orderId));
    expect(state.balance).toBe(78);
    expect(state.orders).toHaveLength(2);
    expect(state.walletTxs).toHaveLength(2);
  });

  it('the key is per user: another user with the same key gets a new order', async () => {
    await createOrder({ userId: 'user-1', ticket: ticket(), type: 'one_time', idempotencyKey: 'key-12345' });
    state.balance = 100;
    const other = await createOrder({ userId: 'user-2', ticket: ticket(), type: 'one_time', idempotencyKey: 'key-12345' });
    expect(other.replayed).toBe(false);
    expect(state.tickets).toHaveLength(2);
  });

  it('refuses the same key with a different ticket (409 IDEMPOTENCY_KEY_REUSED)', async () => {
    await createOrder({ userId: 'user-1', ticket: ticket(), type: 'one_time', idempotencyKey: 'key-12345' });
    await expect(
      createOrder({ userId: 'user-1', ticket: ticket([1, 2, 3, 4, 5, 7]), type: 'one_time', idempotencyKey: 'key-12345' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(state.balance).toBe(78);
  });

  it('a repeat still answers after the draw has closed', async () => {
    const first = await createOrder({ userId: 'user-1', ticket: ticket([1, 2, 3, 4, 5, 6], 1), type: 'one_time', idempotencyKey: 'key-12345' });
    state.salesClosed = true;
    const again = await createOrder({ userId: 'user-1', ticket: ticket([1, 2, 3, 4, 5, 6], 1), type: 'one_time', idempotencyKey: 'key-12345' });
    expect(again.orderId).toBe(first.orderId);
  });

  it('losing a race on the unique index returns the winner\'s order', async () => {
    state.raceOnCreate = () => {
      state.tickets.push({ id: 'ticket-winner', userId: 'user-1', idempotencyKey: 'key-12345', ...ticket(), tables: ticket().tables });
      state.orders.push(
        { id: 'order-w1', ticketId: 'ticket-winner', drawId: 'draw-1', status: 'in_queue', totalCharged: new Decimal(11) },
        { id: 'order-w2', ticketId: 'ticket-winner', drawId: 'draw-2', status: 'in_queue', totalCharged: new Decimal(11) },
      );
    };
    const result = await createOrder({ userId: 'user-1', ticket: ticket(), type: 'one_time', idempotencyKey: 'key-12345' });
    expect(result).toMatchObject({ ticketId: 'ticket-winner', orderId: 'order-w1', totalCharged: '22.00', replayed: true });
  });

  it('without a key every call creates a new order', async () => {
    await createOrder({ userId: 'user-1', ticket: ticket(), type: 'one_time' });
    await createOrder({ userId: 'user-1', ticket: ticket(), type: 'one_time' });
    expect(state.tickets).toHaveLength(2);
    expect(state.tickets[0].idempotencyKey).toBeNull();
    expect(state.balance).toBe(56);
  });
});

describe('POST /orders Idempotency-Key header', () => {
  let app: FastifyInstance;
  let token: string;
  beforeEach(async () => {
    app = Fastify();
    await app.register(errorHandler);
    await app.register(authPlugin);
    await app.register(ordersRoutes);
    await app.ready();
    token = app.jwt.sign({ sub: 'user-1', type: 'user' });
  });
  afterEach(() => app.close());

  const post = (key?: string) =>
    app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${token}`, ...(key ? { 'idempotency-key': key } : {}) },
      payload: { ticket: ticket() },
    });

  it('answers a repeat with the same status code and order, charging once', async () => {
    const a = await post('web-checkout-abc123');
    const b = await post('web-checkout-abc123');
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(b.json().orderId).toBe(a.json().orderId);
    expect(state.balance).toBe(78);
  });

  it('rejects a malformed key with 400', async () => {
    expect((await post('short')).statusCode).toBe(400);
  });
});
