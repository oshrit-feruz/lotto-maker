import { ApiError, api } from './api-client';
import { clearOrderKey, orderKeyFor } from './order-key';
import type { TicketState } from './ticket-state';
import { toTicketInput } from './ticket-state';
import type { CreateOrderResponse } from './types';

export { newIdempotencyKey } from './order-key';

/**
 * POST /orders: charges the wallet for every draw and queues the ticket.
 * Sends the ticket's Idempotency-Key (see order-key.ts). A repeat of an order that already went
 * through comes back as 201 with `replayed: true`: the same success, without a second charge.
 */
export async function placeOrder(ticket: TicketState): Promise<CreateOrderResponse> {
  const input = toTicketInput(ticket);
  const key = orderKeyFor(input);
  try {
    const result = await api.post<CreateOrderResponse>(
      'orders',
      { gameType: 'lotto', type: 'one_time', ticket: input },
      { 'Idempotency-Key': key },
    );
    clearOrderKey();
    return result;
  } catch (err) {
    // The key was used for another ticket: drop it, so trying again starts a new order.
    if (err instanceof ApiError && err.code === 'IDEMPOTENCY_KEY_REUSED') clearOrderKey();
    throw err;
  }
}

/** Only http(s) URLs are followed for the hosted payment page. */
export function isSafeRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Where the hosted checkout sends the user back. The backend adds `paymentId` to both. */
export function checkoutReturnUrls(origin: string): { successUrl: string; cancelUrl: string } {
  const base = origin.replace(/\/+$/, '');
  return { successUrl: `${base}/payment/success`, cancelUrl: `${base}/payment/canceled` };
}
