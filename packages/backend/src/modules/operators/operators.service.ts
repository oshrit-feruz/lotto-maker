import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { orderStatusChange } from '../../lib/audit-log.js';
import { redis } from '../../redis.js';

const SSE_CHANNEL_PREFIX = 'queue:';

export function queueChannel(locationId: string) {
  return `${SSE_CHANNEL_PREFIX}${locationId}`;
}

async function publishQueueUpdate(locationId: string, payload: unknown) {
  await redis.publish(queueChannel(locationId), JSON.stringify(payload));
}

export async function getOperatorByUserId(operatorId: string) {
  return prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
}

export async function getQueue(locationId: string) {
  const slots = await prisma.queueSlot.findMany({
    where: { locationId, status: { in: ['waiting', 'in_progress'] } },
    orderBy: [{ priority: 'asc' }, { deadline: 'asc' }],
    include: {
      order: {
        select: {
          gameType: true,
          numbers: true,
          strongNumber: true,
          type: true,
          userId: true,
        },
      },
    },
  });

  const nextDeadline = slots[0]?.deadline ?? null;
  return { slots, nextDeadline };
}

export async function startSlot(slotId: string, operatorId: string) {
  const slot = await prisma.queueSlot.findUniqueOrThrow({
    where: { id: slotId },
    include: { operator: true },
  });

  if (slot.status !== 'waiting' && slot.status !== 'in_progress') {
    throw new AppError(409, 'SLOT_NOT_ACTIONABLE');
  }

  const updated = await prisma.queueSlot.update({
    where: { id: slotId },
    data: { status: 'in_progress', operatorId, assignedAt: new Date() },
  });

  await orderStatusChange(slot.orderId, slot.status, 'keyed', operatorId, 'operator');
  await publishQueueUpdate(slot.locationId, { type: 'slot_updated', slot: updated });

  return updated;
}

export async function completeSlot(slotId: string, operatorId: string) {
  const slot = await prisma.queueSlot.findUniqueOrThrow({ where: { id: slotId } });

  if (slot.status !== 'in_progress') {
    throw new AppError(409, 'SLOT_NOT_IN_PROGRESS');
  }

  const now = new Date();
  const [updatedSlot] = await Promise.all([
    prisma.queueSlot.update({
      where: { id: slotId },
      data: { status: 'done', completedAt: now },
    }),
    prisma.order.update({
      where: { id: slot.orderId },
      data: { status: 'keyed', keyedAt: now },
    }),
  ]);

  await orderStatusChange(slot.orderId, 'in_queue', 'keyed', operatorId, 'operator');
  await publishQueueUpdate(slot.locationId, { type: 'slot_completed', slotId });

  return updatedSlot;
}

export async function attachScan(
  slotId: string,
  operatorId: string,
  scanUrl: string,
) {
  const slot = await prisma.queueSlot.findUniqueOrThrow({ where: { id: slotId } });

  const now = new Date();
  await prisma.order.update({
    where: { id: slot.orderId },
    data: { ticketScanUrl: scanUrl, status: 'scanned', scannedAt: now },
  });

  await orderStatusChange(slot.orderId, 'keyed', 'scanned', operatorId, 'operator');
  await publishQueueUpdate(slot.locationId, { type: 'slot_scanned', slotId, scanUrl });

  return { scanUrl };
}

export async function getShiftLog(operatorId: string, date?: string) {
  const operator = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  const startOfDay = date ? new Date(`${date}T00:00:00Z`) : new Date(new Date().setHours(0, 0, 0, 0));
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const [done, failed] = await Promise.all([
    prisma.queueSlot.count({
      where: { locationId: operator.locationId, operatorId, status: 'done', completedAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma.queueSlot.count({
      where: { locationId: operator.locationId, status: 'failed', createdAt: { gte: startOfDay, lt: endOfDay } },
    }),
  ]);

  return { date: startOfDay.toISOString().slice(0, 10), done, failed };
}
