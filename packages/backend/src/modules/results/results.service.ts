import { prisma } from '../../prisma.js';
import type { GameType, DrawResult } from '@lotto-maker/shared';
import { refund } from '../wallet/wallet.service.js';
import { orderStatusChange } from '../../lib/audit-log.js';
import { fetchLatestForDate } from '../../services/results-scraper.js';

export type { DrawResult };

// Winnings are NOT decided here any more. The old checkWin (2 hits, or 1 + strong, credited the
// whole price back) was wrong. Lotto is settled per draw by settlement.service.ts, and only after
// an admin has confirmed the results. chance / 777 / 123 accept no new orders (ENABLED_GAMES) and
// have no settlement until their prize rules are implemented.

function drawDayBounds(drawDate: Date): { startOfDay: Date; endOfDay: Date } {
  const startOfDay = new Date(drawDate);
  startOfDay.setHours(0, 0, 0, 0);
  return { startOfDay, endOfDay: new Date(startOfDay.getTime() + 86400000) };
}

export async function fetchDrawResults(
  gameType: GameType,
  drawDate: Date,
): Promise<DrawResult | null> {
  return fetchLatestForDate(gameType, drawDate);
}

export async function cancelDraw(gameType: GameType, drawDate: Date): Promise<void> {
  const { startOfDay, endOfDay } = drawDayBounds(drawDate);

  const orders = await prisma.order.findMany({
    where: {
      gameType,
      drawDate: { gte: startOfDay, lt: endOfDay },
      status: { in: ['scanned', 'in_queue', 'keyed', 'results_delayed'] },
    },
    select: { id: true, userId: true, totalCharged: true, status: true },
  });

  for (const order of orders) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });
    await orderStatusChange(order.id, order.status, 'cancelled', 'system', 'system');
    await refund(
      order.userId,
      parseFloat(order.totalCharged.toString()),
      order.id,
      `ביטול הגרלה ${gameType}`,
    );
  }
}
