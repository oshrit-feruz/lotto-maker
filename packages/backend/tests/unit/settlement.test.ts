import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── In-memory stand-in for the parts of Prisma that settlement touches ─────────
const h = vi.hoisted(() => {
  const state: any = {};
  const reset = () => {
    state.draw = null;
    state.orders = [];
    state.users = {};
    state.wins = [];
    state.claims = [];
    state.pending = [];
    state.walletTxs = [];
    state.audit = [];
  };
  reset();

  const matchesStatus = (o: any, where: any) =>
    (!where.id || o.id === where.id) &&
    (!where.drawId || o.drawId === where.drawId) &&
    (!where.status || (where.status.in ? where.status.in.includes(o.status) : o.status === where.status));

  const fake: any = {
    draw: {
      findUnique: async () => state.draw,
      findMany: async ({ where }: any) => (state.draw && state.draw.status === where.status ? [state.draw] : []),
      updateMany: async ({ where, data }: any) => {
        if (!state.draw || state.draw.status !== where.status) return { count: 0 };
        Object.assign(state.draw, data);
        return { count: 1 };
      },
    },
    order: {
      findMany: async ({ where }: any) => state.orders.filter((o: any) => matchesStatus(o, where)),
      updateMany: async ({ where, data }: any) => {
        const hit = state.orders.filter((o: any) => matchesStatus(o, where));
        hit.forEach((o: any) => Object.assign(o, data));
        return { count: hit.length };
      },
    },
    orderWin: { createMany: async ({ data }: any) => void state.wins.push(...data) },
    prizeClaim: { create: async ({ data }: any) => void state.claims.push(data) },
    pendingCardCredit: { create: async ({ data }: any) => void state.pending.push(data) },
    user: {
      update: async ({ where, data }: any) => {
        const u = state.users[where.id];
        u.balance = new Decimal(u.balance).plus(data.walletBalance.increment);
      },
    },
    walletTransaction: { create: async ({ data }: any) => void state.walletTxs.push(data) },
    auditLog: { create: async ({ data }: any) => void state.audit.push(data) },
    // tagged template: SELECT ... WHERE id = ${userId}
    $queryRaw: async (_s: any, userId: string) => [{ walletBalance: new Decimal(state.users[userId].balance).toFixed(2) }],
    $transaction: async (cb: any) => cb(fake),
  };
  return { state, reset, fake };
});

vi.mock('../../src/prisma.js', () => ({ prisma: h.fake }));
vi.mock('../../src/services/notifications.js', () => ({
  notificationService: { sendToUser: vi.fn().mockResolvedValue(undefined) },
  PAYLOADS: {
    orderLost: () => ({}),
    orderWon: () => ({}),
    prizeClaim: () => ({}),
    resultsDelayed: () => ({}),
  },
}));

import { settleDraw } from '../../src/modules/results/settlement.service.js';

const tier = (game: string, t: string, amount: number) => ({ game, tier: t, prizeAmount: new Decimal(amount) });

const makeDraw = (status: string) => ({
  id: 'draw1',
  status,
  numbers: [4, 11, 19, 23, 30, 36],
  strong: 5,
  extraDigits: [3, 1, 7, 2, 5, 6],
  prizeTiers: [
    tier('lotto', '3', 6),
    tier('lotto', '3+s', 15),
    tier('lotto', '5+s', 5645),
    tier('double', '5+s', 11290),
  ],
});

const makeOrder = (id: string, userId: string, numbers: number[], strong: number, type = 'regular') => ({
  id,
  userId,
  drawId: 'draw1',
  status: 'scanned',
  extraDigits: [],
  ticket: { type, systematicType: null, extra: false, tables: [{ numbers, strongNumbers: [strong] }] },
});

const balance = (id: string) => new Decimal(h.state.users[id].balance).toNumber();

beforeEach(() => {
  h.reset();
  h.state.users = {
    u1: { balance: 100 },
    u2: { balance: 100 },
    u3: { balance: 100 },
    u4: { balance: 2598 }, // 2 ₪ below the wallet cap
  };
  h.state.orders = [
    makeOrder('o1', 'u1', [4, 11, 19, 1, 2, 3], 1), // 3 hits -> 6
    makeOrder('o2', 'u2', [4, 11, 19, 23, 30, 1], 5), // 5+strong -> 5645, above the limit
    makeOrder('o3', 'u3', [1, 2, 3, 6, 7, 8], 1), // nothing
    makeOrder('o4', 'u4', [4, 11, 19, 1, 2, 3], 5), // 3+strong -> 15, only 2 fit under the cap
  ];
});

describe('settleDraw', () => {
  it('pays nothing while the draw is only results_suggested', async () => {
    h.state.draw = makeDraw('results_suggested');
    const res = await settleDraw('draw1');
    expect(res.settled).toBe(false);
    expect(h.state.orders.every((o: any) => o.status === 'scanned')).toBe(true);
    expect(h.state.walletTxs).toHaveLength(0);
    expect(h.state.claims).toHaveLength(0);
    expect(h.state.wins).toHaveLength(0);
    expect(balance('u1')).toBe(100);
    expect(h.state.draw.status).toBe('results_suggested');
  });

  it('pays small wins to the wallet, and only up to the cap', async () => {
    h.state.draw = makeDraw('results_confirmed');
    await settleDraw('draw1');
    expect(balance('u1')).toBe(106);
    expect(balance('u4')).toBe(2600);
    expect(h.state.pending).toEqual([{ orderId: 'o4', userId: 'u4', amount: '13.00' }]);
    expect(h.state.orders.find((o: any) => o.id === 'o1').status).toBe('won');
    expect(h.state.orders.find((o: any) => o.id === 'o3').status).toBe('lost');
  });

  it('above the limit: creates a PrizeClaim and credits nothing', async () => {
    h.state.draw = makeDraw('results_confirmed');
    await settleDraw('draw1');
    expect(h.state.claims).toEqual([
      { orderId: 'o2', userId: 'u2', amount: '5645.00', status: 'awaiting_pickup' },
    ]);
    expect(balance('u2')).toBe(100);
    expect(h.state.walletTxs.some((t: any) => t.orderId === 'o2')).toBe(false);
    expect(h.state.orders.find((o: any) => o.id === 'o2').status).toBe('won');
  });

  it('a double ticket is paid from the double table', async () => {
    h.state.draw = makeDraw('results_confirmed');
    h.state.orders = [makeOrder('d1', 'u1', [4, 11, 19, 23, 30, 1], 5, 'double')];
    await settleDraw('draw1');
    expect(h.state.wins).toEqual([{ orderId: 'd1', game: 'double', tier: '5+s', count: 1, amount: '11290.00' }]);
    expect(h.state.claims[0].amount).toBe('11290.00');
  });

  it('stores one OrderWin per tier and marks the draw settled', async () => {
    h.state.draw = makeDraw('results_confirmed');
    await settleDraw('draw1');
    expect(h.state.wins.map((w: any) => `${w.orderId}:${w.game}:${w.tier}`).sort()).toEqual([
      'o1:lotto:3',
      'o2:lotto:5+s',
      'o4:lotto:3+s',
    ]);
    expect(h.state.draw.status).toBe('settled');
  });

  it('running twice credits nothing extra', async () => {
    h.state.draw = makeDraw('results_confirmed');
    await settleDraw('draw1');
    const snapshot = JSON.stringify({
      b: ['u1', 'u2', 'u3', 'u4'].map(balance),
      w: h.state.wins,
      c: h.state.claims,
      p: h.state.pending,
      t: h.state.walletTxs,
    });

    // Second run on a settled draw
    await settleDraw('draw1');
    // And a forced re-run as if the status flip had been lost: orders are no longer settleable
    h.state.draw.status = 'results_confirmed';
    const again = await settleDraw('draw1');

    expect(again.processed).toBe(0);
    expect(
      JSON.stringify({
        b: ['u1', 'u2', 'u3', 'u4'].map(balance),
        w: h.state.wins,
        c: h.state.claims,
        p: h.state.pending,
        t: h.state.walletTxs,
      }),
    ).toBe(snapshot);
  });
});
