// Hebrew labels for the backend's enum values (packages/backend/prisma/schema.prisma) and audit
// actions. Every lookup falls back to the raw value, so a value added on the backend later still shows.
import type { CardCreditStatus, ClaimStatus, DrawStatus } from '../api/types';
import { WITHDRAWAL_STATUS_LABEL } from './withdrawals';

/**
 * `map[key]` only when the map itself has that key, so `constructor`, `__proto__` and the like never
 * return an inherited Object.prototype value.
 */
function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

/** `map[value]`, or the raw value when it has no label. */
export function labelOf(map: Record<string, string>, value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return own(map, value) ?? value;
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'ממתינה',
  in_queue: 'בתור',
  keyed: 'הוקלדה',
  scanned: 'נסרקה',
  won: 'זכתה',
  lost: 'לא זכתה',
  refunded: 'הוחזרה',
  results_delayed: 'תוצאות מתעכבות',
  cancelled: 'בוטלה',
};

export const TX_TYPE_LABEL: Record<string, string> = {
  deposit: 'הפקדה',
  charge: 'חיוב',
  refund: 'החזר',
  winning: 'זכייה',
  refund_reversal: 'ביטול החזר',
  withdrawal_hold: 'משיכה (הקפאה)',
  withdrawal_release: 'שחרור משיכה',
  // Not a WalletTransactionType today; kept so older or mocked data reads in Hebrew too.
  withdrawal: 'משיכה',
};

export const DRAW_STATUS_LABEL: Record<DrawStatus, string> = {
  scheduled: 'מתוזמנת',
  results_suggested: 'תוצאות מוצעות',
  results_confirmed: 'תוצאות אושרו',
  settled: 'שולמה',
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  awaiting_pickup: 'ממתין לאיסוף',
  scheduled: 'נקבע מועד',
  collected: 'נאסף',
  expired: 'פג תוקף',
};

export const CARD_CREDIT_STATUS_LABEL: Record<CardCreditStatus, string> = {
  pending: 'ממתין',
  processing: 'בזיכוי כעת',
  paid: 'שולם',
  failed: 'נכשל',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'ממתין',
  approved: 'אושר',
  failed: 'נכשל',
  refunded: 'הוחזר',
};

export const QUEUE_SLOT_STATUS_LABEL: Record<string, string> = {
  waiting: 'ממתינה',
  in_progress: 'בטיפול',
  done: 'הושלמה',
  failed: 'נכשלה',
};

export const KYC_STATUS_LABEL: Record<string, string> = {
  verified: 'אומת',
  rejected: 'נדחה',
  manual_review: 'בבדיקה ידנית',
};

export const USER_STATUS_LABEL: Record<string, string> = { active: 'פעיל', suspended: 'מושעה' };

export const ACTOR_TYPE_LABEL: Record<string, string> = {
  user: 'לקוח',
  operator: 'מפעיל',
  admin: 'מנהל',
  system: 'מערכת',
};

/** Audit `entityType` values, which are also the prefixes of most actions. */
export const ENTITY_LABEL: Record<string, string> = {
  user: 'משתמש',
  draw: 'הגרלה',
  order: 'הזמנה',
  queue_slot: 'משבצת תור',
  wallet: 'ארנק',
  payment: 'תשלום',
  withdrawal: 'משיכה',
  card_credit: 'זיכוי כרטיס',
  prize_claim: 'זכייה לאיסוף',
  kyc: 'אימות זהות',
  saved_card: 'כרטיס שמור',
};

/** Action prefixes that are not entity types. */
const ACTION_PREFIX_LABEL: Record<string, string> = {
  ...ENTITY_LABEL,
  status_change: 'הזמנה',
  slot_status_change: 'משבצת תור',
  limits: 'מגבלות',
  self_exclusion: 'החרגה עצמית',
};

/** The statuses in a `prefix:from->to` action, per prefix. */
const STATUS_BY_PREFIX: Record<string, Record<string, string>> = {
  draw: DRAW_STATUS_LABEL,
  order: ORDER_STATUS_LABEL,
  status_change: ORDER_STATUS_LABEL,
  slot_status_change: QUEUE_SLOT_STATUS_LABEL,
  queue_slot: QUEUE_SLOT_STATUS_LABEL,
  payment: PAYMENT_STATUS_LABEL,
  withdrawal: WITHDRAWAL_STATUS_LABEL,
  card_credit: { ...CARD_CREDIT_STATUS_LABEL, paid_manual: 'שולם ידנית' },
  prize_claim: CLAIM_STATUS_LABEL,
  kyc: KYC_STATUS_LABEL,
  user: USER_STATUS_LABEL,
};

/** Every fixed action string the backend writes (grep `action:` in packages/backend/src). */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'draw:results_suggested': 'תוצאות הגרלה הוצעו',
  'draw:results_edited': 'עריכת תוצאות הגרלה',
  'draw:results_confirmed': 'אישור תוצאות הגרלה',
  'draw:settled': 'סילוק הגרלה',
  'user:suspended': 'השעיית משתמש',
  'user:unsuspended': 'ביטול השעיית משתמש',
  'limits:updated': 'עדכון מגבלות',
  'self_exclusion:set': 'הפעלת החרגה עצמית',
  'self_exclusion:lifted': 'ביטול החרגה עצמית',
  'wallet:deposit': 'הפקדה לארנק',
  'wallet:charge': 'חיוב ארנק',
  'wallet:refund': 'החזר לארנק',
  'wallet:refund_reversal': 'ביטול החזר בארנק',
  'wallet:winning': 'זיכוי זכייה בארנק',
  'wallet:withdrawal_release': 'שחרור הקפאת משיכה',
  'withdrawal:requested': 'בקשת משיכה',
  'withdrawal:payout_error': 'שגיאה בתשלום משיכה',
  'withdrawal:paid_conflict': 'התנגשות בסימון משיכה כשולמה',
  'withdrawal:bank_details_viewed': 'צפייה בפרטי הבנק של משיכה',
  'card_credit:paid_conflict': 'התנגשות בתשלום זיכוי כרטיס',
  'card_credit:pending->paid_manual': 'זיכוי כרטיס סומן כשולם ידנית',
  'prize_claim:collect_id_mismatch': 'מסירת זכייה: ת״ז לא תואמת',
  'payment:checkout_created': 'נוצר דף תשלום',
  'payment:rejected_responsible_gaming': 'תשלום נדחה: מגבלת הימור אחראי',
  'payment:rejected_wallet_cap': 'תשלום נדחה: תקרת ארנק',
  'payment:chargeback_shortfall': 'ביטול עסקה: חוסר ביתרה',
  'payment:refund_failed': 'החזר תשלום נכשל',
  'saved_card:deactivated': 'השבתת כרטיס שמור',
  kyc_approved: 'אימות זהות אושר',
  kyc_verified: 'אימות זהות: אומת',
  kyc_rejected: 'אימות זהות: נדחה',
  kyc_manual_review: 'אימות זהות: לבדיקה ידנית',
  'kyc_rejected:underage': 'אימות זהות נדחה: מתחת לגיל 18',
  'kyc:list': 'צפייה בתור אימות הזהות',
};

/**
 * An audit action in Hebrew. Fixed actions come from the map; transitions such as
 * `withdrawal:requested->approved` or `status_change:pending->in_queue` read
 * "משיכה: ממתינה לאישור ← אושרה"; `prefix:status` reads "prefix: status". Anything else is raw.
 */
export function auditActionLabel(action: string): string {
  const fixed = own(AUDIT_ACTION_LABEL, action);
  if (fixed !== undefined) return fixed;
  const sep = action.indexOf(':');
  if (sep < 0) return action;
  const prefix = action.slice(0, sep);
  const rest = action.slice(sep + 1);
  const entity = own(ACTION_PREFIX_LABEL, prefix);
  if (!entity) return action;
  const statuses = own(STATUS_BY_PREFIX, prefix) ?? {};
  const st = (s: string) => labelOf(statuses, s);
  const arrow = rest.indexOf('->');
  if (arrow >= 0) {
    const from = rest.slice(0, arrow);
    const to = rest.slice(arrow + 2);
    return from ? `${entity}: ${st(from)} ← ${st(to)}` : `${entity}: ${st(to)}`;
  }
  const status = own(statuses, rest);
  return status !== undefined ? `${entity}: ${status}` : action;
}
