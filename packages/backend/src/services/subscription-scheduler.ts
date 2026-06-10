import cron from 'node-cron';
import { toZonedTime } from 'date-fns-tz';
import type { GameType, DrawDay } from '@lotto-maker/shared';
import { DRAW_DAY_TO_JS, TIMEZONE } from '@lotto-maker/shared';
import { prisma } from '../prisma.js';
import { createOrder } from '../modules/orders/orders.service.js';
import { getNextDrawInfo } from '../lib/draw-schedule.js';
import { notificationService, PAYLOADS } from './notifications.js';
import { AppError } from '../plugins/error-handler.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubRow = Awaited<ReturnType<typeof fetchSubscriptionsForGame>>[number];

// Error codes from createOrder that mean "capacity problem" (retriable later,
// but we still record a skipped event so the user is informed)
const CAPACITY_CODES = new Set([
  'QUEUE_FULL',
  'NO_OPERATORS',
  'NO_ACTIVE_LOCATIONS',
  'CUTOFF_PASSED',
]);

interface SkipOutcome {
  skipReason: string;
  shouldNotify: boolean;
}

// ─── Error classification ─────────────────────────────────────────────────────

function classifyError(err: unknown): SkipOutcome {
  if (err instanceof AppError) {
    if (err.code === 'INSUFFICIENT_BALANCE') {
      return { skipReason: 'insufficient_funds', shouldNotify: true };
    }
    if (CAPACITY_CODES.has(err.code)) {
      return { skipReason: 'capacity_exceeded', shouldNotify: true };
    }
    if (err.code === 'AGE_VERIFICATION_REQUIRED') {
      // createOrder checked KYC again — defensive, already guarded above
      return { skipReason: 'kyc_not_verified', shouldNotify: false };
    }
    if (err.code === 'ACCOUNT_SUSPENDED') {
      return { skipReason: 'account_suspended', shouldNotify: false };
    }
  }
  return { skipReason: 'error', shouldNotify: false };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function fetchSubscriptionsForGame(gameType: GameType, drawDay: DrawDay) {
  return prisma.subscription.findMany({
    where: {
      active: true,
      gameType,
      drawDays: { has: drawDay },
    },
    include: {
      user: { select: { verifiedAdult: true, status: true } },
    },
  });
}

// ─── Single-subscription processing ──────────────────────────────────────────

async function processOneSubscription(sub: SubRow, drawDate: Date): Promise<void> {
  // ── KYC guard ──────────────────────────────────────────────────────────────
  // Log and bail without recording an event; KYC failure is a config issue,
  // not a per-draw transient error.
  if (!sub.user.verifiedAdult) {
    console.warn(
      `[subscription-cron] sub ${sub.id}: skipping — user ${sub.userId} KYC not verified`,
    );
    return;
  }

  // ── Idempotency ────────────────────────────────────────────────────────────
  // A SubscriptionEvent already existing means the cron already ran for this
  // draw. A DB-level @@unique([subscriptionId, drawDate]) backs this up: even
  // if two cron instances race past this check, the second INSERT will fail
  // with P2002 (unique violation), which we catch below.
  const existing = await prisma.subscriptionEvent.findFirst({
    where: { subscriptionId: sub.id, drawDate },
    select: { id: true },
  });
  if (existing) return;

  // ── Order creation ─────────────────────────────────────────────────────────
  // All order logic (circuit breaker, wallet charge, queue slot, audit log)
  // lives in createOrder. We NEVER duplicate that logic here.
  try {
    const result = await createOrder({
      userId: sub.userId,
      gameType: sub.gameType,
      numbers: sub.numbers as number[],
      strongNumber: sub.strongNumber ?? undefined,
      type: 'subscription',
      subscriptionId: sub.id,
    });

    await prisma.subscriptionEvent.create({
      data: {
        subscriptionId: sub.id,
        orderId: result.orderId,
        drawDate,
        status: 'success',
      },
    });

    console.log(
      `[subscription-cron] sub ${sub.id}: order ${result.orderId} created for draw ${drawDate.toISOString()}`,
    );
  } catch (err) {
    const { skipReason, shouldNotify } = classifyError(err);

    try {
      await prisma.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          drawDate,
          status: 'skipped',
          skipReason,
        },
      });
    } catch (insertErr) {
      // Unique constraint violation means a concurrent cron run beat us —
      // the subscription was already processed.
      if ((insertErr as { code?: string }).code === 'P2002') return;
      throw insertErr;
    }

    if (shouldNotify) {
      const payload =
        skipReason === 'insufficient_funds'
          ? PAYLOADS.subscriptionInsufficientFunds(sub.gameType)
          : PAYLOADS.subscriptionCapacityExceeded(sub.gameType);
      await notificationService.sendToUser(sub.userId, payload);
    }

    if (skipReason === 'error') {
      console.error(`[subscription-cron] sub ${sub.id}: unexpected error:`, err);
    } else {
      console.log(
        `[subscription-cron] sub ${sub.id}: skipped (${skipReason}) for draw ${drawDate.toISOString()}`,
      );
    }
  }
}

// ─── Game-level processing ────────────────────────────────────────────────────

/**
 * Process all active subscriptions for one game type on one draw day.
 * Exported so tests can invoke it directly without touching the cron schedule.
 */
export async function processSubscriptionsForGame(
  gameType: GameType,
  drawDate: Date,
  drawDay: DrawDay,
): Promise<void> {
  const subscriptions = await fetchSubscriptionsForGame(gameType, drawDay);

  if (subscriptions.length === 0) return;

  console.log(
    `[subscription-cron] processing ${subscriptions.length} ${gameType} subscription(s) ` +
    `for draw ${drawDate.toISOString()}`,
  );

  const results = await Promise.allSettled(
    subscriptions.map((sub) => processOneSubscription(sub, drawDate)),
  );

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(
        `[subscription-cron] Unhandled rejection for sub ${subscriptions[i]!.id}:`,
        r.reason,
      );
    }
  });
}

// ─── Top-level cron entry point ───────────────────────────────────────────────

const GAME_TYPES: GameType[] = ['lotto', 'chance', 'seven77', 'one23'];

/**
 * Determine whether `now` is a draw day in Israel time, then process all
 * active subscriptions across all game types.
 * Accepts an optional `now` parameter so unit tests can pass a fixed date.
 */
export async function runSubscriptionCron(now = new Date()): Promise<void> {
  const nowInTz = toZonedTime(now, TIMEZONE);
  const jsDay = nowInTz.getDay();

  const todayDrawDay = (Object.entries(DRAW_DAY_TO_JS) as Array<[DrawDay, number]>).find(
    ([, d]) => d === jsDay,
  )?.[0];

  if (!todayDrawDay) {
    console.log(`[subscription-cron] ${now.toISOString()} is not a draw day, skipping`);
    return;
  }

  console.log(`[subscription-cron] starting for draw day ${todayDrawDay}`);

  await Promise.allSettled(
    GAME_TYPES.map(async (gameType) => {
      try {
        const drawInfo = getNextDrawInfo(gameType, now);
        // Safety: confirm getNextDrawInfo returned today's draw, not a future one
        const drawInTz = toZonedTime(drawInfo.drawTime, TIMEZONE);
        if (drawInTz.getDay() !== jsDay) {
          console.warn(
            `[subscription-cron] ${gameType}: next draw is on a different day — skipping`,
          );
          return;
        }
        await processSubscriptionsForGame(gameType, drawInfo.drawTime, todayDrawDay);
      } catch (err) {
        console.error(`[subscription-cron] ${gameType}: top-level error:`, err);
      }
    }),
  );
}

// ─── Cron scheduling ──────────────────────────────────────────────────────────

/**
 * Fire at 15:45 Israel time on Tue/Thu/Sat — 3 hours before the earliest
 * game hard cutoff (777 cutoff = 18:45 IL). All four games are processed
 * in the same run, so Lotto/Chance subscriptions are submitted 3–4 h early.
 */
export function startSubscriptionScheduler(): void {
  cron.schedule(
    '45 15 * * 2,4,6',
    () => { void runSubscriptionCron(); },
    { timezone: TIMEZONE },
  );
  console.log('[subscription-cron] scheduler registered (15:45 IL on draw days)');
}
