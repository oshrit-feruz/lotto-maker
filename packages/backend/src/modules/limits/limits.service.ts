import { Decimal } from 'decimal.js';
import { prisma } from '../../prisma.js';
import { config } from '../../config.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLogTx } from '../../lib/audit-log.js';
import type { Tx } from '../wallet/wallet.service.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A checkout that has not been confirmed yet still counts against the limit for this long. */
const PENDING_DEPOSIT_COUNTS_MS = HOUR_MS;
/** A permanent self-exclusion can be lifted by an admin only after this long. */
export const PERMANENT_EXCLUSION_MIN_DAYS = 182; // 6 months
export const ACTIVITY_WINDOW_DAYS = 30;

export const LIMIT_KEYS = ['depositDaily', 'depositWeekly', 'depositMonthly', 'lossMonthly'] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
export type LimitValues = Record<LimitKey, number | null>;
export type PendingChanges = Partial<Record<LimitKey, { value: number | null; effectiveAt: string }>>;

export const EXCLUSION_PERIODS = ['24h', '7d', '30d', '6m', 'permanent'] as const;
export type ExclusionPeriod = (typeof EXCLUSION_PERIODS)[number];

const DEPOSIT_WINDOWS: Array<{ key: LimitKey; period: 'daily' | 'weekly' | 'monthly'; ms: number }> = [
  { key: 'depositDaily', period: 'daily', ms: DAY_MS },
  { key: 'depositWeekly', period: 'weekly', ms: 7 * DAY_MS },
  { key: 'depositMonthly', period: 'monthly', ms: 30 * DAY_MS },
];

interface LimitsRow {
  depositDaily: { toString(): string } | null;
  depositWeekly: { toString(): string } | null;
  depositMonthly: { toString(): string } | null;
  lossMonthly: { toString(): string } | null;
  pending: unknown;
  selfExcludedUntil: Date | null;
  selfExcludedPermanent: boolean;
  selfExcludedAt: Date | null;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

const num = (v: { toString(): string } | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v.toString());

export function valuesOf(row: LimitsRow | null): LimitValues {
  return {
    depositDaily: num(row?.depositDaily),
    depositWeekly: num(row?.depositWeekly),
    depositMonthly: num(row?.depositMonthly),
    lossMonthly: num(row?.lossMonthly),
  };
}

export function pendingOf(row: LimitsRow | null): PendingChanges {
  const raw = row?.pending;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as PendingChanges) } : {};
}

/** Folds pending changes whose time has come into the values. */
export function applyMatured(
  values: LimitValues,
  pending: PendingChanges,
  now: Date,
): { values: LimitValues; pending: PendingChanges } {
  const nextValues = { ...values };
  const nextPending: PendingChanges = { ...pending };
  for (const key of LIMIT_KEYS) {
    const p = pending[key];
    if (p && new Date(p.effectiveAt).getTime() <= now.getTime()) {
      nextValues[key] = p.value;
      delete nextPending[key];
    }
  }
  return { values: nextValues, pending: nextPending };
}

/**
 * Lowering (or setting a first limit) applies now. Raising or removing parks the change until
 * `now + delayHours`. Asking for the current value cancels a pending change.
 */
export function planLimitUpdate(
  current: { values: LimitValues; pending: PendingChanges },
  input: Partial<LimitValues>,
  now: Date,
  delayHours: number,
): { values: LimitValues; pending: PendingChanges } {
  const values = { ...current.values };
  const pending: PendingChanges = { ...current.pending };
  const effectiveAt = new Date(now.getTime() + delayHours * HOUR_MS).toISOString();

  for (const key of LIMIT_KEYS) {
    const target = input[key];
    if (target === undefined) continue;
    const cur = values[key];
    if (target === cur) {
      delete pending[key];
    } else if (target !== null && (cur === null || target < cur)) {
      values[key] = target;
      delete pending[key];
    } else if (pending[key]?.value !== target) {
      pending[key] = { value: target, effectiveAt };
    }
  }
  return { values, pending };
}

export function exclusionUntil(period: ExclusionPeriod, now: Date): Date | null {
  switch (period) {
    case '24h':
      return new Date(now.getTime() + DAY_MS);
    case '7d':
      return new Date(now.getTime() + 7 * DAY_MS);
    case '30d':
      return new Date(now.getTime() + 30 * DAY_MS);
    case '6m': {
      // Same day six calendar months on, clamped to the last day of that month
      // (31 Aug -> 28/29 Feb, not 2/3 Mar), at the same time of day.
      const targetMonth = now.getUTCMonth() + 6;
      const lastDay = new Date(Date.UTC(now.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
      const d = new Date(now.getTime());
      d.setUTCDate(1);
      d.setUTCMonth(targetMonth);
      d.setUTCDate(Math.min(now.getUTCDate(), lastDay));
      return d;
    }
    case 'permanent':
      return null;
  }
}

export function isSelfExcluded(row: LimitsRow | null, now: Date): boolean {
  if (!row) return false;
  if (row.selfExcludedPermanent) return true;
  return row.selfExcludedUntil !== null && row.selfExcludedUntil.getTime() > now.getTime();
}

// ─── Reads ───────────────────────────────────────────────────────────────────

type Db = Pick<Tx, 'userLimits' | 'payment' | 'order' | 'orderWin'>;

async function loadRow(db: Db, userId: string): Promise<LimitsRow | null> {
  return (await db.userLimits.findUnique({ where: { userId } })) as LimitsRow | null;
}

/**
 * Serializes everything that reads or changes one user's limits and self-exclusion: these
 * writers, the order charge and the webhook credit all lock the same User row, so a check and
 * the write it guards cannot interleave with a concurrent change.
 *
 * Writers also bump `updatedAt`: a SERIALIZABLE transaction (the order charge) whose snapshot
 * predates this change then fails on its own `FOR UPDATE` of the row instead of acting on the
 * stale limits it read.
 */
export async function lockUserForLimitChangeTx(tx: Tx, userId: string): Promise<void> {
  const n = await tx.$executeRaw`UPDATE "User" SET "updatedAt" = NOW() WHERE id = ${userId}`;
  if (n === 0) throw new AppError(404, 'USER_NOT_FOUND');
}

function viewOf(row: LimitsRow | null, now: Date) {
  const { values, pending } = applyMatured(valuesOf(row), pendingOf(row), now);
  const excluded = isSelfExcluded(row, now);
  return {
    ...values,
    pending,
    selfExclusion: {
      active: excluded,
      permanent: row?.selfExcludedPermanent ?? false,
      until: row?.selfExcludedPermanent ? null : excluded ? row!.selfExcludedUntil : null,
    },
  };
}

export async function getLimits(userId: string, now = new Date()) {
  return viewOf(await loadRow(prisma, userId), now);
}

export async function updateLimits(userId: string, input: Partial<LimitValues>, now = new Date()) {
  return prisma.$transaction(async (tx: Tx) => {
    await lockUserForLimitChangeTx(tx, userId);
    // Re-read under the lock, so a concurrent change to another limit is not overwritten
    const row = await loadRow(tx, userId);
    const folded = applyMatured(valuesOf(row), pendingOf(row), now);
    const plan = planLimitUpdate(folded, input, now, config.RG_LIMIT_INCREASE_DELAY_HOURS);

    const data = { ...plan.values, pending: plan.pending as object };
    const saved = (await tx.userLimits.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })) as LimitsRow;

    await writeAuditLogTx(tx, {
      entityType: 'user',
      entityId: userId,
      action: 'limits:updated',
      actorId: userId,
      actorType: 'user',
      metadata: { requested: input, applied: plan.values, pending: plan.pending },
    });
    return viewOf(saved, now);
  });
}

// ─── Enforcement ─────────────────────────────────────────────────────────────

function assertNotExcluded(row: LimitsRow | null, now: Date): void {
  if (isSelfExcluded(row, now)) {
    throw new AppError(403, 'SELF_EXCLUDED', 'Your account is self-excluded', {
      permanent: row!.selfExcludedPermanent,
      until: row!.selfExcludedPermanent ? null : row!.selfExcludedUntil,
    });
  }
}

/** Called by POST /payments/checkout. Withdrawals and login never call this. */
export async function assertDepositAllowed(userId: string, amount: Decimal.Value, now = new Date()): Promise<void> {
  return checkDeposit(prisma, userId, amount, now);
}

/**
 * The same check when the webhook credits a deposit. The caller holds the User row lock and
 * passes the payment being credited, which counts once: as `amount`, not again as a payment.
 * Only money actually credited (approved payments) counts here: another checkout that is still
 * pending may never be paid, and is checked again when its own webhook lands.
 */
export async function assertDepositAllowedTx(
  tx: Tx,
  userId: string,
  amount: Decimal.Value,
  opts: { excludePaymentId: string; now?: Date },
): Promise<void> {
  return checkDeposit(tx, userId, amount, opts.now ?? new Date(), opts.excludePaymentId);
}

async function checkDeposit(
  db: Db,
  userId: string,
  amount: Decimal.Value,
  now: Date,
  excludePaymentId?: string,
): Promise<void> {
  const row = await loadRow(db, userId);
  assertNotExcluded(row, now);

  const { values } = applyMatured(valuesOf(row), pendingOf(row), now);
  const active = DEPOSIT_WINDOWS.filter((w) => values[w.key] !== null);
  if (active.length === 0) return;

  const since = new Date(now.getTime() - 30 * DAY_MS);
  const payments = (await db.payment.findMany({
    where: {
      userId,
      createdAt: { gte: since },
      ...(excludePaymentId
        ? { id: { not: excludePaymentId }, status: 'approved' as const }
        : {
            OR: [
              { status: 'approved' as const },
              { status: 'pending' as const, createdAt: { gte: new Date(now.getTime() - PENDING_DEPOSIT_COUNTS_MS) } },
            ],
          }),
    },
    select: { amount: true, createdAt: true },
  })) as Array<{ amount: { toString(): string }; createdAt: Date }>;

  let worst: { period: string; limit: number; remaining: Decimal } | null = null;
  for (const w of active) {
    const limit = values[w.key]!;
    const from = now.getTime() - w.ms;
    const used = payments
      .filter((p) => p.createdAt.getTime() > from)
      .reduce((s, p) => s.plus(p.amount.toString()), new Decimal(0));
    const remaining = Decimal.max(new Decimal(limit).minus(used), 0);
    if (new Decimal(amount).gt(remaining) && (!worst || remaining.lt(worst.remaining))) {
      worst = { period: w.period, limit, remaining };
    }
  }
  if (worst) {
    throw new AppError(422, 'DEPOSIT_LIMIT', 'This deposit exceeds your deposit limit', {
      period: worst.period,
      limit: worst.limit.toFixed(2),
      remaining: worst.remaining.toFixed(2),
    });
  }
}

/** Spend, prizes and deposits over the last `days`, for the loss limit and the reality check. */
async function activityTotals(db: Db, userId: string, since: Date) {
  const [spend, prizes, deposits] = await Promise.all([
    db.order.aggregate({
      _sum: { totalCharged: true },
      where: { userId, createdAt: { gte: since }, status: { notIn: ['refunded', 'cancelled'] } },
    }),
    db.orderWin.aggregate({
      _sum: { amount: true },
      where: { order: { userId, createdAt: { gte: since } } },
    }),
    db.payment.aggregate({
      _sum: { amount: true },
      where: { userId, createdAt: { gte: since }, status: 'approved' },
    }),
  ]);
  return {
    spend: new Decimal(spend._sum.totalCharged?.toString() ?? 0),
    prizes: new Decimal(prizes._sum.amount?.toString() ?? 0),
    deposits: new Decimal(deposits._sum.amount?.toString() ?? 0),
  };
}

/**
 * Called by POST /orders with the full price of the order(s) about to be placed: early, so a
 * refused order does no other work. assertCanPlaceOrderTx repeats it inside the charge.
 */
export async function assertCanPlaceOrder(userId: string, orderTotal: Decimal.Value, now = new Date()): Promise<void> {
  return checkOrder(prisma, userId, orderTotal, now);
}

/**
 * The authoritative check, inside the charging transaction after its `FOR UPDATE` of the User
 * row: two concurrent orders cannot both fit into the same remaining loss limit, and an
 * exclusion committed before the charge is seen.
 */
export async function assertCanPlaceOrderTx(tx: Tx, userId: string, orderTotal: Decimal.Value, now = new Date()): Promise<void> {
  return checkOrder(tx, userId, orderTotal, now);
}

async function checkOrder(db: Db, userId: string, orderTotal: Decimal.Value, now: Date): Promise<void> {
  const row = await loadRow(db, userId);
  assertNotExcluded(row, now);

  const { values } = applyMatured(valuesOf(row), pendingOf(row), now);
  if (values.lossMonthly === null) return;

  const { spend, prizes } = await activityTotals(db, userId, new Date(now.getTime() - 30 * DAY_MS));
  // Losses = what was paid for orders minus what they won, in the rolling 30 days
  const loss = Decimal.max(spend.minus(prizes), 0);
  const remaining = Decimal.max(new Decimal(values.lossMonthly).minus(loss), 0);
  if (new Decimal(orderTotal).gt(remaining)) {
    throw new AppError(422, 'LOSS_LIMIT', 'This order exceeds your monthly loss limit', {
      period: 'monthly',
      limit: values.lossMonthly.toFixed(2),
      remaining: remaining.toFixed(2),
    });
  }
}

// ─── Self-exclusion ──────────────────────────────────────────────────────────

export async function selfExclude(userId: string, period: ExclusionPeriod, now = new Date()) {
  return prisma.$transaction(async (tx: Tx) => {
    // Under the lock, so a concurrent shorter request cannot overwrite a longer one it did not see
    await lockUserForLimitChangeTx(tx, userId);
    const row = await loadRow(tx, userId);
    if (row?.selfExcludedPermanent) {
      throw new AppError(409, 'SELF_EXCLUSION_CANNOT_SHORTEN', 'A permanent exclusion cannot be changed');
    }
    const until = exclusionUntil(period, now);
    // Only ever extend: a request that would end earlier than the current exclusion is refused
    if (until !== null && row?.selfExcludedUntil && row.selfExcludedUntil.getTime() > until.getTime()) {
      throw new AppError(409, 'SELF_EXCLUSION_CANNOT_SHORTEN', 'An active exclusion cannot be shortened or cancelled');
    }

    const permanent = until === null;
    const data = {
      selfExcludedUntil: until,
      selfExcludedPermanent: permanent,
      selfExcludedAt: now,
    };
    const saved = (await tx.userLimits.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })) as LimitsRow;

    await writeAuditLogTx(tx, {
      entityType: 'user',
      entityId: userId,
      action: 'self_exclusion:set',
      actorId: userId,
      actorType: 'user',
      metadata: { period, until: until?.toISOString() ?? 'permanent' },
    });
    return viewOf(saved, now).selfExclusion;
  });
}

/** Admin: lifts a permanent exclusion, only 6 months after it was set, with a reason. Audited. */
export async function liftPermanentExclusion(userId: string, adminId: string, rawReason: string, now = new Date()) {
  const reason = rawReason.trim();
  if (reason.length < 2) throw new AppError(400, 'REASON_REQUIRED', 'A reason is required');
  return prisma.$transaction(async (tx: Tx) => {
    await lockUserForLimitChangeTx(tx, userId);
    const row = await loadRow(tx, userId);
    if (!row?.selfExcludedPermanent) throw new AppError(409, 'NOT_PERMANENTLY_EXCLUDED');

    const since = row.selfExcludedAt;
    const eligibleAt = since ? new Date(since.getTime() + PERMANENT_EXCLUSION_MIN_DAYS * DAY_MS) : null;
    if (!eligibleAt || eligibleAt.getTime() > now.getTime()) {
      throw new AppError(403, 'EXCLUSION_LIFT_TOO_EARLY', 'A permanent exclusion can be lifted after 6 months', {
        eligibleAt,
      });
    }

    // The lift and its audit entry commit together, or neither does
    await tx.userLimits.update({
      where: { userId },
      data: { selfExcludedPermanent: false, selfExcludedUntil: null, selfExcludedAt: null },
    });
    await writeAuditLogTx(tx, {
      entityType: 'user',
      entityId: userId,
      action: 'self_exclusion:lifted',
      actorId: adminId,
      actorType: 'admin',
      metadata: { reason, excludedSince: since?.toISOString() },
    });
    return { userId, lifted: true };
  });
}

// ─── Reality check ───────────────────────────────────────────────────────────

export async function getActivitySummary(userId: string, now = new Date()) {
  const from = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS);
  const { spend, prizes, deposits } = await activityTotals(prisma, userId, from);
  return {
    days: ACTIVITY_WINDOW_DAYS,
    from,
    to: now,
    deposits: deposits.toFixed(2),
    spend: spend.toFixed(2),
    prizes: prizes.toFixed(2),
    // Positive: the user is up; negative: the user is down
    net: prizes.minus(spend).toFixed(2),
  };
}
