// The ticket being bought survives the round trip to the hosted payment page
// in sessionStorage. It holds only the ticket (numbers, type), never a token.
import type { TicketState } from './ticket-state';

const DRAFT_KEY = 'lm_ticket_draft';
const PAYMENT_KEY = 'lm_pending_payment';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveDraft(state: TicketState): void {
  storage()?.setItem(DRAFT_KEY, JSON.stringify(state));
}

export function loadDraft(): unknown {
  const raw = storage()?.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  storage()?.removeItem(DRAFT_KEY);
}

export interface PendingPayment {
  paymentId: string;
  /** Ticket total the top-up was for. */
  total: string;
}

export function savePendingPayment(p: PendingPayment): void {
  storage()?.setItem(PAYMENT_KEY, JSON.stringify(p));
}

export function loadPendingPayment(): PendingPayment | null {
  const raw = storage()?.getItem(PAYMENT_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingPayment;
    return typeof p?.paymentId === 'string' ? p : null;
  } catch {
    return null;
  }
}

export function clearPendingPayment(): void {
  storage()?.removeItem(PAYMENT_KEY);
}
