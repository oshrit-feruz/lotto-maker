import type { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { evaluateCircuitBreaker } from '../../lib/circuit-breaker.js';
import { orderStatusChange, writeAuditLogTx } from '../../lib/audit-log.js';
import { assertGameEnabled } from '../../lib/games.js';
import { computeOrderPrice } from '../../lib/pricing.js';
import { getPriceRow } from '../../lib/price-row.js';
import { cutoffsOf, getOpenDraws } from '../../lib/draws.js';
import { assertCanPlaceOrder } from '../limits/limits.service.js';
import { assertValidTicket } from '../tickets/tickets.service.js';
import type { TicketBody } from '../tickets/tickets.service.js';
import { r2Service, DEFAULT_SIGNED_URL_TTL_SECONDS } from '../../storage/r2.service.js';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const SUBSCRIPTION_PRIORITY = 1;
const ONE_TIME_PRIORITY = 100;

export interface CreateOrderParams {
  userId: string;
  /** The lotto ticket. A ticket for N draws creates N orders, one per draw. */
  ticket: TicketBody;
  type: 'one_time' | 'subscription';
  subscriptionId?: string;
}

export async function createOrder(params: CreateOrderParams) {
  const { userId, ticket, type, subscriptionId } = params;

  assertGameEnabled('lotto');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.verifiedAdult) {
    throw new AppError(403, 'AGE_VERIFICATION_REQUIRED', 'KYC required before placing orders');
  }
  if (user.status === 'suspended') throw new AppError(403, 'ACCOUNT_SUSPENDED');

  assertValidTicket(ticket);

  const draws = await getOpenDraws(ticket.drawCount);
  const firstDraw = draws[0];
  if (!firstDraw) throw new AppError(422, 'CUTOFF_PASSED', 'Orders closed for the next draw');
  if (draws.length < ticket.drawCount) {
    throw new AppError(
      422,
      'NOT_ENOUGH_DRAWS',
      `Only ${draws.length} upcoming draw(s) are announced; ${ticket.drawCount} requested`,
    );
  }
  const minutesLeft = Math.floor((cutoffsOf(firstDraw).hardCutoff.getTime() - Date.now()) / 60000);

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

  const priceRow = await getPriceRow(ticket.type);
  const breakdown = computeOrderPrice(ticket, priceRow);
  // Price and fee of one order; the same for every draw of this ticket
  const orderPrice = new Decimal(breakdown.paisPrice).plus(breakdown.extraPrice);
  const orderFee = new Decimal(breakdown.fee);
  const orderTotal = new Decimal(breakdown.total);
  const grandTotal = orderTotal.times(draws.length);

  // Self-exclusion (403 SELF_EXCLUDED) and the monthly loss limit (422 LOSS_LIMIT)
  await assertCanPlaceOrder(userId, grandTotal);

  const created = await prisma.$transaction(
    async (tx: Tx) => {
      // Advisory lock scoped to transaction — prevents concurrent circuit-breaker accepts
      // $executeRaw, not $queryRaw: the function returns void, which Prisma cannot deserialize
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${location.id}::text))`;

      const rows = await tx.$queryRaw<Array<{ walletBalance: string }>>`
        SELECT "walletBalance"::text FROM "User" WHERE id = ${userId} FOR UPDATE
      `;
      const u = rows[0];
      if (!u) throw new AppError(404, 'USER_NOT_FOUND');
      if (new Decimal(u.walletBalance).lessThan(grandTotal)) {
        throw new AppError(402, 'INSUFFICIENT_BALANCE');
      }

      await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { decrement: grandTotal.toFixed(2) } },
      });

      const newTicket = await tx.ticket.create({
        data: {
          userId,
          type: ticket.type,
          systematicType: ticket.systematicType,
          extra: ticket.extra,
          drawCount: ticket.drawCount,
          tables: {
            create: ticket.tables.map((t, position) => ({
              position,
              numbers: t.numbers,
              strongNumbers: t.strongNumbers,
            })),
          },
        },
      });

      const orders: Array<{ orderId: string; drawNumber: number; drawAt: Date; hardCutoff: Date; visibleCutoff: Date }> = [];

      for (const draw of draws) {
        const { hardCutoff, visibleCutoff } = cutoffsOf(draw);
        const drawMinutesLeft = Math.floor((hardCutoff.getTime() - Date.now()) / 60000);
        const priority = (type === 'subscription' ? SUBSCRIPTION_PRIORITY : ONE_TIME_PRIORITY)
          + Math.max(0, 200 - drawMinutesLeft);

        const newOrder = await tx.order.create({
          data: {
            userId,
            subscriptionId: subscriptionId ?? null,
            gameType: 'lotto',
            ticketId: newTicket.id,
            drawId: draw.id,
            drawDate: draw.drawAt,
            drawTime: draw.drawAt,
            type,
            status: 'in_queue',
            price: orderPrice.toFixed(2),
            fee: orderFee.toFixed(2),
            totalCharged: orderTotal.toFixed(2),
          },
        });

        const walletTx = await tx.walletTransaction.create({
          data: {
            userId,
            type: 'charge',
            amount: orderTotal.toFixed(2),
            orderId: newOrder.id,
            description: `הזמנת לוטו ${draw.drawNumber}`,
          },
        });

        // Same audit entry walletService.charge writes, inside the charging transaction
        await writeAuditLogTx(tx, {
          entityType: 'wallet',
          entityId: userId,
          action: 'wallet:charge',
          actorId: userId,
          actorType: 'user',
          metadata: { amount: orderTotal.toFixed(2), transactionId: walletTx.id },
        });

        await tx.queueSlot.create({
          data: {
            orderId: newOrder.id,
            locationId: location.id,
            priority,
            deadline: hardCutoff,
            status: 'waiting',
          },
        });

        orders.push({
          orderId: newOrder.id,
          drawNumber: draw.drawNumber,
          drawAt: draw.drawAt,
          hardCutoff,
          visibleCutoff,
        });
      }

      return { ticketId: newTicket.id, orders };
    },
    { isolationLevel: 'Serializable' },
  );

  for (const o of created.orders) {
    await orderStatusChange(o.orderId, 'pending', 'in_queue', userId, 'user');
  }

  const first = created.orders[0]!;
  return {
    ticketId: created.ticketId,
    // First order, for callers that handle a single order
    orderId: first.orderId,
    status: 'in_queue' as const,
    totalCharged: grandTotal.toFixed(2),
    drawTime: first.drawAt,
    visibleCutoff: first.visibleCutoff,
    orders: created.orders.map((o) => ({
      orderId: o.orderId,
      drawNumber: o.drawNumber,
      drawAt: o.drawAt,
      visibleCutoff: o.visibleCutoff,
    })),
  };
}

const ORDER_INCLUDE = {
  queueSlot: true,
  ticket: { include: { tables: { orderBy: { position: 'asc' as const } } } },
  draw: {
    select: { drawNumber: true, drawAt: true, status: true, numbers: true, strong: true, extraDigits: true },
  },
  wins: true,
  prizeClaim: { select: { status: true, amount: true } },
};

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
      include: ORDER_INCLUDE,
    }),
    prisma.order.count({ where }),
  ]);

  return { data: data.map(toPublicOrder), total, page: params.page, limit: params.limit };
}

export async function getOrderById(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND');
  if (order.userId !== userId) throw new AppError(403, 'FORBIDDEN');
  return toPublicOrder(order);
}

/** The storage key stays server-side; clients only learn whether a scan exists. */
function toPublicOrder<T extends { ticketScanKey: string | null }>(order: T) {
  const { ticketScanKey, ...rest } = order;
  return { ...rest, hasScan: ticketScanKey !== null };
}

/**
 * Returns a short-lived signed URL for the order's ticket scan. Owner only.
 * TODO: serve customers a partially blurred copy (barcode / serial hidden) and
 * keep the full scan for prize claims only.
 */
export async function getOrderScanUrl(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userId: true, ticketScanKey: true },
  });
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND');
  if (order.userId !== userId) throw new AppError(403, 'FORBIDDEN');
  if (!order.ticketScanKey) throw new AppError(404, 'SCAN_NOT_AVAILABLE');

  const url = await r2Service.getSignedUrl(order.ticketScanKey, DEFAULT_SIGNED_URL_TTL_SECONDS);
  return { url, expiresIn: DEFAULT_SIGNED_URL_TTL_SECONDS };
}
