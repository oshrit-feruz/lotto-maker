import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { AppError } from '../../plugins/error-handler.js';
import type { CardCreditResult, CheckoutSession, PaymentProvider, WebhookEvent } from './payment-provider.js';

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

const eventSchema = z.object({
  providerTxId: z.string().min(1),
  status: z.enum(['pending', 'approved', 'failed', 'refunded']),
  amount: z.number().positive(),
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
  cardToken: z.string().min(1).optional(),
  cardBrand: z.string().min(1).max(30).optional(),
});

/** Dev/test provider. Webhooks are signed with HMAC-SHA256 over the raw body. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly refunds: Array<{ providerTxId: string; amount: number }> = [];

  constructor(
    private readonly webhookSecret: string,
    private readonly baseUrl: string,
  ) {}

  async createCheckout(_userId: string, _amount: number): Promise<CheckoutSession> {
    const paymentId = `mock_${nanoid(24)}`;
    return { paymentId, checkoutUrl: `${this.baseUrl}/payments/mock-checkout/${paymentId}` };
  }

  sign(rawBody: Buffer | string): string {
    return createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
  }

  async verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<WebhookEvent> {
    const header = headers[MOCK_SIGNATURE_HEADER];
    const given = Buffer.from(typeof header === 'string' ? header : '', 'utf8');
    const expected = Buffer.from(this.sign(rawBody), 'utf8');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE');
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new AppError(400, 'INVALID_WEBHOOK_PAYLOAD');
    }
    const parsed = eventSchema.safeParse(json);
    if (!parsed.success) throw new AppError(400, 'INVALID_WEBHOOK_PAYLOAD');
    return parsed.data;
  }

  async refund(providerTxId: string, amount: number): Promise<void> {
    this.refunds.push({ providerTxId, amount });
  }

  /** Every creditCard call, including repeats. Tests assert on it. */
  readonly credits: Array<{ cardToken: string; amount: number; idempotencyKey: string }> = [];
  private readonly creditResults = new Map<string, CardCreditResult>();
  /** Test switch: `decline` returns status failed, `throw` simulates a network error. */
  creditFailure: 'none' | 'decline' | 'throw' = 'none';

  async creditCard(cardToken: string, amount: number, idempotencyKey: string): Promise<CardCreditResult> {
    this.credits.push({ cardToken, amount, idempotencyKey });
    const previous = this.creditResults.get(idempotencyKey);
    if (previous) return previous;
    if (this.creditFailure === 'throw') throw new Error('mock provider unavailable');
    const result: CardCreditResult =
      this.creditFailure === 'decline'
        ? { providerTxId: `mock_credit_${nanoid(16)}`, status: 'failed' }
        : { providerTxId: `mock_credit_${nanoid(16)}`, status: 'paid' };
    this.creditResults.set(idempotencyKey, result);
    return result;
  }
}
