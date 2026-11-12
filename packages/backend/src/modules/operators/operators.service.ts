import { validateExtraDigits } from '@lotto-maker/shared';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import type { PrismaClient } from '@prisma/client';
import { orderStatusChangeTx, writeAuditLogTx } from '../../lib/audit-log.js';
import { redis } from '../../redis.js';
import { config } from '../../config.js';
import { notifyInBackground } from '../notifications/notify.service.js';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

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

/**
 * The operator's work list: slots to key in, plus slots already keyed that
 * still need their ticket scan. The payload carries what the terminal form
 * needs (the numbers, and the last 4 digits of the customer's ID for prizes
 * above the threshold) and nothing else about the customer.
 */
export async function getQueue(locationId: string) {
  const rows = await prisma.queueSlot.findMany({
    where: {
      locationId,
      OR: [
        { status: { in: ['waiting', 'in_progress'] } },
        { status: 'done', order: { status: 'keyed' } },
      ],
    },
    orderBy: [{ priority: 'asc' }, { deadline: 'asc' }],
    include: {
      order: {
        select: {
          gameType: true,
          type: true,
          draw: { select: { drawNumber: true } },
          ticket: {
            select: {
              type: true,
              systematicType: true,
              extra: true,
              tables: {
                orderBy: { position: 'asc' },
                select: { numbers: true, strongNumbers: true },
              },
            },
          },
          user: { select: { idLast4: true } },
        },
      },
    },
  });

  const slots = rows.map(({ order, ...slot }) => ({
    ...slot,
    order: {
      gameType: order.gameType,
      type: order.type,
      drawNumber: order.draw?.drawNumber ?? null,
      ticketType: order.ticket?.type ?? null,
      systematicType: order.ticket?.systematicType ?? null,
      extra: order.ticket?.extra ?? false,
      tables: order.ticket?.tables ?? [],
      idLast4: order.user.idLast4,
    },
  }));

  const nextDeadline = slots.find((s) => s.status !== 'done')?.deadline ?? null;
  return { slots, nextDeadline };
}

/**
 * Loads the operator and the slot and checks the operator may act on it.
 * An operator can only touch slots that belong to their own location.
 */
async function loadSlotForOperator(slotId: string, operatorId: string) {
  const [operator, slot] = await Promise.all([
    prisma.operator.findUnique({ where: { id: operatorId } }),
    prisma.queueSlot.findUnique({
      where: { id: slotId },
      include: { order: { select: { status: true, userId: true, ticket: { select: { extra: true } } } } },
    }),
  ]);

  if (!operator || !operator.active) throw new AppError(403, 'OPERATOR_INACTIVE');
  if (!slot) throw new AppError(404, 'SLOT_NOT_FOUND');
  if (slot.locationId !== operator.locationId) {
    throw new AppError(403, 'FORBIDDEN_LOCATION', 'Slot belongs to another location');
  }
  return { operator, slot };
}

/** The operator starts keying the form. The order itself does not change yet. */
export async function startSlot(slotId: string, operatorId: string) {
  const { slot } = await loadSlotForOperator(slotId, operatorId);

  if (slot.status !== 'waiting' && slot.status !== 'in_progress') {
    throw new AppError(409, 'SLOT_NOT_ACTIONABLE');
  }
  const { order: _order, ...current } = slot;
  // Already started by this operator: nothing changes, nothing to log
  if (slot.status === 'in_progress' && slot.operatorId === operatorId) return current;

  // Another operator is working on it: only a stale claim can be taken over
  if (slot.status === 'in_progress' && slot.operatorId && slot.operatorId !== operatorId) {
    const claimAgeMs = slot.assignedAt ? Date.now() - slot.assignedAt.getTime() : Infinity;
    if (claimAgeMs < config.SLOT_CLAIM_TIMEOUT_MINUTES * 60_000) {
      throw new AppError(409, 'SLOT_TAKEN', 'Slot is being handled by another operator');
    }
  }

  const updated = await prisma.$transaction(async (tx: Tx) => {
    const { count } = await tx.queueSlot.updateMany({
      where: { id: slotId, status: slot.status, operatorId: slot.operatorId },
      data: { status: 'in_progress', operatorId, assignedAt: new Date() },
    });
    if (count === 0) throw new AppError(409, 'SLOT_NOT_ACTIONABLE');

    // Log what actually changed: the slot, not the order (it is keyed in completeSlot)
    await writeAuditLogTx(tx, {
      entityType: 'queue_slot',
      entityId: slotId,
      orderId: slot.orderId,
      action: `slot_status_change:${slot.status}->in_progress`,
      actorId: operatorId,
      actorType: 'operator',
      metadata: slot.operatorId ? { previousOperatorId: slot.operatorId } : undefined,
    });
    return tx.queueSlot.findUniqueOrThrow({ where: { id: slotId } });
  });

  await publishQueueUpdate(slot.locationId, { type: 'slot_updated', slot: updated });
  return updated;
}

/** The form has been keyed in at the terminal: slot -> done, order -> keyed. */
export async function completeSlot(slotId: string, operatorId: string) {
  const { slot } = await loadSlotForOperator(slotId, operatorId);

  if (slot.status !== 'in_progress') throw new AppError(409, 'SLOT_NOT_IN_PROGRESS');
  if (slot.operatorId !== operatorId) throw new AppError(409, 'SLOT_TAKEN', 'Slot is being handled by another operator');
  if (slot.order.status !== 'in_queue') throw new AppError(409, 'ORDER_NOT_IN_QUEUE');

  const now = new Date();
  const updatedSlot = await prisma.$transaction(async (tx: Tx) => {
    const slotUpdate = await tx.queueSlot.updateMany({
      where: { id: slotId, status: 'in_progress', operatorId },
      data: { status: 'done', completedAt: now },
    });
    if (slotUpdate.count === 0) throw new AppError(409, 'SLOT_TAKEN', 'Slot is being handled by another operator');

    const orderUpdate = await tx.order.updateMany({
      where: { id: slot.orderId, status: 'in_queue' },
      data: { status: 'keyed', keyedAt: now },
    });
    if (orderUpdate.count === 0) throw new AppError(409, 'ORDER_NOT_IN_QUEUE');

    await writeAuditLogTx(tx, {
      entityType: 'queue_slot',
      entityId: slotId,
      orderId: slot.orderId,
      action: 'slot_status_change:in_progress->done',
      actorId: operatorId,
      actorType: 'operator',
    });
    await orderStatusChangeTx(tx, slot.orderId, 'in_queue', 'keyed', operatorId, 'operator');
    return tx.queueSlot.findUniqueOrThrow({ where: { id: slotId } });
  });

  await publishQueueUpdate(slot.locationId, { type: 'slot_completed', slotId });
  return updatedSlot;
}

/**
 * Checks that this operator may attach a scan to this slot: same location, and
 * the form has actually been keyed (slot done, order keyed). Call it before
 * uploading the file so a rejected request stores nothing.
 */
export async function assertCanAttachScan(
  slotId: string,
  operatorId: string,
  /** When given, also checks the Extra digits the terminal printed (required if the ticket has Extra). */
  extraDigits?: number[],
) {
  const { slot } = await loadSlotForOperator(slotId, operatorId);
  if (slot.status !== 'done') throw new AppError(409, 'SLOT_NOT_KEYED', 'Scan is only allowed after the form was keyed');
  if (slot.order.status !== 'keyed') throw new AppError(409, 'ORDER_NOT_KEYED');
  if (extraDigits !== undefined && slot.order.ticket?.extra && !validateExtraDigits(extraDigits)) {
    throw new AppError(400, 'EXTRA_DIGITS_REQUIRED', 'Extra digits (6 digits, each 1-7) are required for this ticket');
  }
  return slot;
}

export async function attachScan(
  slotId: string,
  operatorId: string,
  scanKey: string,
  /** The 6 Extra digits the terminal printed. Required when the ticket has Extra. */
  extraDigits: number[] = [],
) {
  const slot = await assertCanAttachScan(slotId, operatorId, extraDigits);

  await prisma.$transaction(async (tx: Tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: slot.orderId, status: 'keyed' },
      data: {
        ticketScanKey: scanKey,
        status: 'scanned',
        scannedAt: new Date(),
        extraDigits: slot.order.ticket?.extra ? extraDigits : [],
      },
    });
    if (count === 0) throw new AppError(409, 'ORDER_NOT_KEYED');
    await orderStatusChangeTx(tx, slot.orderId, 'keyed', 'scanned', operatorId, 'operator');
  });

  await publishQueueUpdate(slot.locationId, { type: 'slot_scanned', slotId });

  notifyInBackground(slot.order.userId, 'order_scanned', {});

  return { scanned: true };
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
