import cron from 'node-cron';
import { Decimal } from 'decimal.js';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { config } from '../../config.js';
import { orderStatusChange, orderStatusChangeTx, writeAuditLog } from '../../lib/audit-log.js';
import { notificationService, PAYLOADS } from '../../services/notifications.js';
import { creditPrizeTx } from '../wallet/wallet.service.js';
import { scoreOrder, totalOf } from '../../lib/settlement-math.js';
import type { PrizeTable, WinLine } from '../../lib/settlement-math.js';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const SETTLEABLE_ORDER_STATUSES = ['scanned', 'results_delayed'] as const;

export interface SettlementOrder {
  id: string;
  userId: string;
  extraDigits: number[];
  ticket: {
    type: 'regular' | 'double';
    systematicType: string | null;
    extra: boolean;
    tables: Array<{ numbers: number[]; strongNumbers: number[] }>;
  } | null;
}

export interface SettlementDraw {
  id: string;
  numbers: number[];
  strong: number | null;
  extraDigits: number[];
}

export type OrderOutcome =
  | { kind: 'skipped' }
  /** The ticket hit a tier with no prize amount on the draw. Left unsettled for an admin. */
  | { kind: 'needs_attention'; tiers: string[] }
  | { kind: 'lost' }
  | { kind: 'won_wallet'; total: Decimal }
  | { kind: 'won_claim'; total: Decimal };

/** Builds the game -> tier -> prize lookup from a draw's PrizeTier rows. */
export function buildPrizeTable(
  tiers: Array<{ game: 'lotto' | 'double' | 'extra'; tier: string; prizeAmount: { toString(): string } }>,
): PrizeTable {
  const table: PrizeTable = { lotto: {}, double: {}, extra: {} };
  for (const t of tiers) table[t.game][t.tier] = new Decimal(t.prizeAmount.toString());
  return table;
}

/**
 * Settles ONE order inside the caller's transaction. Idempotent: the status guard lets only the
 * first run move the order out of scanned/results_delayed, and everything it writes (wins, wallet
 * credit, claim, pending credit) happens in that same transaction, so a second run finds nothing to do.
 */
export async function settleOrderTx(
  tx: Tx,
  order: SettlementOrder,
  draw: SettlementDraw,
  prizes: PrizeTable,
): Promise<OrderOutcome> {
  let lines: WinLine[] = [];
  const unpriced = new Set<string>();
  if (order.ticket && draw.strong !== null) {
    lines = scoreOrder(
      {
        ticketType: order.ticket.type,
        systematicType: order.ticket.systematicType,
        tables: order.ticket.tables,
        extra: order.ticket.extra,
        extraDigits: order.extraDigits,
      },
      { numbers: draw.numbers, strong: draw.strong, extraDigits: draw.extraDigits },
      prizes,
      (game, tier) => unpriced.add(`${game}:${tier}`),
    );
  }
  // Never pay 0 for a hit: leave the order as it is (no writes) and flag the draw
  if (unpriced.size > 0) return { kind: 'needs_attention', tiers: [...unpriced] };
  const total = totalOf(lines);
  const won = total.gt(0);

  const { count } = await tx.order.updateMany({
    where: { id: order.id, status: { in: [...SETTLEABLE_ORDER_STATUSES] } },
    data: { status: won ? 'won' : 'lost' },
  });
  if (count === 0) return { kind: 'skipped' };

  await orderStatusChangeTx(tx, order.id, 'scanned', won ? 'won' : 'lost', 'system', 'system');
  if (!won) return { kind: 'lost' };

  await tx.orderWin.createMany({
    data: lines.map((l) => ({
      orderId: order.id,
      game: l.game,
      tier: l.tier,
      count: l.count,
      amount: l.amount.toFixed(2),
    })),
  });

  if (total.lte(config.SMALL_PRIZE_LIMIT)) {
    const { excess } = await creditPrizeTx(tx, order.userId, total, order.id);
    if (excess.gt(0)) {
      // TODO: pay the part that did not fit under the wallet cap out to the user's card
      await tx.pendingCardCredit.create({
        data: { orderId: order.id, userId: order.userId, amount: excess.toFixed(2) },
      });
    }
    return { kind: 'won_wallet', total };
  }

  // Above the limit: nothing is credited; the user collects it with the original ticket and ID
  await tx.prizeClaim.create({
    data: { orderId: order.id, userId: order.userId, amount: total.toFixed(2), status: 'awaiting_pickup' },
  });
  return { kind: 'won_claim', total };
}

/**
 * Settles a confirmed draw. Does nothing unless the draw is `results_confirmed`, so suggested
 * (scraped, unconfirmed) results never pay. Safe to run twice; then the draw becomes `settled`.
 */
export async function settleDraw(drawId: string): Promise<{ settled: boolean; processed: number }> {
  const draw = await prisma.draw.findUnique({ where: { id: drawId }, include: { prizeTiers: true } });
  if (!draw || draw.status !== 'results_confirmed' || draw.strong === null) {
    return { settled: false, processed: 0 };
  }

  const prizes = buildPrizeTable(draw.prizeTiers);
  const orders = await prisma.order.findMany({
    where: { drawId, status: { in: [...SETTLEABLE_ORDER_STATUSES] } },
    select: {
      id: true,
      userId: true,
      extraDigits: true,
      ticket: {
        select: {
          type: true,
          systematicType: true,
          extra: true,
          tables: { select: { numbers: true, strongNumbers: true }, orderBy: { position: 'asc' } },
        },
      },
    },
  });

  let processed = 0;
  let failed = 0;
  const attention = new Set<string>();
  for (const order of orders) {
    let outcome: OrderOutcome;
    try {
      outcome = await prisma.$transaction((tx: Tx) => settleOrderTx(tx, order, draw, prizes));
    } catch (err) {
      failed++;
      console.error(`[settlement] order ${order.id} failed, will retry on the next run:`, err);
      continue;
    }
    if (outcome.kind === 'skipped') continue;
    if (outcome.kind === 'needs_attention') {
      outcome.tiers.forEach((t) => attention.add(t));
      continue;
    }
    processed++;

    if (outcome.kind === 'lost') {
      notificationService.sendToUser(order.userId, PAYLOADS.orderLost()).catch(console.error);
    } else if (outcome.kind === 'won_wallet') {
      notificationService.sendToUser(order.userId, PAYLOADS.orderWon(outcome.total.toFixed(2))).catch(console.error);
    } else {
      notificationService.sendToUser(order.userId, PAYLOADS.prizeClaim(outcome.total.toFixed(2))).catch(console.error);
    }
  }

  // A failed order keeps the draw open: the next run retries it
  if (failed > 0) return { settled: false, processed };

  // A hit on a tier without a prize amount keeps the draw open and flags it for the admin
  if (attention.size > 0) {
    const reason = `tickets hit tiers with no prize amount: ${[...attention].join(', ')}`;
    await prisma.draw.updateMany({
      where: { id: drawId, status: 'results_confirmed' },
      data: { needsAttention: true, attentionReason: reason },
    });
    console.error(`[settlement] draw ${drawId} needs admin attention: ${reason}`);
    return { settled: false, processed };
  }

  const { count } = await prisma.draw.updateMany({
    where: { id: drawId, status: 'results_confirmed' },
    data: { status: 'settled', settledAt: new Date(), needsAttention: false, attentionReason: null },
  });
  if (count > 0) {
    await writeAuditLog({
      entityType: 'draw',
      entityId: drawId,
      action: 'draw:settled',
      actorType: 'system',
      metadata: { processedOrders: processed },
    });
  }
  return { settled: count > 0, processed };
}

let running = false;

/** The settlement job: picks up every confirmed draw. */
export async function settleConfirmedDraws(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const draws = await prisma.draw.findMany({ where: { status: 'results_confirmed' }, select: { id: true } });
    for (const d of draws) await settleDraw(d.id);
  } finally {
    running = false;
  }
}

export function startSettlementScheduler(): void {
  cron.schedule('* * * * *', () => {
    void settleConfirmedDraws().catch((e) => console.error('[settlement] job failed:', e));
  });
}

/** Results never arrived for this draw: scanned orders wait in `results_delayed`. */
export async function markDrawResultsDelayed(drawId: string): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { drawId, status: 'scanned' },
    select: { id: true, userId: true },
  });
  for (const order of orders) {
    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: 'scanned' },
      data: { status: 'results_delayed' },
    });
    if (count === 0) continue;
    await orderStatusChange(order.id, 'scanned', 'results_delayed', 'system', 'system');
    notificationService.sendToUser(order.userId, PAYLOADS.resultsDelayed()).catch(console.error);
  }
}
