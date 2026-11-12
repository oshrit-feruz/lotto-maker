// Lotto ticket facts, from pais.co.il (checked 2026-11-12).

export type TicketType = 'regular' | 'double';

export const LOTTO_NUMBER_MAX = 37;
export const LOTTO_STRONG_MAX = 7;
/** Numbers in one plain (non-systematic) table. */
export const LOTTO_PICK_COUNT = 6;
export const EXTRA_DIGIT_COUNT = 6;
export const EXTRA_DIGIT_MAX = 7;
export const MAX_DRAW_COUNT = 10;

export interface TicketTypeLimits {
  minTables: number;
  maxTables: number;
  /** Tables on a form must come in pairs. */
  evenTablesOnly: boolean;
}

export const TICKET_TYPE_LIMITS: Record<TicketType, TicketTypeLimits> = {
  regular: { minTables: 2, maxTables: 14, evenTablesOnly: true },
  double: { minTables: 2, maxTables: 10, evenTablesOnly: true },
};

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  regular: 'לוטו רגיל',
  double: 'לוטו כפול',
};
