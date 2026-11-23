// After an in-place login the pending order goes straight on to checkout, as long as the ticket
// the visitor filled before logging in (kept in sessionStorage) is still complete and valid.
import { completeTicketFrom, ticketErrors, type TicketState } from './ticket-state';

export interface ResumeInput {
  authenticated: boolean;
  /** The visitor asked to pay before logging in (see markSubmitAfterLogin). */
  submitPending: boolean;
  /** The stored ticket draft, as read from sessionStorage (untrusted). */
  draft: unknown;
}

/** Where to go once logged in: the checkout, or null to stay on the form. */
export function resumeAfterLogin({ authenticated, submitPending, draft }: ResumeInput): '/checkout' | null {
  if (!authenticated || !submitPending) return null;
  const ticket = completeTicketFrom(draft);
  return ticket && ticketErrors(ticket).length === 0 ? '/checkout' : null;
}

/** Hebrew message when the browser refuses to keep the ticket, which the checkout page reads. */
export const DRAFT_STORAGE_ERROR =
  'לא הצלחנו לשמור את הטופס בדפדפן — בדקו שחלון גלישה פרטית/חסימת אחסון לא פעילים ונסו שוב';

/**
 * Right after an in-place login: resume with the ticket the visitor just submitted (in memory,
 * not a possibly stale stored draft). It is saved again first, because /checkout reads it from
 * storage; 'storage-error' when that save fails, so the caller stays on the form and says why.
 */
export function resumeWithTicket(
  ticket: TicketState,
  submitPending: boolean,
  save: (t: TicketState) => boolean,
): '/checkout' | 'storage-error' | null {
  const next = resumeAfterLogin({ authenticated: true, submitPending, draft: ticket });
  if (!next) return null;
  return save(ticket) ? next : 'storage-error';
}
