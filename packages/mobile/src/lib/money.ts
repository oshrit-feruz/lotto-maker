/**
 * Wallet history amounts. The API sends the type and an amount; the amount is
 * normally a positive magnitude, but a negative one is a debit whatever the type.
 */

export type TxDirection = 'credit' | 'debit' | null;

const CREDIT_TYPES = new Set(['deposit', 'winning', 'refund', 'withdrawal_release']);
const DEBIT_TYPES = new Set(['charge', 'refund_reversal', 'withdrawal_hold']);

export function txDirection(type: string, amount: string | number): TxDirection {
  const n = Number(amount);
  if (Number.isFinite(n) && n < 0) return 'debit';
  if (DEBIT_TYPES.has(type)) return 'debit';
  if (CREDIT_TYPES.has(type)) return 'credit';
  return null;
}

/** "+₪14.50", "-₪14.50", or "₪14.50" for a type we do not know. The sign appears once. */
export function formatTxAmount(type: string, amount: string | number): string {
  const n = Number(amount);
  const magnitude = Number.isFinite(n) ? Math.abs(n).toFixed(2) : String(amount).replace(/^[-+]/, '');
  const direction = txDirection(type, amount);
  let sign = '';
  if (direction === 'credit') sign = '+';
  else if (direction === 'debit') sign = '-';
  return `${sign}₪${magnitude}`;
}
