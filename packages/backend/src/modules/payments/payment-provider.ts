import type { IncomingHttpHeaders } from 'node:http';

export type ProviderPaymentStatus = 'pending' | 'approved' | 'failed' | 'refunded';

export interface CheckoutSession {
  /** Hosted payment page the client opens. */
  checkoutUrl: string;
  /** The provider's id for this payment. Stored as Payment.providerTxId. */
  paymentId: string;
}

export interface WebhookEvent {
  providerTxId: string;
  status: ProviderPaymentStatus;
  amount: number;
  cardLast4?: string;
  cardToken?: string;
  cardBrand?: string;
}

export interface CardCreditResult {
  providerTxId: string;
  /** `failed`: the provider declined, nothing moved. A thrown error means the outcome is unknown. */
  status: 'paid' | 'failed';
}

/**
 * A card-payment provider. Only MockPaymentProvider exists today; the real one
 * (Tranzila / Cardcom / Grow / PayPlus) implements this same interface.
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(userId: string, amount: number): Promise<CheckoutSession>;
  /** Must throw AppError(401, 'INVALID_WEBHOOK_SIGNATURE') if the signature does not verify. */
  verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<WebhookEvent>;
  refund(providerTxId: string, amount: number): Promise<void>;
  /**
   * Pays `amount` out to a saved card (a withdrawal or a prize excess). Must be idempotent on
   * `idempotencyKey`: repeating a call with the same key never pays twice and returns the same result.
   */
  creditCard(cardToken: string, amount: number, idempotencyKey: string): Promise<CardCreditResult>;
}
