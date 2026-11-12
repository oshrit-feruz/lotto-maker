import type { IncomingHttpHeaders } from 'node:http';
import { nanoid } from 'nanoid';
import { Decimal } from 'decimal.js';
import { prisma } from '../../prisma.js';
import { config } from '../../config.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog, writeAuditLogTx } from '../../lib/audit-log.js';
import { assertWithinBalanceCap, depositTx, reverseDepositTx, type Tx } from '../wallet/wallet.service.js';
import { saveCardTx } from './cards.service.js';
import { assertDepositAllowed } from '../limits/limits.service.js';
import type { PaymentProvider } from './payment-provider.js';
import { MockPaymentProvider } from './mock-payment-provider.js';

const DEV_WEBHOOK_SECRET = 'dev-only-mock-webhook-secret';

let provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;
  // The mock provider approves payments without charging anyone, so it must
  // never run in production. Deposits stay closed until a real provider exists.
  if (config.NODE_ENV === 'production') {
    throw new AppError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Payments are not available yet');
  }
  provider = new MockPaymentProvider(
    config.PAYMENT_WEBHOOK_SECRET ?? DEV_WEBHOOK_SECRET,
    (config.PUBLIC_API_URL ?? `http://localhost:${config.PORT}`).replace(/\/$/, ''),
  );
  return provider;
}

export interface CheckoutResult {
  paymentId: string;
  checkoutUrl: string;
  status: string;
}

/**
 * Starts a card payment. Nothing is credited here: the wallet only changes when
 * the provider's webhook confirms the payment (processWebhook).
 */
export async function createCheckout(
  userId: string,
  amount: number,
  idempotencyKey?: string,
): Promise<CheckoutResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, walletBalance: true },
  });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND');
  if (user.status === 'suspended') throw new AppError(403, 'ACCOUNT_SUSPENDED');

  if (idempotencyKey) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.userId !== userId || !new Decimal(existing.amount.toString()).equals(amount)) {
        throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED');
      }
      return { paymentId: existing.id, checkoutUrl: existing.checkoutUrl ?? '', status: existing.status };
    }
  }

  // Early rejection so the user is not charged for a deposit we would refuse.
  // The authoritative check runs again, under a row lock, when the webhook lands.
  assertWithinBalanceCap(user.walletBalance.toString(), amount);
  // Self-exclusion (403 SELF_EXCLUDED) and deposit limits (422 DEPOSIT_LIMIT)
  await assertDepositAllowed(userId, amount);

  const paymentProvider = getPaymentProvider();
  const session = await paymentProvider.createCheckout(userId, amount);

  const payment = await prisma.payment.create({
    data: {
      provider: paymentProvider.name,
      providerTxId: session.paymentId,
      userId,
      amount,
      status: 'pending',
      idempotencyKey: idempotencyKey ?? nanoid(),
      checkoutUrl: session.checkoutUrl,
    },
  });

  await writeAuditLog({
    entityType: 'payment',
    entityId: payment.id,
    action: 'payment:checkout_created',
    actorId: userId,
    actorType: 'user',
    metadata: { amount: String(amount), provider: paymentProvider.name },
  });

  return { paymentId: payment.id, checkoutUrl: session.checkoutUrl, status: payment.status };
}

export async function getPayment(paymentId: string, userId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND');
  if (payment.userId !== userId) throw new AppError(403, 'FORBIDDEN');
  return {
    paymentId: payment.id,
    status: payment.status,
    amount: payment.amount.toFixed(2),
    cardLast4: payment.cardLast4,
    createdAt: payment.createdAt,
  };
}

export type WebhookOutcome =
  | 'credited'
  | 'failed'
  | 'refunded'
  | 'reversed'
  | 'duplicate'
  | 'ignored'
  | 'cap_exceeded';

/**
 * Handles a provider webhook. The signature is verified first; the wallet is
 * credited only for `approved`, in the same transaction that moves the payment
 * out of `pending`. That transition is a conditional update, so a repeated or
 * concurrent webhook finds nothing to claim and credits nothing.
 */
export async function processWebhook(
  rawBody: Buffer,
  headers: IncomingHttpHeaders,
): Promise<{ outcome: WebhookOutcome }> {
  const paymentProvider = getPaymentProvider();
  const event = await paymentProvider.verifyWebhook(rawBody, headers);

  const result = await prisma.$transaction(async (tx: Tx) => {
    const payment = await tx.payment.findUnique({ where: { providerTxId: event.providerTxId } });
    if (!payment || payment.provider !== paymentProvider.name) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND');
    }
    const base = { paymentId: payment.id, userId: payment.userId };

    if (event.status === 'pending') return { ...base, outcome: 'ignored' as const };
    if (payment.status === 'approved' && event.status === 'refunded') {
      return { ...base, ...(await reverseApprovedPayment(tx, payment)) };
    }
    if (payment.status !== 'pending') return { ...base, outcome: 'duplicate' as const };

    if (event.status !== 'approved') {
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: { status: event.status },
      });
      if (count === 0) return { ...base, outcome: 'duplicate' as const };
      await writeAuditLogTx(tx, {
        entityType: 'payment',
        entityId: payment.id,
        action: `payment:pending->${event.status}`,
        actorId: 'system',
        actorType: 'system',
      });
      return { ...base, outcome: event.status };
    }

    const amount = new Decimal(payment.amount.toString());
    if (!amount.equals(event.amount)) {
      throw new AppError(400, 'AMOUNT_MISMATCH', 'Webhook amount does not match the payment');
    }

    // Claim the payment. Only one webhook delivery can win this update.
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: 'pending' },
      data: {
        status: 'approved',
        cardLast4: event.cardLast4 ?? null,
        cardToken: event.cardToken ?? null,
      },
    });
    if (count === 0) return { ...base, outcome: 'duplicate' as const };

    try {
      await depositTx(tx, payment.userId, amount.toNumber(), 'הפקדה לארנק', payment.id);
    } catch (err) {
      if (!(err instanceof AppError) || err.code !== 'WALLET_CAP_EXCEEDED') throw err;
      // The provider took the money but the wallet may not hold it: credit
      // nothing, mark the payment failed and refund it once we have committed.
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
      await writeAuditLogTx(tx, {
        entityType: 'payment',
        entityId: payment.id,
        action: 'payment:rejected_wallet_cap',
        actorId: 'system',
        actorType: 'system',
        metadata: { amount: amount.toFixed(2), cap: config.WALLET_BALANCE_CAP },
      });
      return { ...base, outcome: 'cap_exceeded' as const, refundAmount: amount.toNumber() };
    }

    await saveCardTx(tx, payment.userId, {
      token: event.cardToken,
      last4: event.cardLast4,
      brand: event.cardBrand,
    });

    await writeAuditLogTx(tx, {
      entityType: 'payment',
      entityId: payment.id,
      action: 'payment:pending->approved',
      actorId: 'system',
      actorType: 'system',
      metadata: { amount: amount.toFixed(2) },
    });
    return { ...base, outcome: 'credited' as const };
  });

  if (result.outcome === 'cap_exceeded') {
    await refundRejectedPayment(paymentProvider, result.paymentId, event.providerTxId, result.refundAmount);
  }

  return { outcome: result.outcome };
}

/**
 * approved -> refunded: the provider gave the money back, so the credit must
 * leave the wallet. Only one delivery can win the conditional update; repeats
 * find the payment already `refunded` and do nothing. If the user has already
 * spent part of it, the wallet is emptied (never negative), the account is
 * suspended and the shortfall is written to the audit log.
 */
async function reverseApprovedPayment(tx: Tx, payment: { id: string; userId: string; amount: { toString(): string } }) {
  const { count } = await tx.payment.updateMany({
    where: { id: payment.id, status: 'approved' },
    data: { status: 'refunded' },
  });
  if (count === 0) return { outcome: 'duplicate' as const };

  const amount = new Decimal(payment.amount.toString());
  const { debited, shortfall } = await reverseDepositTx(
    tx,
    payment.userId,
    amount.toNumber(),
    'ביטול הפקדה (זיכוי מהספק)',
    payment.id,
  );

  await writeAuditLogTx(tx, {
    entityType: 'payment',
    entityId: payment.id,
    action: 'payment:approved->refunded',
    actorId: 'system',
    actorType: 'system',
    metadata: { amount: amount.toFixed(2), debited: String(debited) },
  });

  if (shortfall > 0) {
    await tx.user.update({ where: { id: payment.userId }, data: { status: 'suspended' } });
    await writeAuditLogTx(tx, {
      entityType: 'payment',
      entityId: payment.id,
      action: 'payment:chargeback_shortfall',
      actorId: 'system',
      actorType: 'system',
      metadata: { userId: payment.userId, amount: amount.toFixed(2), shortfall: String(shortfall) },
    });
  }
  return { outcome: 'reversed' as const };
}

async function refundRejectedPayment(
  paymentProvider: PaymentProvider,
  paymentId: string,
  providerTxId: string,
  amount: number,
): Promise<void> {
  try {
    await paymentProvider.refund(providerTxId, amount);
    await prisma.payment.update({ where: { id: paymentId }, data: { status: 'refunded' } });
    await writeAuditLog({
      entityType: 'payment',
      entityId: paymentId,
      action: 'payment:failed->refunded',
      actorId: 'system',
      actorType: 'system',
    });
  } catch (err) {
    // The payment stays `failed` with money held at the provider: needs manual refund.
    console.error(`[payments] refund failed for payment ${paymentId}`, err);
    await writeAuditLog({
      entityType: 'payment',
      entityId: paymentId,
      action: 'payment:refund_failed',
      actorId: 'system',
      actorType: 'system',
    }).catch(console.error);
  }
}
