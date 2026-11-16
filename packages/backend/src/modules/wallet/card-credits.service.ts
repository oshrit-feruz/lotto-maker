import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { getPaymentProvider } from '../payments/payments.service.js';
import { getDefaultCard } from '../payments/cards.service.js';
import { notifyInBackground } from '../notifications/notify.service.js';
import { retryStuckCardPayouts } from './withdrawals.service.js';
import { pageWindow, DEFAULT_PAGING, type Paged, type Paging } from '../admin/paging.js';

const BACKOFF_BASE_MS = 5 * 60 * 1000;
const BACKOFF_MAX_MS = 24 * 60 * 60 * 1000;
const BATCH = 50;
/**
 * A `processing` claim older than this is taken to belong to a runner that died mid-payout, and the
 * job claims it again. Retrying is safe: the provider key is stable per credit and card, so a
 * payout that did go through is returned again, not paid twice.
 */
export const CLAIM_STALE_MS = 15 * 60 * 1000;

export type CardCreditStatus = 'pending' | 'processing' | 'paid' | 'failed';

/** Wait before the next try after `attempts` tries: 5 min, 10, 20, ... capped at 24 h. */
export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(attempts - 1, 0), BACKOFF_MAX_MS);
}

export type CardCreditOutcome = 'paid' | 'no_card' | 'failed' | 'skipped';

interface CreditRow {
  id: string;
  orderId: string | null;
  withdrawalId: string | null;
  userId: string;
  amount: { toString(): string };
  status: CardCreditStatus;
  attempts: number;
  nextAttemptAt: Date;
  claimedAt: Date | null;
}

/**
 * Pays one credit to the user's default card. The job first claims the credit: a compare-and-set
 * moves it `pending` -> `processing` (or takes over a stale `processing` claim), so only one runner
 * proceeds, and an admin cannot mark it paid by hand while the provider call is in flight
 * (409 CREDIT_IN_PROGRESS). Anything but success puts it back to `pending` with the reason in
 * lastError, to be retried after a backoff.
 */
export async function payCardCredit(id: string, now = new Date()): Promise<CardCreditOutcome> {
  const credit = (await prisma.pendingCardCredit.findUnique({ where: { id } })) as CreditRow | null;
  if (!credit) return 'skipped';

  let claimWhere: Record<string, unknown>;
  if (credit.status === 'pending') {
    if (credit.nextAttemptAt > now) return 'skipped';
    claimWhere = { id, status: 'pending', nextAttemptAt: credit.nextAttemptAt };
  } else if (credit.status === 'processing' && credit.claimedAt && credit.claimedAt.getTime() < now.getTime() - CLAIM_STALE_MS) {
    claimWhere = { id, status: 'processing', claimedAt: credit.claimedAt };
  } else {
    return 'skipped';
  }

  const attempts = credit.attempts + 1;
  const claimedAt = now;
  const { count } = await prisma.pendingCardCredit.updateMany({
    where: claimWhere,
    data: {
      status: 'processing',
      claimedAt,
      attempts: { increment: 1 },
      nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
    },
  });
  if (count === 0) return 'skipped';
  if (credit.status === 'processing') {
    console.warn(`[card-credits] reclaimed ${id}: its claim from ${credit.claimedAt?.toISOString()} went stale`);
  }

  // Back to pending, unless another runner has since reclaimed it
  const fail = async (error: string, outcome: CardCreditOutcome) => {
    await prisma.pendingCardCredit.updateMany({
      where: { id, status: 'processing', claimedAt },
      data: { status: 'pending', claimedAt: null, lastError: error },
    });
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
    where: { id, status: 'processing' },
    data: { status: 'paid', providerTxId: result.providerTxId, paidAt: new Date(), lastError: null, claimedAt: null },
  });
  await writeAuditLog({
    entityType: 'card_credit',
    entityId: id,
    orderId: credit.orderId ?? undefined,
    // count 0: no longer ours to record (cannot be a manual payment, which `processing` blocks).
    // Flag it for review all the same.
    action: paid.count > 0 ? 'card_credit:pending->paid' : 'card_credit:paid_conflict',
    actorId: 'system',
    actorType: 'system',
    metadata: { amount: credit.amount.toString(), providerTxId: result.providerTxId, withdrawalId: credit.withdrawalId },
  });
  if (paid.count > 0) notifyInBackground(credit.userId, 'card_credit_paid', { amount: credit.amount.toString() });
  return 'paid';
}

let running = false;

/**
 * The job: pays every pending credit that is due and every stale claim, then retries card
 * withdrawals that were left unpaid.
 */
export async function runCardCreditJob(now = new Date()): Promise<Record<CardCreditOutcome, number>> {
  const tally: Record<CardCreditOutcome, number> = { paid: 0, no_card: 0, failed: 0, skipped: 0 };
  if (running) return tally;
  running = true;
  try {
    const [due, stale] = await Promise.all([
      prisma.pendingCardCredit.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: now } },
        select: { id: true },
        take: BATCH,
      }),
      prisma.pendingCardCredit.findMany({
        where: { status: 'processing', claimedAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } },
        select: { id: true },
        take: BATCH,
      }),
    ]);
    for (const { id } of [...due, ...stale]) {
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

interface AdminCreditRow extends CreditRow {
  lastError: string | null;
  providerTxId: string | null;
  paidAt: Date | null;
  paidByAdminId: string | null;
  manualReference: string | null;
  createdAt: Date;
  user: { phone: string; fullName: string | null };
}

/** Newest first, a page at a time. Each item names the user (phone and name only, no ID data). */
export async function listCardCredits(status?: CardCreditStatus, paging: Paging = DEFAULT_PAGING) {
  const where = status ? { status } : {};
  const [rows, total] = await Promise.all([
    prisma.pendingCardCredit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...pageWindow(paging),
      include: { user: { select: { phone: true, fullName: true } } },
    }),
    prisma.pendingCardCredit.count({ where }),
  ]);
  const items = (rows as AdminCreditRow[]).map((c) => ({
    id: c.id,
    orderId: c.orderId,
    withdrawalId: c.withdrawalId,
    userId: c.userId,
    user: { phone: c.user.phone, fullName: c.user.fullName },
    amount: c.amount.toString(),
    status: c.status,
    attempts: c.attempts,
    nextAttemptAt: c.nextAttemptAt,
    claimedAt: c.claimedAt,
    lastError: c.lastError,
    providerTxId: c.providerTxId,
    paidAt: c.paidAt,
    paidByAdminId: c.paidByAdminId,
    manualReference: c.manualReference,
    createdAt: c.createdAt,
  }));
  return { items, total, ...paging } satisfies Paged<(typeof items)[number]>;
}

/**
 * An admin paid this credit outside the system (e.g. a bank transfer). pending -> paid, once.
 * Refused with 409 CREDIT_IN_PROGRESS while the job holds a claim on it, since the provider may
 * be paying it at that moment.
 */
export async function markCardCreditPaid(id: string, adminId: string, reference: string) {
  const credit = (await prisma.pendingCardCredit.findUnique({ where: { id } })) as CreditRow | null;
  if (!credit) throw new AppError(404, 'CARD_CREDIT_NOT_FOUND');
  if (credit.status === 'paid') return { id, status: 'paid' as const };
  if (credit.status === 'processing') {
    throw new AppError(409, 'CREDIT_IN_PROGRESS', 'The card payout is being processed; try again shortly');
  }

  const { count } = await prisma.pendingCardCredit.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'paid', paidAt: new Date(), paidByAdminId: adminId, manualReference: reference },
  });
  if (count === 0) {
    const now = (await prisma.pendingCardCredit.findUnique({ where: { id } })) as CreditRow | null;
    if (now?.status === 'processing') {
      throw new AppError(409, 'CREDIT_IN_PROGRESS', 'The card payout is being processed; try again shortly');
    }
    throw new AppError(409, 'CARD_CREDIT_NOT_PENDING');
  }
  await writeAuditLog({
    entityType: 'card_credit',
    entityId: id,
    orderId: credit.orderId ?? undefined,
    action: 'card_credit:pending->paid_manual',
    actorId: adminId,
    actorType: 'admin',
    metadata: { reference, amount: credit.amount.toString(), withdrawalId: credit.withdrawalId },
  });
  notifyInBackground(credit.userId, 'card_credit_paid', { amount: credit.amount.toString() });
  return { id, status: 'paid' as const };
}
