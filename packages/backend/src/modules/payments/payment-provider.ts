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
}
