import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLogTx } from '../../lib/audit-log.js';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

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
    { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel },
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
    { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel },
  );
}

export async function deposit(
  userId: string,
  amount: number,
  description: string,
): Promise<ChargeResult> {
  if (amount <= 0) throw new AppError(400, 'INVALID_AMOUNT', 'Deposit amount must be positive');

  return prisma.$transaction(
    async (tx: Tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const updated = await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
        select: { walletBalance: true },
      });

      const walletTx = await tx.walletTransaction.create({
        data: { userId, type: 'deposit', amount, description },
      });

      await writeAuditLogTx(tx, {
        entityType: 'wallet',
        entityId: userId,
        action: 'wallet:deposit',
        actorId: userId,
        actorType: 'user',
        metadata: { amount: String(amount), transactionId: walletTx.id },
      });

      return { newBalance: parseFloat(updated.walletBalance.toString()), transactionId: walletTx.id };
    },
    { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel },
  );
}

export async function creditWinning(
  userId: string,
  amount: number,
  orderId: string,
): Promise<ChargeResult> {
  if (amount <= 0) throw new AppError(400, 'INVALID_AMOUNT', 'Winning amount must be positive');
  return prisma.$transaction(
    async (tx: Tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const updated = await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
        select: { walletBalance: true },
      });

      const walletTx = await tx.walletTransaction.create({
        data: { userId, type: 'winning', amount, orderId, description: 'זכייה' },
      });

      await writeAuditLogTx(tx, {
        entityType: 'wallet',
        entityId: userId,
        action: 'wallet:winning',
        actorId: 'system',
        actorType: 'system',
        metadata: { amount: String(amount), orderId, transactionId: walletTx.id },
      });

      return { newBalance: parseFloat(updated.walletBalance.toString()), transactionId: walletTx.id };
    },
    { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel },
  );
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
