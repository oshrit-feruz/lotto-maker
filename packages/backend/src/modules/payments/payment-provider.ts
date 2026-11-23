import type { IncomingHttpHeaders } from 'node:http';

export type ProviderPaymentStatus = 'pending' | 'approved' | 'failed' | 'refunded';

export interface CheckoutSession {
  /** Hosted payment page the client opens. */
  checkoutUrl: string;
  /** The provider's id for this payment. Stored as Payment.providerTxId. */
  paymentId: string;
}

export interface CheckoutOptions {
  /**
   * Our Payment.id for this checkout. Providers that carry a merchant reference through the
   * hosted page (Hyp's `uniqueid`) send it, and report it back as WebhookEvent.reference.
   */
  reference?: string;
}

export interface CheckoutReturnUrls {
  successUrl?: string;
  cancelUrl?: string;
}

export interface WebhookEvent {
  providerTxId: string;
  status: ProviderPaymentStatus;
  amount: number;
  cardLast4?: string;
  cardToken?: string;
  cardBrand?: string;
  /** Our Payment.id as the provider reports it (CheckoutOptions.reference). Checked when present. */
  reference?: string;
}

export interface CardChargeResult {
  providerTxId: string;
  /** `failed`: the provider declined, nothing was charged. A thrown error means the outcome is unknown. */
  status: 'approved' | 'failed';
}

export interface CardCreditResult {
  providerTxId: string;
  /** `failed`: the provider declined, nothing moved. A thrown error means the outcome is unknown. */
  status: 'paid' | 'failed';
}

/**
 * A card-payment provider: MockPaymentProvider (dev/test) or HypPaymentProvider (Hyp Enterprise,
 * formerly CreditGuard). PAYMENT_PROVIDER selects one.
 */
export interface PaymentProvider {
  readonly name: string;
  /** The hosted page may be shown in an iframe on our site (otherwise the client redirects to it). */
  readonly embeddable: boolean;
  /**
   * `returnUrls` (already checked against CHECKOUT_RETURN_ORIGINS) is where the hosted page sends
   * the user after paying or cancelling. A provider without per-payment return URLs may ignore it.
   */
  createCheckout(
    userId: string,
    amount: number,
    returnUrls?: CheckoutReturnUrls,
    options?: CheckoutOptions,
  ): Promise<CheckoutSession>;
  /** Must throw AppError(401, 'INVALID_WEBHOOK_SIGNATURE') if the signature does not verify. */
  verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<WebhookEvent>;
  /**
   * Verifies the query parameters the hosted page put on the success / error URL. Never trusts
   * them alone: the signature is checked and the result is confirmed with the provider.
   * Optional: a provider that reports only by webhook does not implement it.
   */
  verifyReturn?(params: Readonly<Record<string, string>>): Promise<WebhookEvent>;
  refund(providerTxId: string, amount: number): Promise<void>;
  /**
   * Charges `amount` to a saved card (a deposit without the hosted page). Must be idempotent on
   * `idempotencyKey`: repeating a call with the same key never charges twice.
   */
  chargeCard(cardToken: string, amount: number, idempotencyKey: string): Promise<CardChargeResult>;
  /**
   * Pays `amount` out to a saved card (a withdrawal or a prize excess). Must be idempotent on
   * `idempotencyKey`: repeating a call with the same key never pays twice and returns the same result.
   */
  creditCard(cardToken: string, amount: number, idempotencyKey: string): Promise<CardCreditResult>;
}
