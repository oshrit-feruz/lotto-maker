import { Decimal } from 'decimal.js';
import { prisma } from '../../prisma.js';
import { config } from '../../config.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog, writeAuditLogTx } from '../../lib/audit-log.js';
import { decryptField, encryptField } from '../../lib/crypto.js';
import { getPaymentProvider } from '../payments/payments.service.js';
import { getDefaultCard } from '../payments/cards.service.js';
import type { Tx } from './wallet.service.js';

export type WithdrawalStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'failed' | 'cancelled';

export interface BankDetailsInput {
  holderName: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
}

export interface CreateWithdrawalInput {
  amount: number;
  method: 'card' | 'bank';
  /** Card withdrawals: defaults to the user's newest active card. */
  savedCardId?: string;
  bank?: BankDetailsInput;
}

export interface Actor {
  id: string;
  type: 'admin' | 'system';
}

const SYSTEM: Actor = { id: 'system', type: 'system' };
const HOLD_DESCRIPTION = 'בקשת משיכה';
const RELEASE_DESCRIPTION = 'ביטול משיכה';
/** A card payout that threw (outcome unknown) is retried by the job once it is this old. */
const STUCK_PAYOUT_MIN_AGE_MS = 2 * 60 * 1000;

interface WithdrawalRow {
  id: string;
  userId: string;
  amount: { toString(): string };
  fee: { toString(): string };
  method: 'card' | 'bank';
  status: WithdrawalStatus;
  savedCardId: string | null;
  bankAccountLast4: string | null;
  bankReference: string | null;
  providerTxId: string | null;
  adminId: string | null;
  decidedAt: Date | null;
  paidAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

/** Names match if they have the same words in any order, ignoring case, punctuation and niqqud. */
export function namesMatch(a: string, b: string): boolean {
  const words = (s: string) =>
    s
      .normalize('NFKC')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .sort((x, y) => x.localeCompare(y))
      .join(' ');
  const left = words(a);
  return left.length > 0 && left === words(b);
}

/** The fee and what the user receives for a withdrawal of `amount`. */
export function withdrawalAmounts(amount: Decimal.Value, method: 'card' | 'bank') {
  const gross = new Decimal(amount);
  const fee = method === 'bank' ? new Decimal(config.BANK_WITHDRAWAL_FEE) : new Decimal(0);
  return { amount: gross, fee, payout: gross.minus(fee) };
}

/**
 * What a withdrawal of `amount` would cost, before requesting it: the fee, what the user receives
 * and the minimum. `belowMinimum` is true when createWithdrawal would refuse it.
 */
export function quoteWithdrawal(amount: Decimal.Value, method: 'card' | 'bank') {
  const { amount: gross, fee, payout } = withdrawalAmounts(amount, method);
  return {
    amount: gross.toFixed(2),
    method,
    fee: fee.toFixed(2),
    net: Decimal.max(payout, 0).toFixed(2),
    min: new Decimal(config.MIN_WITHDRAWAL_AMOUNT).toFixed(2),
    belowMinimum: gross.lt(config.MIN_WITHDRAWAL_AMOUNT) || payout.lte(0),
  };
}

function toView(w: WithdrawalRow, forAdmin = false) {
  const amount = new Decimal(w.amount.toString());
  const fee = new Decimal(w.fee.toString());
  return {
    id: w.id,
    amount: amount.toFixed(2),
    fee: fee.toFixed(2),
    payout: amount.minus(fee).toFixed(2),
    method: w.method,
    status: w.status,
    savedCardId: w.savedCardId,
    bankAccountLast4: w.bankAccountLast4,
    failureReason: w.failureReason,
    decidedAt: w.decidedAt,
    paidAt: w.paidAt,
    createdAt: w.createdAt,
    ...(forAdmin
      ? { userId: w.userId, adminId: w.adminId, bankReference: w.bankReference, providerTxId: w.providerTxId }
      : {}),
  };
}

async function reload(id: string): Promise<WithdrawalRow> {
  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) throw new AppError(404, 'WITHDRAWAL_NOT_FOUND');
  return w as WithdrawalRow;
}

/** Gives the held money back. Runs in the caller's transaction; at most once per withdrawal (unique index). */
async function releaseHoldTx(tx: Tx, w: { id: string; userId: string; amount: { toString(): string } }): Promise<void> {
  const amount = new Decimal(w.amount.toString());
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${w.userId} FOR UPDATE`;
  // Not capped: it is the user's own money coming back.
  await tx.user.update({ where: { id: w.userId }, data: { walletBalance: { increment: amount.toFixed(2) } } });
  const walletTx = await tx.walletTransaction.create({
    data: {
      userId: w.userId,
      type: 'withdrawal_release',
      amount: amount.toFixed(2),
      withdrawalId: w.id,
      description: RELEASE_DESCRIPTION,
    },
  });
  await writeAuditLogTx(tx, {
    entityType: 'wallet',
    entityId: w.userId,
    action: 'wallet:withdrawal_release',
    actorId: 'system',
    actorType: 'system',
    metadata: { amount: amount.toFixed(2), withdrawalId: w.id, transactionId: walletTx.id },
  });
}

// ─── User ────────────────────────────────────────────────────────────────────

export async function createWithdrawal(userId: string, input: CreateWithdrawalInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, verifiedAdult: true, fullName: true },
  });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND');
  if (user.status === 'suspended') throw new AppError(403, 'ACCOUNT_SUSPENDED');

  const gross = new Decimal(input.amount);
  if (!gross.isFinite() || gross.lte(0) || gross.decimalPlaces() > 2) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be positive with at most 2 decimals');
  }
  const { fee, payout } = withdrawalAmounts(gross, input.method);
  if (gross.lt(config.MIN_WITHDRAWAL_AMOUNT) || payout.lte(0)) {
    throw new AppError(
      422,
      'AMOUNT_BELOW_MINIMUM',
      `Minimum withdrawal is ${config.MIN_WITHDRAWAL_AMOUNT}` +
        (fee.gt(0) ? ` and it must exceed the fee of ${fee.toFixed(2)}` : ''),
    );
  }

  let savedCardId: string | null = null;
  let bankDetailsEnc: string | null = null;
  let bankAccountLast4: string | null = null;

  if (input.method === 'card') {
    if (input.savedCardId) {
      const card = await prisma.savedCard.findUnique({ where: { id: input.savedCardId } });
      if (!card || card.userId !== userId || !card.active) throw new AppError(404, 'CARD_NOT_FOUND');
      savedCardId = card.id;
    } else {
      const card = await getDefaultCard(userId);
      if (!card) throw new AppError(422, 'NO_SAVED_CARD', 'Add a card by making a deposit first');
      savedCardId = card.id;
    }
  } else {
    const bank = input.bank;
    if (!bank) throw new AppError(400, 'BANK_DETAILS_REQUIRED');
    if (!user.verifiedAdult) throw new AppError(403, 'KYC_REQUIRED', 'Identity verification is required for a bank withdrawal');
    // Only to an account in the user's own name
    if (!user.fullName || !namesMatch(user.fullName, bank.holderName)) {
      throw new AppError(422, 'ACCOUNT_NAME_MISMATCH', 'The account must be in your name');
    }
    bankDetailsEnc = encryptField(JSON.stringify(bank));
    bankAccountLast4 = bank.accountNumber.slice(-4);
  }

  const created = await prisma.$transaction(async (tx: Tx) => {
    const rows = await tx.$queryRaw<Array<{ walletBalance: string }>>`
      SELECT "walletBalance"::text FROM "User" WHERE id = ${userId} FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new AppError(404, 'USER_NOT_FOUND');
    if (new Decimal(row.walletBalance).lt(gross)) {
      throw new AppError(402, 'INSUFFICIENT_BALANCE', 'Wallet balance too low');
    }

    // Hold the money now so it cannot be spent twice while the withdrawal is pending
    await tx.user.update({ where: { id: userId }, data: { walletBalance: { decrement: gross.toFixed(2) } } });
    const w = await tx.withdrawal.create({
      data: {
        userId,
        amount: gross.toFixed(2),
        method: input.method,
        fee: fee.toFixed(2),
        status: 'requested',
        savedCardId,
        bankDetailsEnc,
        bankAccountLast4,
      },
    });
    const walletTx = await tx.walletTransaction.create({
      data: {
        userId,
        type: 'withdrawal_hold',
        amount: gross.toFixed(2),
        withdrawalId: w.id,
        description: HOLD_DESCRIPTION,
      },
    });
    await writeAuditLogTx(tx, {
      entityType: 'withdrawal',
      entityId: w.id,
      action: 'withdrawal:requested',
      actorId: userId,
      actorType: 'user',
      metadata: { amount: gross.toFixed(2), fee: fee.toFixed(2), method: input.method, transactionId: walletTx.id },
    });
    return w as WithdrawalRow;
  });

  // Small card withdrawals need no admin
  if (input.method === 'card' && gross.lte(config.AUTO_APPROVE_WITHDRAWAL_LIMIT)) {
    try {
      await approveWithdrawal(created.id, SYSTEM);
    } catch (err) {
      console.error(`[withdrawals] auto-approval of ${created.id} failed, left for an admin:`, err);
    }
  }
  return toView(await reload(created.id));
}

export async function listUserWithdrawals(userId: string) {
  const rows = await prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((w: WithdrawalRow) => toView(w));
}

/** The user cancels while the withdrawal is still `requested`; the hold is released. */
export async function cancelWithdrawal(userId: string, id: string) {
  const w = await reload(id);
  if (w.userId !== userId) throw new AppError(404, 'WITHDRAWAL_NOT_FOUND');
  if (w.status === 'cancelled') return toView(w);
  if (w.status !== 'requested') {
    throw new AppError(409, 'WITHDRAWAL_NOT_CANCELLABLE', `Withdrawal is ${w.status}`);
  }

  await prisma.$transaction(async (tx: Tx) => {
    const { count } = await tx.withdrawal.updateMany({
      where: { id, userId, status: 'requested' },
      data: { status: 'cancelled', decidedAt: new Date() },
    });
    if (count === 0) throw new AppError(409, 'WITHDRAWAL_NOT_CANCELLABLE');
    await releaseHoldTx(tx, w);
    await writeAuditLogTx(tx, {
      entityType: 'withdrawal',
      entityId: id,
      action: 'withdrawal:requested->cancelled',
      actorId: userId,
      actorType: 'user',
    });
  });
  return toView(await reload(id));
}

// ─── Approval and payout ─────────────────────────────────────────────────────

/**
 * requested -> approved, then (card) pays out. Idempotent: only the call that wins the conditional
 * update can pay; a repeat finds the withdrawal already approved or paid and changes nothing.
 * A card payout that throws leaves the withdrawal `approved` (outcome unknown, the money stays
 * held) and the retry job tries again under the same provider idempotency key.
 */
export async function approveWithdrawal(id: string, actor: Actor) {
  const w = await reload(id);
  if (w.status !== 'requested') {
    if (w.status === 'approved' || w.status === 'paid') return toView(w, true);
    throw new AppError(409, 'WITHDRAWAL_NOT_APPROVABLE', `Withdrawal is ${w.status}`);
  }

  const { count } = await prisma.withdrawal.updateMany({
    where: { id, status: 'requested' },
    data: { status: 'approved', adminId: actor.type === 'admin' ? actor.id : null, decidedAt: new Date() },
  });
  if (count === 0) return toView(await reload(id), true);

  await writeAuditLog({
    entityType: 'withdrawal',
    entityId: id,
    action: 'withdrawal:requested->approved',
    actorId: actor.id,
    actorType: actor.type,
    metadata: { method: w.method },
  });

  if (w.method === 'card') await payoutCard(id);
  return toView(await reload(id), true);
}

/** Pays an approved card withdrawal. Does nothing unless it is approved and not yet paid. */
export async function payoutCard(id: string): Promise<void> {
  const w = await prisma.withdrawal.findUnique({ where: { id }, include: { savedCard: true } });
  if (!w || w.status !== 'approved' || w.method !== 'card' || w.providerTxId) return;

  if (!w.savedCard) {
    await failWithdrawal(id, 'CARD_NOT_AVAILABLE');
    return;
  }
  const payout = new Decimal(w.amount.toString()).minus(w.fee.toString());

  let result;
  try {
    result = await getPaymentProvider().creditCard(w.savedCard.token, payout.toNumber(), `withdrawal:${id}`);
  } catch (err) {
    console.error(`[withdrawals] card payout for ${id} did not complete, will retry:`, err);
    await writeAuditLog({
      entityType: 'withdrawal',
      entityId: id,
      action: 'withdrawal:payout_error',
      actorId: 'system',
      actorType: 'system',
    }).catch(console.error);
    return;
  }

  if (result.status === 'failed') {
    await failWithdrawal(id, 'PROVIDER_DECLINED', result.providerTxId);
    return;
  }

  const { count } = await prisma.withdrawal.updateMany({
    where: { id, status: 'approved' },
    data: { status: 'paid', providerTxId: result.providerTxId, paidAt: new Date() },
  });
  await writeAuditLog({
    entityType: 'withdrawal',
    entityId: id,
    // count 0: it was changed while the provider call was running; the money has moved, so flag it
    action: count > 0 ? 'withdrawal:approved->paid' : 'withdrawal:paid_conflict',
    actorId: 'system',
    actorType: 'system',
    metadata: { providerTxId: result.providerTxId, payout: payout.toFixed(2) },
  });
}

/** approved -> failed: the provider declined, so nothing was paid and the hold is released. */
async function failWithdrawal(id: string, reason: string, providerTxId?: string): Promise<void> {
  await prisma.$transaction(async (tx: Tx) => {
    const w = await tx.withdrawal.findUnique({ where: { id } });
    if (!w) return;
    const { count } = await tx.withdrawal.updateMany({
      where: { id, status: 'approved' },
      data: { status: 'failed', failureReason: reason, ...(providerTxId ? { providerTxId } : {}) },
    });
    if (count === 0) return;
    await releaseHoldTx(tx, w);
    await writeAuditLogTx(tx, {
      entityType: 'withdrawal',
      entityId: id,
      action: 'withdrawal:approved->failed',
      actorId: 'system',
      actorType: 'system',
      metadata: { reason },
    });
  });
}

/** Re-runs card payouts that threw earlier (status still `approved`, nothing paid). */
export async function retryStuckCardPayouts(now = new Date()): Promise<number> {
  const stuck = await prisma.withdrawal.findMany({
    where: {
      status: 'approved',
      method: 'card',
      providerTxId: null,
      decidedAt: { lt: new Date(now.getTime() - STUCK_PAYOUT_MIN_AGE_MS) },
    },
    select: { id: true },
    take: 50,
  });
  for (const { id } of stuck) {
    await payoutCard(id).catch((err) => console.error(`[withdrawals] retry of ${id} failed:`, err));
  }
  return stuck.length;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listWithdrawals(status?: WithdrawalStatus) {
  const rows = await prisma.withdrawal.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((w: WithdrawalRow) => toView(w, true));
}

/** Rejects a withdrawal that is waiting (or a bank one approved but not yet paid) and releases the hold. */
export async function rejectWithdrawal(id: string, adminId: string, reason: string) {
  const w = await reload(id);
  if (w.status === 'rejected') return toView(w, true);
  const rejectable = w.status === 'requested' || (w.status === 'approved' && w.method === 'bank');
  if (!rejectable) throw new AppError(409, 'WITHDRAWAL_NOT_REJECTABLE', `Withdrawal is ${w.status}`);

  await prisma.$transaction(async (tx: Tx) => {
    const { count } = await tx.withdrawal.updateMany({
      where: { id, status: w.status },
      data: { status: 'rejected', adminId, decidedAt: new Date(), failureReason: reason },
    });
    if (count === 0) throw new AppError(409, 'WITHDRAWAL_NOT_REJECTABLE');
    await releaseHoldTx(tx, w);
    await writeAuditLogTx(tx, {
      entityType: 'withdrawal',
      entityId: id,
      action: `withdrawal:${w.status}->rejected`,
      actorId: adminId,
      actorType: 'admin',
      metadata: { reason },
    });
  });
  return toView(await reload(id), true);
}

/** Bank withdrawals: the admin made the transfer and records its reference. approved -> paid. */
export async function markWithdrawalPaid(id: string, adminId: string, bankReference: string) {
  const w = await reload(id);
  if (w.method !== 'bank') throw new AppError(409, 'WITHDRAWAL_NOT_BANK', 'Card withdrawals are paid automatically');
  if (w.status === 'paid') return toView(w, true);
  if (w.status !== 'approved') throw new AppError(409, 'WITHDRAWAL_NOT_PAYABLE', `Withdrawal is ${w.status}`);

  const { count } = await prisma.withdrawal.updateMany({
    where: { id, status: 'approved', method: 'bank' },
    data: { status: 'paid', bankReference, paidAt: new Date() },
  });
  if (count === 0) return toView(await reload(id), true);
  await writeAuditLog({
    entityType: 'withdrawal',
    entityId: id,
    action: 'withdrawal:approved->paid',
    actorId: adminId,
    actorType: 'admin',
    metadata: { bankReference },
  });
  return toView(await reload(id), true);
}

/** The decrypted account an admin needs to make the transfer. Every read is audited. */
export async function getBankDetails(id: string, adminId: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) throw new AppError(404, 'WITHDRAWAL_NOT_FOUND');
  if (w.method !== 'bank' || !w.bankDetailsEnc) throw new AppError(409, 'WITHDRAWAL_NOT_BANK');
  await writeAuditLog({
    entityType: 'withdrawal',
    entityId: id,
    action: 'withdrawal:bank_details_viewed',
    actorId: adminId,
    actorType: 'admin',
  });
  return { ...toView(w as WithdrawalRow, true), bank: JSON.parse(decryptField(w.bankDetailsEnc)) as BankDetailsInput };
}
