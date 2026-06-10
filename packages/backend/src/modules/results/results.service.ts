import { prisma } from '../../prisma.js';
import type { GameType } from '@lotto-maker/shared';
import { creditWinning } from '../wallet/wallet.service.js';
import { orderStatusChange } from '../../lib/audit-log.js';
import { refund } from '../wallet/wallet.service.js';

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

function drawDayBounds(drawDate: Date): { startOfDay: Date; endOfDay: Date } {
  const startOfDay = new Date(drawDate);
  startOfDay.setHours(0, 0, 0, 0);
  return { startOfDay, endOfDay: new Date(startOfDay.getTime() + 86400000) };
}

export async function processResults(gameType: GameType, drawDate: Date): Promise<void> {
  const result = await fetchDrawResults(gameType, drawDate);
  if (!result) return;

  const { startOfDay, endOfDay } = drawDayBounds(drawDate);

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

export async function markResultsDelayed(gameType: GameType, drawDate: Date): Promise<void> {
  const { startOfDay, endOfDay } = drawDayBounds(drawDate);

  const orders = await prisma.order.findMany({
    where: { gameType, drawDate: { gte: startOfDay, lt: endOfDay }, status: 'scanned' },
    select: { id: true },
  });

  for (const order of orders) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'results_delayed' } });
    await orderStatusChange(order.id, 'scanned', 'results_delayed', 'system', 'system');
  }
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

export async function processResultsWithRetry(
  gameType: GameType,
  drawDate: Date,
  attemptsLeft = 3,
): Promise<void> {
  const result = await fetchDrawResults(gameType, drawDate);

  if (!result) {
    if (attemptsLeft <= 1) {
      await markResultsDelayed(gameType, drawDate);
      return;
    }
    setTimeout(() => {
      void processResultsWithRetry(gameType, drawDate, attemptsLeft - 1);
    }, 5 * 60 * 1000);
    return;
  }

  const { startOfDay, endOfDay } = drawDayBounds(drawDate);

  const orders = await prisma.order.findMany({
    where: {
      gameType,
      drawDate: { gte: startOfDay, lt: endOfDay },
      status: { in: ['scanned', 'results_delayed'] },
    },
    select: { id: true, userId: true, numbers: true, strongNumber: true, totalCharged: true, status: true },
  });

  for (const order of orders) {
    const numbers = order.numbers as number[];
    const won = checkWin(numbers, order.strongNumber, result);
    const newStatus = won ? 'won' : 'lost';
    const fromStatus = order.status as string;

    await prisma.order.update({ where: { id: order.id }, data: { status: newStatus } });
    await orderStatusChange(order.id, fromStatus, newStatus, 'system', 'system');

    if (won) {
      await creditWinning(order.userId, parseFloat(order.totalCharged.toString()), order.id);
    }
  }
}
