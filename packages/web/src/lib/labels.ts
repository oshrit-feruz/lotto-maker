import { ORDER_STATUS_LABELS, type OrderStatus } from '@lotto-maker/shared';
import type { WithdrawalStatus } from './types';

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

export function orderStatusTone(status: string): '' | 'badge-won' | 'badge-bad' {
  if (status === 'won') return 'badge-won';
  if (status === 'cancelled' || status === 'refunded' || status === 'results_delayed') return 'badge-bad';
  return '';
}

export const TX_TYPE_LABELS: Record<string, string> = {
  deposit: 'טעינה',
  charge: 'חיוב הזמנה',
  refund: 'החזר',
  winning: 'זכייה',
  refund_reversal: 'ביטול טעינה',
  withdrawal: 'משיכה',
  withdrawal_hold: 'משיכה (בהמתנה)',
  withdrawal_release: 'שחרור משיכה',
};

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  requested: 'ממתינה לאישור',
  approved: 'אושרה',
  rejected: 'נדחתה',
  paid: 'שולמה',
  failed: 'נכשלה',
  cancelled: 'בוטלה',
};

export const PRIZE_CLAIM_STATUS_LABELS: Record<string, string> = {
  awaiting_pickup: 'ממתינה לתיאום איסוף',
  scheduled: 'נקבע מועד איסוף',
  collected: 'נאסף',
  expired: 'פג תוקף',
};

export const PRIZE_TIER_GAME_LABELS: Record<string, string> = {
  lotto: 'לוטו',
  double: 'דאבל',
  extra: 'אקסטרה',
};
