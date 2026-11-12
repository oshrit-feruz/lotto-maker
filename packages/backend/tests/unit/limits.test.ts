import { describe, it, expect, vi, beforeEach } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => {
  const s = {
    limits: null as any,
    payments: [] as Array<{ amount: number; createdAt: Date; status: string }>,
    spend: 0,
    prizes: 0,
    audit: [] as any[],
  };
  const fake: any = {
    userLimits: {
      findUnique: async () => s.limits,
      upsert: async ({ create, update }: any) => {
        s.limits = s.limits ? { ...s.limits, ...update } : { ...baseRow(), ...create };
        return s.limits;
      },
      update: async ({ data }: any) => {
        s.limits = { ...s.limits, ...data };
        return s.limits;
      },
    },
    payment: {
      findMany: async () => s.payments.map((p) => ({ amount: p.amount, createdAt: p.createdAt })),
      aggregate: async () => ({ _sum: { amount: s.payments.reduce((a, p) => a + p.amount, 0) } }),
    },
    order: { aggregate: async () => ({ _sum: { totalCharged: s.spend } }) },
    orderWin: { aggregate: async () => ({ _sum: { amount: s.prizes } }) },
    user: { findUnique: async () => ({ status: 'active', walletBalance: 0 }) },
    auditLog: { create: async ({ data }: any) => void s.audit.push(data) },
  };
  function baseRow() {
    return {
      depositDaily: null,
      depositWeekly: null,
      depositMonthly: null,
      lossMonthly: null,
      pending: {},
      selfExcludedUntil: null,
      selfExcludedPermanent: false,
      selfExcludedAt: null,
    };
  }
  return { s, fake, baseRow };
});

vi.mock('../../src/prisma.js', () => ({ prisma: h.fake }));

import {
  applyMatured,
  assertCanPlaceOrder,
  assertDepositAllowed,
  getActivitySummary,
  getLimits,
  liftPermanentExclusion,
  planLimitUpdate,
  selfExclude,
  updateLimits,
  valuesOf,
} from '../../src/modules/limits/limits.service.js';
import { createCheckout } from '../../src/modules/payments/payments.service.js';
import { config } from '../../src/config.js';

const NOW = new Date('2026-11-12T12:00:00Z');
const hoursAfter = (n: number) => new Date(NOW.getTime() + n * 3_600_000);
const DELAY = config.RG_LIMIT_INCREASE_DELAY_HOURS;

beforeEach(() => {
  h.s.limits = null;
  h.s.payments = [];
  h.s.spend = 0;
  h.s.prizes = 0;
  h.s.audit = [];
});

describe('limit changes: decrease now, increase after the delay', () => {
  it('a decrease applies immediately', async () => {
    h.s.limits = { ...h.baseRow(), depositDaily: 500 };
    const view = await updateLimits('u1', { depositDaily: 200 }, NOW);
    expect(view.depositDaily).toBe(200);
    expect(view.pending).toEqual({});
  });

  it('setting a first limit applies immediately', async () => {
    const view = await updateLimits('u1', { lossMonthly: 1000 }, NOW);
    expect(view.lossMonthly).toBe(1000);
  });

  it('an increase is parked and applies only after the delay', async () => {
    h.s.limits = { ...h.baseRow(), depositDaily: 200 };
    const view = await updateLimits('u1', { depositDaily: 800 }, NOW);
    expect(view.depositDaily).toBe(200);
    expect(view.pending.depositDaily).toEqual({ value: 800, effectiveAt: hoursAfter(DELAY).toISOString() });

    // just before the delay ends: still 200
    expect((await getLimits('u1', new Date(hoursAfter(DELAY).getTime() - 1))).depositDaily).toBe(200);
    // once it has passed: 800, and the pending entry is gone
    const later = await getLimits('u1', hoursAfter(DELAY));
    expect(later.depositDaily).toBe(800);
    expect(later.pending).toEqual({});
  });

  it('removing a limit also waits for the delay', async () => {
    h.s.limits = { ...h.baseRow(), depositWeekly: 300 };
    const view = await updateLimits('u1', { depositWeekly: null }, NOW);
    expect(view.depositWeekly).toBe(300);
    expect(view.pending.depositWeekly?.value).toBeNull();
    expect((await getLimits('u1', hoursAfter(DELAY + 1))).depositWeekly).toBeNull();
  });

  it('a decrease cancels a pending increase for that limit', () => {
    const plan = planLimitUpdate(
      { values: { ...valuesOf(null), depositDaily: 200 }, pending: { depositDaily: { value: 900, effectiveAt: hoursAfter(5).toISOString() } } },
      { depositDaily: 100 },
      NOW,
      DELAY,
    );
    expect(plan.values.depositDaily).toBe(100);
    expect(plan.pending).toEqual({});
  });

  it('re-requesting the same increase does not restart the timer', () => {
    const first = { depositDaily: { value: 900, effectiveAt: hoursAfter(DELAY).toISOString() } };
    const plan = planLimitUpdate(
      { values: { ...valuesOf(null), depositDaily: 200 }, pending: first },
      { depositDaily: 900 },
      hoursAfter(10),
      DELAY,
    );
    expect(plan.pending).toEqual(first);
  });

  it('applyMatured leaves unmatured changes alone', () => {
    const out = applyMatured(
      { ...valuesOf(null), depositDaily: 100 },
      { depositDaily: { value: 900, effectiveAt: hoursAfter(3).toISOString() } },
      NOW,
    );
    expect(out.values.depositDaily).toBe(100);
    expect(out.pending.depositDaily).toBeDefined();
  });
});

describe('deposit limit blocks checkout', () => {
  it('createCheckout returns 422 DEPOSIT_LIMIT with the remaining amount and the period', async () => {
    h.s.limits = { ...h.baseRow(), depositDaily: 500 };
    h.s.payments = [{ amount: 400, createdAt: new Date(Date.now() - 3_600_000), status: 'approved' }];

    await expect(createCheckout('u1', 150)).rejects.toMatchObject({
      statusCode: 422,
      code: 'DEPOSIT_LIMIT',
      details: { period: 'daily', limit: '500.00', remaining: '100.00' },
    });
  });

  it('allows a deposit that fits, and ignores payments outside the window', async () => {
    h.s.limits = { ...h.baseRow(), depositDaily: 500 };
    // 3 days old: counts toward weekly/monthly (not set) but not the daily window
    h.s.payments = [{ amount: 450, createdAt: new Date(NOW.getTime() - 3 * 86_400_000), status: 'approved' }];
    await expect(assertDepositAllowed('u1', 500, NOW)).resolves.toBeUndefined();
    await expect(assertDepositAllowed('u1', 500.01, NOW)).rejects.toMatchObject({ code: 'DEPOSIT_LIMIT' });
  });

  it('reports the tightest period when several are exceeded', async () => {
    h.s.limits = { ...h.baseRow(), depositDaily: 1000, depositWeekly: 600 };
    h.s.payments = [{ amount: 500, createdAt: new Date(NOW.getTime() - 2 * 86_400_000), status: 'approved' }];
    await expect(assertDepositAllowed('u1', 300, NOW)).rejects.toMatchObject({
      details: { period: 'weekly', remaining: '100.00' },
    });
  });

  it('a limit that is still pending does not apply yet', async () => {
    h.s.limits = {
      ...h.baseRow(),
      depositDaily: 500,
      pending: { depositDaily: { value: 2000, effectiveAt: hoursAfter(5).toISOString() } },
    };
    await expect(assertDepositAllowed('u1', 1000, NOW)).rejects.toMatchObject({ code: 'DEPOSIT_LIMIT' });
    await expect(assertDepositAllowed('u1', 1000, hoursAfter(6))).resolves.toBeUndefined();
  });
});

describe('loss limit blocks orders', () => {
  it('losses are paid orders minus prizes in the rolling period', async () => {
    h.s.limits = { ...h.baseRow(), lossMonthly: 500 };
    h.s.spend = 600;
    h.s.prizes = 250; // net loss 350, 150 left
    await expect(assertCanPlaceOrder('u1', 150, NOW)).resolves.toBeUndefined();
    await expect(assertCanPlaceOrder('u1', 150.01, NOW)).rejects.toMatchObject({
      statusCode: 422,
      code: 'LOSS_LIMIT',
      details: { remaining: '150.00', limit: '500.00' },
    });
  });

  it('prizes larger than the spend count as no loss, not a negative one', async () => {
    h.s.limits = { ...h.baseRow(), lossMonthly: 100 };
    h.s.spend = 50;
    h.s.prizes = 5000;
    await expect(assertCanPlaceOrder('u1', 100, NOW)).resolves.toBeUndefined();
  });

  it('no limit set, no check', async () => {
    h.s.spend = 99999;
    await expect(assertCanPlaceOrder('u1', 100, NOW)).resolves.toBeUndefined();
  });
});

describe('self-exclusion', () => {
  it('blocks orders and deposits with 403 SELF_EXCLUDED', async () => {
    await selfExclude('u1', '24h', NOW);
    await expect(assertCanPlaceOrder('u1', 10, hoursAfter(1))).rejects.toMatchObject({ statusCode: 403, code: 'SELF_EXCLUDED' });
    await expect(assertDepositAllowed('u1', 10, hoursAfter(1))).rejects.toMatchObject({ statusCode: 403, code: 'SELF_EXCLUDED' });
    // …and ends by itself
    await expect(assertCanPlaceOrder('u1', 10, hoursAfter(25))).resolves.toBeUndefined();
    expect(h.s.audit.some((a) => a.action === 'self_exclusion:set')).toBe(true);
  });

  it('POST /payments/checkout is refused for a permanently excluded user', async () => {
    await selfExclude('u1', 'permanent', NOW);
    await expect(createCheckout('u1', 10)).rejects.toMatchObject({ statusCode: 403, code: 'SELF_EXCLUDED' });
  });

  it('periods: 7d, 30d, 6m and permanent', async () => {
    await selfExclude('u1', '7d', NOW);
    expect(h.s.limits.selfExcludedUntil.toISOString()).toBe('2026-11-19T12:00:00.000Z');
    await selfExclude('u1', '30d', NOW);
    expect(h.s.limits.selfExcludedUntil.toISOString()).toBe('2026-12-12T12:00:00.000Z');
    await selfExclude('u1', '6m', NOW);
    expect(h.s.limits.selfExcludedUntil.toISOString()).toBe('2027-05-12T12:00:00.000Z');
    await selfExclude('u1', 'permanent', NOW);
    expect(h.s.limits.selfExcludedPermanent).toBe(true);
  });

  it('cannot be shortened or cancelled', async () => {
    await selfExclude('u1', '30d', NOW);
    await expect(selfExclude('u1', '24h', hoursAfter(1))).rejects.toMatchObject({
      statusCode: 409,
      code: 'SELF_EXCLUSION_CANNOT_SHORTEN',
    });
    await selfExclude('u1', 'permanent', hoursAfter(2));
    await expect(selfExclude('u1', '6m', hoursAfter(3))).rejects.toMatchObject({ code: 'SELF_EXCLUSION_CANNOT_SHORTEN' });
    // limits updates do not touch it either
    await updateLimits('u1', { depositDaily: 100 }, hoursAfter(4));
    expect(h.s.limits.selfExcludedPermanent).toBe(true);
  });

  it('an admin lifts a permanent exclusion only after 6 months, with a reason, audited', async () => {
    await selfExclude('u1', 'permanent', NOW);
    const fiveMonths = new Date(NOW.getTime() + 150 * 86_400_000);
    await expect(liftPermanentExclusion('u1', 'admin1', 'asked', fiveMonths)).rejects.toMatchObject({
      statusCode: 403,
      code: 'EXCLUSION_LIFT_TOO_EARLY',
    });

    const sevenMonths = new Date(NOW.getTime() + 213 * 86_400_000);
    await liftPermanentExclusion('u1', 'admin1', 'cooling-off complete, user request', sevenMonths);
    expect(h.s.limits.selfExcludedPermanent).toBe(false);
    await expect(assertCanPlaceOrder('u1', 10, sevenMonths)).resolves.toBeUndefined();
    expect(h.s.audit.at(-1)).toMatchObject({
      action: 'self_exclusion:lifted',
      actorId: 'admin1',
      actorType: 'admin',
      metadata: { reason: 'cooling-off complete, user request' },
    });
  });

  it('only a permanent exclusion can be lifted', async () => {
    await selfExclude('u1', '30d', NOW);
    await expect(liftPermanentExclusion('u1', 'admin1', 'please', hoursAfter(24 * 400))).rejects.toMatchObject({
      code: 'NOT_PERMANENTLY_EXCLUDED',
    });
  });
});

describe('reality check', () => {
  it('summarises deposits, spend and prizes for the last 30 days', async () => {
    h.s.payments = [{ amount: 300, createdAt: NOW, status: 'approved' }];
    h.s.spend = 120;
    h.s.prizes = 20;
    await expect(getActivitySummary('u1', NOW)).resolves.toMatchObject({
      days: 30,
      deposits: '300.00',
      spend: '120.00',
      prizes: '20.00',
      net: '-100.00',
    });
  });
});
