import { api } from './api-client';
import type { TicketState } from './ticket-state';
import { toTicketInput } from './ticket-state';
import type { CreateOrderResponse } from './types';

/** POST /orders: charges the wallet for every draw and queues the ticket. */
export function placeOrder(ticket: TicketState): Promise<CreateOrderResponse> {
  return api.post<CreateOrderResponse>('orders', {
    gameType: 'lotto',
    type: 'one_time',
    ticket: toTicketInput(ticket),
  });
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

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `k${Date.now()}${Math.random().toString(36).slice(2)}`;
}
