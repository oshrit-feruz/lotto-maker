// What the payment return page does with each answer from GET /payments/:id (see PaymentReturn).
import type { PaymentView } from './types';

export type ReturnMode = 'success' | 'canceled';

export const POLL_MS = 2000;
export const POLL_LIMIT = 45; // about 90 seconds

/**
 * - `order`: approved on /payment/success, so place the stored ticket as an order.
 * - `approved`: approved on /payment/canceled; the wallet was credited, nothing is ordered.
 * - `failed`: declined/refunded, or still pending on the canceled page (one check is enough there).
 * - `poll` / `timeout`: still pending on the success page; check again unless the limit is reached.
 * `failed` also means the stored pending payment should be cleared.
 */
export type ReturnStep = 'order' | 'approved' | 'failed' | 'poll' | 'timeout';

/** `attempts` counts the checks already made, including this one. */
export function nextReturnStep(status: PaymentView['status'], mode: ReturnMode, attempts: number): ReturnStep {
  if (status === 'approved') return mode === 'success' ? 'order' : 'approved';
  if (status === 'failed' || status === 'refunded' || mode === 'canceled') return 'failed';
  return attempts >= POLL_LIMIT ? 'timeout' : 'poll';
}
