import { formatShekel, toAmount } from './format';
import type { WithdrawalQuote } from './types';

export type WithdrawalMethod = 'card' | 'bank';

/** Wait this long after the last keystroke before asking for a quote. */
export const QUOTE_DEBOUNCE_MS = 400;

const AMOUNT = /^\d+(\.\d{1,2})?$/;
/** The quote route's upper bound (wallet.routes.ts). */
const MAX_QUOTE_AMOUNT = 100_000;

/**
 * Proxy path for GET /wallet/withdrawals/quote, or null while the amount is not a valid
 * positive sum with at most two decimals (then nothing is asked).
 */
export function quotePath(amount: string, method: WithdrawalMethod): string | null {
  const a = amount.trim();
  if (!AMOUNT.test(a)) return null;
  const n = Number(a);
  if (!(n > 0) || n > MAX_QUOTE_AMOUNT) return null;
  return `wallet/withdrawals/quote?${new URLSearchParams({ amount: a, method }).toString()}`;
}

/** True when `quote` was given for this amount and method (and is not a stale answer). */
export function quoteMatches(quote: WithdrawalQuote | null, amount: string, method: WithdrawalMethod): boolean {
  if (!quote || quote.method !== method) return false;
  const a = toAmount(amount.trim());
  const q = toAmount(quote.amount);
  return a !== null && q !== null && Math.round(a * 100) === Math.round(q * 100);
}

export interface QuoteDisplay {
  lines: { label: string; value: string }[];
  /** Why the request would be refused, or null. */
  problem: string | null;
  /** False when the backend would refuse this amount (below the minimum, or the fee eats it all). */
  canSubmit: boolean;
}

/** What the withdrawal form shows for a quote: fee, net amount and minimum. */
export function describeQuote(q: WithdrawalQuote): QuoteDisplay {
  const fee = toAmount(q.fee) ?? 0;
  const lines = [
    { label: 'סכום המשיכה', value: formatShekel(q.amount) },
    { label: q.method === 'bank' ? 'עמלת העברה בנקאית' : 'עמלה', value: fee > 0 ? formatShekel(q.fee) : 'ללא עמלה' },
    { label: 'תקבלו', value: formatShekel(q.net) },
  ];
  let problem: string | null = null;
  if (q.belowMinimum) {
    const amount = toAmount(q.amount) ?? 0;
    const min = toAmount(q.min) ?? 0;
    problem =
      amount < min
        ? `הסכום המינימלי למשיכה הוא ${formatShekel(q.min)}.`
        : `הסכום אינו מכסה את העמלה (${formatShekel(q.fee)}). הגדילו את הסכום או בחרו משיכה לכרטיס.`;
  }
  return { lines, problem, canSubmit: !q.belowMinimum };
}
