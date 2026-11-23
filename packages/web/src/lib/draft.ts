// The ticket being bought survives the round trip to the hosted payment page
// in sessionStorage. It holds only the ticket (numbers, type), never a token.
import type { TicketState } from './ticket-state';

const DRAFT_KEY = 'lm_ticket_draft';
const PAYMENT_KEY = 'lm_pending_payment';
const SUBMIT_KEY = 'lm_submit_after_login';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** setItem that never throws (quota exceeded, storage disabled). False when nothing was stored. */
function safeSet(key: string, value: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unusable.
  }
}

/** False when the browser refused to store the draft; the ticket then lives only in memory. */
export function saveDraft(state: TicketState): boolean {
  return safeSet(DRAFT_KEY, JSON.stringify(state));
}

export function loadDraft(): unknown {
  try {
    const raw = storage()?.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  safeRemove(DRAFT_KEY);
}

/** The visitor pressed "continue to payment" while logged out: once logged in, the order goes on to checkout. */
export function markSubmitAfterLogin(): boolean {
  return safeSet(SUBMIT_KEY, '1');
}

/** Reads and clears the flag set by {@link markSubmitAfterLogin}. */
export function takeSubmitAfterLogin(): boolean {
  let pending = false;
  try {
    pending = storage()?.getItem(SUBMIT_KEY) === '1';
  } catch {
    pending = false;
  }
  safeRemove(SUBMIT_KEY);
  return pending;
}

export function clearSubmitAfterLogin(): void {
  safeRemove(SUBMIT_KEY);
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
