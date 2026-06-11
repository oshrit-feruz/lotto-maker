import type { PrismaClient } from '@prisma/client';
import type { GameType } from '@lotto-maker/shared';
import { GAME_BASE_PRICE, SERVICE_FEE } from '@lotto-maker/shared';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { validateGameNumbers } from './orders.validator.js';
import { evaluateCircuitBreaker } from '../../lib/circuit-breaker.js';
import { getNextDrawInfo } from '../../lib/draw-schedule.js';
import { orderStatusChange } from '../../lib/audit-log.js';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const SUBSCRIPTION_PRIORITY = 1;
const ONE_TIME_PRIORITY = 100;

export interface CreateOrderParams {
  userId: string;
  gameType: GameType;
  numbers: number[];
  strongNumber?: number;
  type: 'one_time' | 'subscription';
  subscriptionId?: string;
}

export async function createOrder(params: CreateOrderParams) {
  const { userId, gameType, numbers, strongNumber, type, subscriptionId } = params;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.verifiedAdult) {
    throw new AppError(403, 'AGE_VERIFICATION_REQUIRED', 'KYC required before placing orders');
  }
  if (user.status === 'suspended') throw new AppError(403, 'ACCOUNT_SUSPENDED');

  validateGameNumbers(gameType, numbers, strongNumber);

  const drawInfo = getNextDrawInfo(gameType);
  const minutesLeft = Math.floor((drawInfo.hardCutoff.getTime() - Date.now()) / 60000);
  if (minutesLeft <= 0) throw new AppError(422, 'CUTOFF_PASSED', 'Orders closed for this draw');

  const location = await prisma.location.findFirst({ where: { active: true } });
  if (!location) throw new AppError(503, 'NO_ACTIVE_LOCATIONS');

  const [operatorStats, queueCount] = await Promise.all([
    prisma.operator.aggregate({
      where: { locationId: location.id, active: true },
      _count: { id: true },
      _sum: { throughputPerHour: true },
    }),
    prisma.queueSlot.count({
      where: { locationId: location.id, status: { in: ['waiting', 'in_progress'] } },
    }),
  ]);

  const cbResult = evaluateCircuitBreaker({
    activeOperators: operatorStats._count.id,
    throughputPerHour: operatorStats._sum.throughputPerHour ?? 0,
    minutesUntilHardCutoff: minutesLeft,
    ordersInQueue: queueCount,
  });

  if (!cbResult.accepted) {
    throw new AppError(503, cbResult.reason, 'Queue is at capacity. Try ordering earlier.');
  }

  const price = GAME_BASE_PRICE[gameType];
  const fee = SERVICE_FEE;
  const totalCharged = price + fee;
  const priority = (type === 'subscription' ? SUBSCRIPTION_PRIORITY : ONE_TIME_PRIORITY)
    + Math.max(0, 200 - minutesLeft);

  const order = await prisma.$transaction(
    async (tx: Tx) => {
      // Advisory lock scoped to transaction — prevents concurrent circuit-breaker accepts
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${location.id}::text))`;

      const rows = await tx.$queryRaw<Array<{ walletBalance: string }>>`
        SELECT "walletBalance"::text FROM "User" WHERE id = ${userId} FOR UPDATE
      `;
      const u = rows[0];
      if (!u) throw new AppError(404, 'USER_NOT_FOUND');
      if (parseFloat(u.walletBalance) < totalCharged) {
        throw new AppError(402, 'INSUFFICIENT_BALANCE');
      }

      await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { decrement: totalCharged } },
      });

      await tx.walletTransaction.create({
        data: { userId, type: 'charge', amount: totalCharged, description: `הזמנת טופס ${gameType}` },
      });

      const newOrder = await tx.order.create({
        data: {
          userId,
          subscriptionId: subscriptionId ?? null,
          gameType,
          numbers: numbers as unknown as object,
          strongNumber: strongNumber ?? null,
          drawDate: drawInfo.drawTime,
          drawTime: drawInfo.drawTime,
          type,
          status: 'in_queue',
          price,
          fee,
          totalCharged,
        },
      });

      await tx.queueSlot.create({
        data: {
          orderId: newOrder.id,
          locationId: location.id,
          priority,
          deadline: drawInfo.hardCutoff,
          status: 'waiting',
        },
      });

      return newOrder;
    },
    { isolationLevel: 'Serializable' },
  );

  await orderStatusChange(order.id, 'pending', 'in_queue', userId, 'user');

  return {
    orderId: order.id,
    status: 'in_queue' as const,
    totalCharged: totalCharged.toFixed(2),
    drawTime: drawInfo.drawTime,
    visibleCutoff: drawInfo.visibleCutoff,
  };
}

export async function getOrders(
  userId: string,
  params: { status?: string; page: number; limit: number },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { userId };
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      include: { queueSlot: true },
    }),
    prisma.order.count({ where }),
  ]);

  return { data, total, page: params.page, limit: params.limit };
}

export async function getOrderById(orderId: string, userId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { queueSlot: true },
  });
  if (order.userId !== userId) throw new AppError(403, 'FORBIDDEN');
  return order;
}
