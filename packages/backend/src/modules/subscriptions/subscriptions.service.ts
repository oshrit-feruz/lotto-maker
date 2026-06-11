import type { GameType, DrawDay } from '@lotto-maker/shared';
import { GAME_BASE_PRICE } from '@lotto-maker/shared';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { validateGameNumbers } from '../orders/orders.validator.js';
import { getNextDrawInfo } from '../../lib/draw-schedule.js';

export interface CreateSubscriptionParams {
  userId: string;
  gameType: GameType;
  numbers: number[];
  strongNumber?: number;
  drawDays: DrawDay[];
}

export async function createSubscription(params: CreateSubscriptionParams) {
  const { userId, gameType, numbers, strongNumber, drawDays } = params;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.verifiedAdult) throw new AppError(403, 'AGE_VERIFICATION_REQUIRED');

  validateGameNumbers(gameType, numbers, strongNumber);

  const nextDrawInfo = getNextDrawInfo(gameType);

  return prisma.subscription.create({
    data: {
      userId,
      gameType,
      numbers: numbers as unknown as object,
      strongNumber: strongNumber ?? null,
      drawDays,
      active: true,
      nextDrawDate: nextDrawInfo.drawTime,
      pricePerDraw: GAME_BASE_PRICE[gameType],
    },
  });
}

export async function listSubscriptions(userId: string) {
  return prisma.subscription.findMany({
    where: { userId, active: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function cancelSubscription(subscriptionId: string, userId: string) {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  if (sub.userId !== userId) throw new AppError(403, 'FORBIDDEN');
  return prisma.subscription.update({ where: { id: subscriptionId }, data: { active: false } });
}
