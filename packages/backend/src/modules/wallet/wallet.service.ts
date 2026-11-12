import type { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLogTx } from '../../lib/audit-log.js';
import { config } from '../../config.js';

export type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

interface ChargeResult {
  newBalance: number;
  transactionId: string;
}

export async function charge(
  userId: string,
  amount: number,
  orderId: string,
  description: string,
): Promise<ChargeResult> {
  if (amount <= 0) throw new AppError(400, 'INVALID_AMOUNT', 'Charge amount must be positive');
  return prisma.$transaction(
    async (tx: Tx) => {
      const users = await tx.$queryRaw<Array<{ walletBalance: string }>>`
        SELECT "walletBalance"::text FROM "User" WHERE id = ${userId} FOR UPDATE
      `;
      const user = users[0];
      if (!user) throw new AppError(404, 'USER_NOT_FOUND');
      if (parseFloat(user.walletBalance) < amount) {
        throw new AppError(402, 'INSUFFICIENT_BALANCE', 'Wallet balance too low');
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { decrement: amount } },
        select: { walletBalance: true },
      });

      const walletTx = await tx.walletTransaction.create({
        data: { userId, type: 'charge', amount, orderId, description },
      });

      await writeAuditLogTx(tx, {
        entityType: 'wallet',
        entityId: userId,
        action: 'wallet:charge',
        actorId: userId,
        actorType: 'user',
        metadata: { amount: String(amount), orderId, transactionId: walletTx.id },
      });

      return { newBalance: parseFloat(updated.walletBalance.toString()), transactionId: walletTx.id };
    },
    { isolationLevel: 'Serializable' },
  );
}

export async function refund(
  userId: string,
  amount: number,
  orderId: string,
  description: string,
): Promise<ChargeResult> {
  if (amount <= 0) throw new AppError(400, 'INVALID_AMOUNT', 'Refund amount must be positive');
  return prisma.$transaction(
    async (tx: Tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const updated = await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
        select: { walletBalance: true },
      });

      const walletTx = await tx.walletTransaction.create({
        data: { userId, type: 'refund', amount, orderId, description },
      });

      await tx.order.update({ where: { id: orderId }, data: { status: 'refunded' } });

      await writeAuditLogTx(tx, {
        entityType: 'order',
        entityId: orderId,
        action: 'status_change:->refunded',
        actorId: 'system',
        actorType: 'system',
        metadata: { amount: String(amount), reason: description },
      });

      await writeAuditLogTx(tx, {
        entityType: 'wallet',
        entityId: userId,
        action: 'wallet:refund',
        actorId: 'system',
        actorType: 'system',
        metadata: { amount: String(amount), orderId, transactionId: walletTx.id },
      });

      return { newBalance: parseFloat(updated.walletBalance.toString()), transactionId: walletTx.id };
    },
    { isolationLevel: 'Serializable' },
  );
}

/**
 * Credits a confirmed payment to the wallet. Runs inside the caller's
 * transaction so the credit commits or rolls back together with the payment's
 * status change. Enforces WALLET_BALANCE_CAP; the check happens before any
 * write, so a caller may catch WALLET_CAP_EXCEEDED and keep using the transaction.
 */
export async function depositTx(
  tx: Tx,
  userId: string,
  amount: number,
  description: string,
  paymentId?: string,
): Promise<ChargeResult> {
  if (amount <= 0) throw new AppError(400, 'INVALID_AMOUNT', 'Deposit amount must be positive');

  const users = await tx.$queryRaw<Array<{ walletBalance: string }>>`
    SELECT "walletBalance"::text FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  const user = users[0];
  if (!user) throw new AppError(404, 'USER_NOT_FOUND');
  assertWithinBalanceCap(user.walletBalance, amount);

  const updated = await tx.user.update({
    where: { id: userId },
    data: { walletBalance: { increment: amount } },
    select: { walletBalance: true },
  });

  const walletTx = await tx.walletTransaction.create({
    data: { userId, type: 'deposit', amount, description, paymentId: paymentId ?? null },
  });

  await writeAuditLogTx(tx, {
    entityType: 'wallet',
    entityId: userId,
    action: 'wallet:deposit',
    actorId: 'system',
    actorType: 'system',
    metadata: { amount: String(amount), transactionId: walletTx.id, paymentId: paymentId ?? null },
  });

  return { newBalance: parseFloat(updated.walletBalance.toString()), transactionId: walletTx.id };
}

export interface ReversalResult {
  debited: number;
  shortfall: number;
}

/**
 * Takes back a credited payment that the provider refunded or charged back.
 * Debits at most the current balance, so the wallet never goes negative; any
 * remainder is returned as `shortfall` for the caller to act on. Runs inside
 * the caller's transaction. The (paymentId, type) unique constraint makes a
 * second reversal of the same payment fail at the database.
 */
export async function reverseDepositTx(
  tx: Tx,
  userId: string,
  amount: number,
  description: string,
  paymentId: string,
): Promise<ReversalResult> {
  const users = await tx.$queryRaw<Array<{ walletBalance: string }>>`
    SELECT "walletBalance"::text FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  const user = users[0];
  if (!user) throw new AppError(404, 'USER_NOT_FOUND');

  const owed = new Decimal(amount);
  const debit = Decimal.min(new Decimal(user.walletBalance), owed);
  const shortfall = owed.minus(debit);

  if (debit.greaterThan(0)) {
    await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { decrement: debit.toNumber() } },
    });
    const walletTx = await tx.walletTransaction.create({
      data: { userId, type: 'refund_reversal', amount: debit.toNumber(), description, paymentId },
    });
    await writeAuditLogTx(tx, {
      entityType: 'wallet',
      entityId: userId,
      action: 'wallet:refund_reversal',
      actorId: 'system',
      actorType: 'system',
      metadata: { amount: debit.toFixed(2), transactionId: walletTx.id, paymentId },
    });
  }

  return { debited: debit.toNumber(), shortfall: shortfall.toNumber() };
}

/** Throws 422 WALLET_CAP_EXCEEDED if balance + amount would pass the configured cap. */
export function assertWithinBalanceCap(balance: string | number, amount: number): void {
  if (new Decimal(balance).plus(amount).greaterThan(config.WALLET_BALANCE_CAP)) {
    throw new AppError(
      422,
      'WALLET_CAP_EXCEEDED',
      `Wallet balance cannot exceed ${config.WALLET_BALANCE_CAP}`,
    );
  }
}

/**
 * Credits a prize to the wallet inside the caller's transaction, respecting the wallet cap.
 * Whatever does not fit under WALLET_BALANCE_CAP is returned as `excess`; the caller records
 * it as a PendingCardCredit (TODO: pay it out to the user's card).
 */
export async function creditPrizeTx(
  tx: Tx,
  userId: string,
  amount: Decimal,
  orderId: string,
): Promise<{ credited: Decimal; excess: Decimal }> {
  if (amount.lte(0)) throw new AppError(400, 'INVALID_AMOUNT', 'Winning amount must be positive');

  const rows = await tx.$queryRaw<Array<{ walletBalance: string }>>`
    SELECT "walletBalance"::text FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new AppError(404, 'USER_NOT_FOUND');

  const room = Decimal.max(new Decimal(config.WALLET_BALANCE_CAP).minus(row.walletBalance), 0);
  const credited = Decimal.min(amount, room);
  const excess = amount.minus(credited);

  if (credited.gt(0)) {
    await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: credited.toFixed(2) } },
    });
    await tx.walletTransaction.create({
      data: { userId, type: 'winning', amount: credited.toFixed(2), orderId, description: 'זכייה' },
    });
    // The wallet transaction is identified by (orderId, type 'winning'); its row is not read back
    await writeAuditLogTx(tx, {
      entityType: 'wallet',
      entityId: userId,
      action: 'wallet:winning',
      actorId: 'system',
      actorType: 'system',
      metadata: { amount: credited.toFixed(2), orderId },
    });
  }
  return { credited, excess };
}

export async function getBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { walletBalance: true },
  });
  return parseFloat(user.walletBalance.toString());
}

export async function getTransactions(userId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.walletTransaction.count({ where: { userId } }),
  ]);
  return { data, total, page, limit };
}
