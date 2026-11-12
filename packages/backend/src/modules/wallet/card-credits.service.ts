import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { getPaymentProvider } from '../payments/payments.service.js';
import { getDefaultCard } from '../payments/cards.service.js';
import { retryStuckCardPayouts } from './withdrawals.service.js';

const BACKOFF_BASE_MS = 5 * 60 * 1000;
const BACKOFF_MAX_MS = 24 * 60 * 60 * 1000;
const BATCH = 50;

/** Wait before the next try after `attempts` tries: 5 min, 10, 20, ... capped at 24 h. */
export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(attempts - 1, 0), BACKOFF_MAX_MS);
}

export type CardCreditOutcome = 'paid' | 'no_card' | 'failed' | 'skipped';

/**
 * Pays one pending credit to the user's default card. Safe to call from several runners:
 * the attempt is claimed by moving nextAttemptAt (compare-and-set on the value we read), so only
 * one runner proceeds. The provider key is stable per credit and card, so a crash between
 * the provider paying and us recording it cannot pay twice. Anything but success leaves the
 * credit pending, with the reason in lastError, to be retried later.
 */
export async function payCardCredit(id: string, now = new Date()): Promise<CardCreditOutcome> {
  const credit = await prisma.pendingCardCredit.findUnique({ where: { id } });
  if (!credit || credit.status !== 'pending' || credit.nextAttemptAt > now) return 'skipped';

  const attempts = credit.attempts + 1;
  const { count } = await prisma.pendingCardCredit.updateMany({
    where: { id, status: 'pending', nextAttemptAt: credit.nextAttemptAt },
    data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)) },
  });
  if (count === 0) return 'skipped';

  const fail = async (error: string, outcome: CardCreditOutcome) => {
    await prisma.pendingCardCredit.updateMany({ where: { id, status: 'pending' }, data: { lastError: error } });
    return outcome;
  };

  const card = await getDefaultCard(credit.userId);
  if (!card) return fail('NO_SAVED_CARD', 'no_card');

  let result;
  try {
    result = await getPaymentProvider().creditCard(
      card.token,
      Number(credit.amount.toString()),
      `card-credit:${id}:${card.id}`,
    );
  } catch (err) {
    console.error(`[card-credits] payout of ${id} did not complete, will retry:`, err);
    return fail('PROVIDER_ERROR', 'failed');
  }
  if (result.status === 'failed') return fail('PROVIDER_DECLINED', 'failed');

  const paid = await prisma.pendingCardCredit.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'paid', providerTxId: result.providerTxId, paidAt: new Date(), lastError: null },
  });
  await writeAuditLog({
    entityType: 'card_credit',
    entityId: id,
    orderId: credit.orderId,
    // count 0: an admin marked it paid while the provider call ran; the money has moved twice, so flag it
    action: paid.count > 0 ? 'card_credit:pending->paid' : 'card_credit:paid_conflict',
    actorId: 'system',
    actorType: 'system',
    metadata: { amount: credit.amount.toString(), providerTxId: result.providerTxId },
  });
  return 'paid';
}

let running = false;

/** The job: pays every pending credit that is due, then retries card withdrawals that were left unpaid. */
export async function runCardCreditJob(now = new Date()): Promise<Record<CardCreditOutcome, number>> {
  const tally: Record<CardCreditOutcome, number> = { paid: 0, no_card: 0, failed: 0, skipped: 0 };
  if (running) return tally;
  running = true;
  try {
    const due = await prisma.pendingCardCredit.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: now } },
      select: { id: true },
      take: BATCH,
    });
    for (const { id } of due) {
      try {
        tally[await payCardCredit(id, now)]++;
      } catch (err) {
        console.error(`[card-credits] ${id} failed:`, err);
      }
    }
    await retryStuckCardPayouts(now).catch((err) => console.error('[withdrawals] retry job failed:', err));
  } finally {
    running = false;
  }
  return tally;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function listCardCredits(status?: 'pending' | 'paid' | 'failed') {
  return prisma.pendingCardCredit.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      orderId: true,
      userId: true,
      amount: true,
      status: true,
      attempts: true,
      nextAttemptAt: true,
      lastError: true,
      providerTxId: true,
      paidAt: true,
      paidByAdminId: true,
      manualReference: true,
      createdAt: true,
    },
  });
}

/** An admin paid this credit outside the system (e.g. a bank transfer). pending -> paid, once. */
export async function markCardCreditPaid(id: string, adminId: string, reference: string) {
  const credit = await prisma.pendingCardCredit.findUnique({ where: { id } });
  if (!credit) throw new AppError(404, 'CARD_CREDIT_NOT_FOUND');
  if (credit.status === 'paid') return { id, status: 'paid' as const };

  const { count } = await prisma.pendingCardCredit.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'paid', paidAt: new Date(), paidByAdminId: adminId, manualReference: reference },
  });
  if (count === 0) throw new AppError(409, 'CARD_CREDIT_NOT_PENDING');
  await writeAuditLog({
    entityType: 'card_credit',
    entityId: id,
    orderId: credit.orderId,
    action: 'card_credit:pending->paid_manual',
    actorId: adminId,
    actorType: 'admin',
    metadata: { reference, amount: credit.amount.toString() },
  });
  return { id, status: 'paid' as const };
}
