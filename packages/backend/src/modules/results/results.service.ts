import { prisma } from '../../prisma.js';
import type { GameType } from '@lotto-maker/shared';
import { creditWinning } from '../wallet/wallet.service.js';
import { orderStatusChange } from '../../lib/audit-log.js';

export interface DrawResult {
  numbers: number[];
  strongNumber?: number;
}

export async function fetchDrawResults(
  _gameType: GameType,
  _drawDate: Date,
): Promise<DrawResult | null> {
  // Placeholder — integrate official Pais results feed here
  return null;
}

function checkWin(orderNumbers: number[], orderStrong: number | null, result: DrawResult): boolean {
  const matchCount = orderNumbers.filter((n) => result.numbers.includes(n)).length;
  const strongMatch = orderStrong !== null && orderStrong === (result.strongNumber ?? null);
  return matchCount >= 2 || (matchCount >= 1 && strongMatch);
}

export async function processResults(gameType: GameType, drawDate: Date): Promise<void> {
  const result = await fetchDrawResults(gameType, drawDate);
  if (!result) return;

  const startOfDay = new Date(drawDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const orders = await prisma.order.findMany({
    where: { gameType, drawDate: { gte: startOfDay, lt: endOfDay }, status: 'scanned' },
    select: { id: true, userId: true, numbers: true, strongNumber: true, totalCharged: true },
  });

  for (const order of orders) {
    const numbers = order.numbers as number[];
    const won = checkWin(numbers, order.strongNumber, result);
    const newStatus = won ? 'won' : 'lost';

    await prisma.order.update({ where: { id: order.id }, data: { status: newStatus } });
    await orderStatusChange(order.id, 'scanned', newStatus, 'system', 'system');

    if (won) {
      await creditWinning(order.userId, parseFloat(order.totalCharged.toString()), order.id);
    }
  }
}
