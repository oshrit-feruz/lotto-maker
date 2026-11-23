// After an in-place login the pending order goes straight on to checkout, as long as the ticket
// the visitor filled before logging in (kept in sessionStorage) is still complete and valid.
import { isTicketComplete, sanitize, ticketErrors } from './ticket-state';

export interface ResumeInput {
  authenticated: boolean;
  /** The visitor asked to pay before logging in (see markSubmitAfterLogin). */
  submitPending: boolean;
  /** The stored ticket draft, as read from sessionStorage (untrusted). */
  draft: unknown;
}

/** Where to go once logged in: the checkout, or null to stay on the form. */
export function resumeAfterLogin({ authenticated, submitPending, draft }: ResumeInput): '/checkout' | null {
  if (!authenticated || !submitPending || !draft) return null;
  const ticket = sanitize(draft);
  return isTicketComplete(ticket) && ticketErrors(ticket).length === 0 ? '/checkout' : null;
}
