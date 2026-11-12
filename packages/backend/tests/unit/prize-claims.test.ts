import { describe, it, expect, vi, beforeEach } from 'vitest';

const fake = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('./helpers/fake-money.js').createFakeMoney>,
  sendToUser: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}));

vi.mock('../../src/prisma.js', async () => {
  const { createFakeMoney } = await import('./helpers/fake-money.js');
  fake.db = createFakeMoney();
  return { prisma: fake.db.client };
});

vi.mock('../../src/services/notifications.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/notifications.js')>();
  const { vi: viInner } = await import('vitest');
  fake.sendToUser = viInner.fn().mockResolvedValue(undefined);
  return { ...actual, notificationService: { sendToUser: fake.sendToUser } };
});

import {
  collectClaim,
  expireClaims,
  listUserClaims,
  runPrizeClaimJob,
  scheduleClaimAsAdmin,
  scheduleClaimAsUser,
  sendExpiryReminders,
} from '../../src/modules/prize-claims/prize-claims.service.js';
import { claimExpiry } from '../../src/lib/prize-claim.js';
import { config } from '../../src/config.js';

const USER = 'user-1';
const ADMIN = 'admin-1';
const DAY = 24 * 60 * 60 * 1000;

async function addClaim(fields: Record<string, unknown> = {}) {
  return fake.db.client.prizeClaim.create({
    data: {
      orderId: `order-${Math.random()}`,
      userId: USER,
      amount: '5000.00',
      expiresAt: new Date(Date.now() + 100 * DAY),
      ...fields,
    },
  });
}

beforeEach(() => {
  fake.db.reset();
  fake.sendToUser.mockClear();
  fake.db.addUser(USER, { idLast4: '1234', fullName: 'Dana Levi', verifiedAdult: true });
});

describe('claim expiry date', () => {
  it('is the draw date plus the retention period (default 182 days)', () => {
    const drawAt = new Date('2026-06-01T17:00:00Z');
    expect(config.PRIZE_CLAIM_RETENTION_DAYS).toBe(182);
    expect(claimExpiry(drawAt).getTime()).toBe(drawAt.getTime() + 182 * DAY);
  });
});

describe('collect', () => {
  it('collects with the right ID last 4 and records who handed it over', async () => {
    const claim = await addClaim();
    const result = await collectClaim(claim.id, ADMIN, '1234');

    expect(result.status).toBe('collected');
    expect(claim).toMatchObject({ status: 'collected', collectedByAdminId: ADMIN, idCheckedLast4: '1234' });
    expect(claim.collectedAt).toBeInstanceOf(Date);
    expect(fake.db.auditActions()).toContain('prize_claim:awaiting_pickup->collected');
  });

  it('refuses the wrong ID last 4, changes nothing and audits the attempt', async () => {
    const claim = await addClaim();
    await expect(collectClaim(claim.id, ADMIN, '9999')).rejects.toMatchObject({ statusCode: 422, code: 'ID_MISMATCH' });

    expect(claim).toMatchObject({ status: 'awaiting_pickup', collectedByAdminId: null, idCheckedLast4: null });
    expect(fake.db.auditActions()).toContain('prize_claim:collect_id_mismatch');
    // and the right one still works afterwards
    await expect(collectClaim(claim.id, ADMIN, '1234')).resolves.toMatchObject({ status: 'collected' });
  });

  it('refuses when the claimant has no ID on file', async () => {
    fake.db.users.get(USER).idLast4 = null;
    const claim = await addClaim();
    await expect(collectClaim(claim.id, ADMIN, '1234')).rejects.toMatchObject({ code: 'ID_NOT_ON_FILE' });
    expect(claim.status).toBe('awaiting_pickup');
  });

  it('collects a scheduled claim, but only once', async () => {
    const claim = await addClaim({ status: 'scheduled', scheduledAt: new Date(Date.now() + DAY) });
    await collectClaim(claim.id, ADMIN, '1234');
    await expect(collectClaim(claim.id, 'admin-2', '1234')).rejects.toMatchObject({ code: 'CLAIM_ALREADY_COLLECTED' });
    expect(claim.collectedByAdminId).toBe(ADMIN);
  });

  it('refuses an expired claim, even before the daily job has marked it', async () => {
    const claim = await addClaim({ expiresAt: new Date(Date.now() - 1000) });
    await expect(collectClaim(claim.id, ADMIN, '1234')).rejects.toMatchObject({ code: 'CLAIM_EXPIRED' });
    expect(claim.status).toBe('awaiting_pickup');
  });

  it('404 for an unknown claim', async () => {
    await expect(collectClaim('nope', ADMIN, '1234')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('schedule', () => {
  it('the user picks a slot: awaiting_pickup -> scheduled', async () => {
    const claim = await addClaim();
    const slot = new Date(Date.now() + 3 * DAY);
    const result = await scheduleClaimAsUser(USER, claim.id, slot);
    expect(result).toMatchObject({ status: 'scheduled', scheduledAt: slot });
    expect(fake.db.auditActions()).toContain('prize_claim:awaiting_pickup->scheduled');
  });

  it('the slot can be changed while scheduled', async () => {
    const claim = await addClaim();
    await scheduleClaimAsUser(USER, claim.id, new Date(Date.now() + 3 * DAY));
    const later = new Date(Date.now() + 5 * DAY);
    await scheduleClaimAsAdmin(claim.id, ADMIN, later);
    expect(claim.scheduledAt).toEqual(later);
  });

  it('rejects a slot in the past or after expiry', async () => {
    const claim = await addClaim({ expiresAt: new Date(Date.now() + 10 * DAY) });
    await expect(scheduleClaimAsUser(USER, claim.id, new Date(Date.now() - 1000))).rejects.toMatchObject({ code: 'INVALID_SLOT' });
    await expect(scheduleClaimAsUser(USER, claim.id, new Date(Date.now() + 11 * DAY))).rejects.toMatchObject({ code: 'INVALID_SLOT' });
    expect(claim.status).toBe('awaiting_pickup');
  });

  it("a user cannot schedule someone else's claim, nor a collected one", async () => {
    const claim = await addClaim();
    await expect(scheduleClaimAsUser('intruder', claim.id, new Date(Date.now() + DAY))).rejects.toMatchObject({ statusCode: 404 });
    claim.status = 'collected';
    await expect(scheduleClaimAsUser(USER, claim.id, new Date(Date.now() + DAY))).rejects.toMatchObject({ code: 'CLAIM_NOT_OPEN' });
  });

  it('lists only the own claims', async () => {
    await addClaim();
    await addClaim({ userId: 'other' });
    const list = await listUserClaims(USER);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ amount: '5000.00', status: 'awaiting_pickup' });
  });
});

describe('daily job: expiry', () => {
  it('marks unclaimed past-expiry claims expired, audits them and deletes nothing', async () => {
    const old = await addClaim({ expiresAt: new Date(Date.now() - DAY) });
    const oldScheduled = await addClaim({ status: 'scheduled', expiresAt: new Date(Date.now() - DAY) });
    const fresh = await addClaim();
    const collected = await addClaim({ status: 'collected', expiresAt: new Date(Date.now() - DAY) });

    expect(await expireClaims()).toBe(2);

    expect(old.status).toBe('expired');
    expect(oldScheduled.status).toBe('expired');
    expect(fresh.status).toBe('awaiting_pickup');
    expect(collected.status).toBe('collected');
    expect(fake.db.prizeClaim).toHaveLength(4);
    expect(fake.db.auditActions().filter((a) => a.endsWith('->expired')).sort()).toEqual([
      'prize_claim:awaiting_pickup->expired',
      'prize_claim:scheduled->expired',
    ]);
    expect(fake.db.auditLog.every((a) => a.actorType === 'system')).toBe(true);
  });

  it('running twice expires once', async () => {
    await addClaim({ expiresAt: new Date(Date.now() - DAY) });
    await expireClaims();
    expect(await expireClaims()).toBe(0);
    expect(fake.db.auditLog).toHaveLength(1);
  });
});

describe('daily job: 7-day reminder', () => {
  it('notifies once for a claim expiring within 7 days', async () => {
    const soon = await addClaim({ expiresAt: new Date(Date.now() + 6 * DAY) });
    await addClaim({ expiresAt: new Date(Date.now() + 30 * DAY) });

    expect(await sendExpiryReminders()).toBe(1);
    expect(fake.sendToUser).toHaveBeenCalledTimes(1);
    expect(fake.sendToUser).toHaveBeenCalledWith(USER, expect.objectContaining({ data: { type: 'PRIZE_CLAIM_EXPIRING' } }));
    expect(soon.reminderSentAt).toBeInstanceOf(Date);

    expect(await sendExpiryReminders()).toBe(0);
    expect(fake.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('does not remind about collected or already expired claims', async () => {
    await addClaim({ status: 'collected', expiresAt: new Date(Date.now() + 2 * DAY) });
    await addClaim({ expiresAt: new Date(Date.now() - DAY) });
    expect(await sendExpiryReminders()).toBe(0);
  });

  it('the job expires first, then reminds', async () => {
    await addClaim({ expiresAt: new Date(Date.now() - DAY) });
    await addClaim({ expiresAt: new Date(Date.now() + 2 * DAY) });
    expect(await runPrizeClaimJob()).toEqual({ expired: 1, reminded: 1 });
  });
});
