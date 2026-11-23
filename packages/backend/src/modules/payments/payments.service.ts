import type { IncomingHttpHeaders } from 'node:http';
import { randomUUID } from 'node:crypto';
import { nanoid } from 'nanoid';
import { Decimal } from 'decimal.js';
import { prisma } from '../../prisma.js';
import { config } from '../../config.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog, writeAuditLogTx } from '../../lib/audit-log.js';
import { assertWithinBalanceCap, depositTx, reverseDepositTx, type Tx } from '../wallet/wallet.service.js';
import { saveCardTx } from './cards.service.js';
import { assertDepositAllowed, assertDepositAllowedTx } from '../limits/limits.service.js';
import { notifyInBackground } from '../notifications/notify.service.js';
import type { PaymentProvider, WebhookEvent } from './payment-provider.js';
import { MockPaymentProvider } from './mock-payment-provider.js';
import { HypPaymentProvider } from './hyp/hyp-payment-provider.js';
import { missingHypSettings } from './hyp/hyp-config.js';
import { prepareReturnUrls, type ReturnUrls } from './return-urls.js';

const DEV_WEBHOOK_SECRET = 'dev-only-mock-webhook-secret';

let provider: PaymentProvider | null = null;

function apiBaseUrl(): string {
  return (config.PUBLIC_API_URL ?? `http://localhost:${config.PORT}`).replace(/\/$/, '');
}

function createHypProvider(): HypPaymentProvider {
  const missing = missingHypSettings(config);
  if (missing.length > 0) {
    // Names only, never values. Production refuses to start without them (config.ts).
    console.error(`[payments] PAYMENT_PROVIDER=hyp but ${missing.join(', ')} not set`);
    throw new AppError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Payments are not available yet');
  }
  const returnPage = `${apiBaseUrl()}/payments/return`;
  return new HypPaymentProvider({
    gatewayUrl: config.HYP_GATEWAY_URL!,
    terminalNumber: config.HYP_TERMINAL_NUMBER!,
    user: config.HYP_USER!,
    password: config.HYP_PASSWORD!,
    mid: config.HYP_MID!,
    successUrl: config.HYP_SUCCESS_URL ?? returnPage,
    errorUrl: config.HYP_ERROR_URL ?? returnPage,
    cancelUrl: config.HYP_CANCEL_URL ?? `${returnPage}/cancel`,
    frameAncestors: config.CHECKOUT_RETURN_ORIGINS,
    language: config.HYP_LANGUAGE,
    timeoutMs: config.HYP_TIMEOUT_MS,
  });
}

export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;
  if (config.PAYMENT_PROVIDER === 'hyp') {
    provider = createHypProvider();
    return provider;
  }
  // The mock provider approves payments without charging anyone, so it must
  // never run in production. Deposits stay closed until a real provider exists.
  if (config.NODE_ENV === 'production') {
    throw new AppError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Payments are not available yet');
  }
  provider = new MockPaymentProvider(config.PAYMENT_WEBHOOK_SECRET ?? DEV_WEBHOOK_SECRET, apiBaseUrl());
  return provider;
}

/** The user about to deposit: 404 if unknown, 403 if suspended. */
async function loadDepositor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, walletBalance: true },
  });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND');
  if (user.status === 'suspended') throw new AppError(403, 'ACCOUNT_SUSPENDED');
  return user;
}

export interface CheckoutResult {
  paymentId: string;
  checkoutUrl: string;
  status: string;
  /** Show checkoutUrl in an iframe on the site (Hyp) instead of redirecting to it (mock). */
  embed: boolean;
}

/**
 * Starts a card payment. Nothing is credited here: the wallet only changes when
 * the provider's webhook confirms the payment (processWebhook).
 */
export async function createCheckout(
  userId: string,
  amount: number,
  idempotencyKey?: string,
  returnUrls: ReturnUrls = {},
): Promise<CheckoutResult> {
  // Refuse a return URL off the allowlist before anything else (422 INVALID_RETURN_URL)
  const wantsReturn = returnUrls.successUrl !== undefined || returnUrls.cancelUrl !== undefined;
  if (wantsReturn) prepareReturnUrls(returnUrls, 'check');

  const user = await loadDepositor(userId);

  if (idempotencyKey) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.userId !== userId || !new Decimal(existing.amount.toString()).equals(amount)) {
        throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED');
      }
      const embed = existing.provider === getPaymentProvider().name && getPaymentProvider().embeddable;
      return { paymentId: existing.id, checkoutUrl: existing.checkoutUrl ?? '', status: existing.status, embed };
    }
  }

  // Early rejection so the user is not charged for a deposit we would refuse.
  // The authoritative check runs again, under a row lock, when the webhook lands.
  assertWithinBalanceCap(user.walletBalance.toString(), amount);
  // Self-exclusion (403 SELF_EXCLUDED) and deposit limits (422 DEPOSIT_LIMIT)
  await assertDepositAllowed(userId, amount);

  const paymentProvider = getPaymentProvider();
  // The payment id is chosen here, so it can go on the return URLs and to the provider
  // (Hyp's uniqueid) before the provider call
  const presetId = `pay${randomUUID().replace(/-/g, '')}`;
  const session = await paymentProvider.createCheckout(
    userId,
    amount,
    wantsReturn ? prepareReturnUrls(returnUrls, presetId) : undefined,
    { reference: presetId },
  );

  const payment = await prisma.payment.create({
    data: {
      id: presetId,
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

  return {
    paymentId: payment.id,
    checkoutUrl: session.checkoutUrl,
    status: payment.status,
    embed: paymentProvider.embeddable,
  };
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
  | 'cap_exceeded'
  /** Self-excluded or over a deposit limit when the webhook landed: not credited, refunded. */
  | 'rg_blocked';

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
  const { outcome } = await applyProviderEvent(paymentProvider, event);
  return { outcome };
}

/**
 * The user's browser came back from the hosted page with the provider's result parameters
 * (Hyp's success / error redirect). The provider verifies them and confirms the result with
 * the gateway; then it is the same idempotent path as a webhook, so a return and a webhook
 * for the same payment credit the wallet once.
 */
export async function processReturn(
  params: Readonly<Record<string, string>>,
): Promise<{ outcome: WebhookOutcome; paymentId: string; status: string }> {
  const paymentProvider = getPaymentProvider();
  if (!paymentProvider.verifyReturn) throw new AppError(404, 'NOT_FOUND');
  const event = await paymentProvider.verifyReturn(params);
  const { outcome, paymentId } = await applyProviderEvent(paymentProvider, event);
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
  return { outcome, paymentId, status: payment?.status ?? 'pending' };
}

/** Applies a verified provider event to its payment. Idempotent: see processWebhook. */
async function applyProviderEvent(
  paymentProvider: PaymentProvider,
  event: WebhookEvent,
): Promise<{ outcome: WebhookOutcome; paymentId: string }> {
  const result = await prisma.$transaction(async (tx: Tx) => {
    const payment = await tx.payment.findUnique({ where: { providerTxId: event.providerTxId } });
    if (!payment || payment.provider !== paymentProvider.name) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND');
    }
    if (event.reference !== undefined && event.reference !== payment.id) {
      throw new AppError(400, 'PAYMENT_REFERENCE_MISMATCH');
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

    // Responsible gaming, again at credit time: the user may have self-excluded or lowered a
    // limit since checkout, and concurrent checkouts may each have fit the same remaining limit.
    // Under the User row lock that limit changes, orders and other credits also take.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${payment.userId} FOR UPDATE`;
    try {
      await assertDepositAllowedTx(tx, payment.userId, amount, { excludePaymentId: payment.id });
    } catch (err) {
      if (!(err instanceof AppError) || (err.code !== 'SELF_EXCLUDED' && err.code !== 'DEPOSIT_LIMIT')) throw err;
      // Same handling as the wallet cap: credit nothing, mark it failed, refund after the commit
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
      await writeAuditLogTx(tx, {
        entityType: 'payment',
        entityId: payment.id,
        action: 'payment:rejected_responsible_gaming',
        actorId: 'system',
        actorType: 'system',
        metadata: { amount: amount.toFixed(2), code: err.code, details: err.details },
      });
      return { ...base, outcome: 'rg_blocked' as const, refundAmount: amount.toNumber() };
    }

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

  if (result.outcome === 'cap_exceeded' || result.outcome === 'rg_blocked') {
    await refundRejectedPayment(paymentProvider, result.paymentId, event.providerTxId, result.refundAmount);
  }

  if (result.outcome === 'credited') {
    notifyInBackground(result.userId, 'deposit_receipt', { amount: event.amount.toFixed(2) });
  }

  return { outcome: result.outcome, paymentId: result.paymentId };
}

/**
 * Deposit from a saved card, without the hosted page (later deposits, auto-renew). Same checks
 * as createCheckout; the charge is idempotent on `deposit:<paymentId>` at the provider, and the
 * credit goes through applyProviderEvent like any other approved payment.
 */
export async function chargeSavedCard(
  userId: string,
  cardId: string,
  amount: number,
  idempotencyKey: string,
): Promise<{ paymentId: string; status: string }> {
  const user = await loadDepositor(userId);

  const card = await prisma.savedCard.findUnique({ where: { id: cardId } });
  if (!card || card.userId !== userId || !card.active) throw new AppError(404, 'CARD_NOT_FOUND');

  const paymentProvider = getPaymentProvider();
  let payment = await prisma.payment.findUnique({ where: { idempotencyKey } });
  if (payment) {
    if (payment.userId !== userId || !new Decimal(payment.amount.toString()).equals(amount)) {
      throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED');
    }
    // Settled already: a repeat returns the same result. Still pending: the outcome of the first
    // attempt was unknown, so the charge is retried with the same provider key below.
    if (payment.status !== 'pending') return { paymentId: payment.id, status: payment.status };
  } else {
    assertWithinBalanceCap(user.walletBalance.toString(), amount);
    await assertDepositAllowed(userId, amount);
    const id = `pay${randomUUID().replace(/-/g, '')}`;
    payment = await prisma.payment.create({
      data: {
        id,
        provider: paymentProvider.name,
        // Placeholder until the provider names the transaction (unique per payment)
        providerTxId: `${paymentProvider.name}_pending_${id}`,
        userId,
        amount,
        status: 'pending',
        idempotencyKey,
      },
    });
    await writeAuditLog({
      entityType: 'payment',
      entityId: payment.id,
      action: 'payment:saved_card_charge_created',
      actorId: userId,
      actorType: 'user',
      metadata: { amount: String(amount), provider: paymentProvider.name, cardId },
    });
  }

  let charged;
  try {
    charged = await paymentProvider.chargeCard(card.token, amount, `deposit:${payment.id}`);
  } catch (err) {
    // Outcome unknown: the payment stays pending and a retry with the same key is safe
    console.error(`[payments] saved-card charge for payment ${payment.id} did not complete`, err);
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'The charge could not be completed, try again');
  }

  await prisma.payment.update({ where: { id: payment.id }, data: { providerTxId: charged.providerTxId } });
  const { outcome } = await applyProviderEvent(paymentProvider, {
    providerTxId: charged.providerTxId,
    status: charged.status,
    amount,
    cardLast4: card.last4,
    cardToken: card.token,
    reference: payment.id,
  });
  const after = await prisma.payment.findUnique({ where: { id: payment.id }, select: { status: true } });
  return { paymentId: payment.id, status: after?.status ?? (outcome === 'credited' ? 'approved' : 'pending') };
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
