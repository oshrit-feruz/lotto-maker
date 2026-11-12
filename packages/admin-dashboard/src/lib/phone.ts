/** Accepts 05X-XXXXXXX or +9725XXXXXXXX and returns E.164. */
export function toE164(input: string): string {
  const d = input.replace(/[\s-]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('0')) return `+972${d.slice(1)}`;
  return `+${d}`;
}

/** The user search needs at least this many national digits (after 0 / 972 / +972). */
export const MIN_PHONE_SEARCH_DIGITS = 3;

/** The national digits of a typed phone, as the backend reads them for the user search. */
export function nationalDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const national = digits.startsWith('972') ? digits.slice(3) : digits;
  return national.replace(/^0+/, '');
}

export const PHONE_SEARCH_HINT = 'יש להזין לפחות 3 ספרות של מספר טלפון ישראלי, למשל 050-123';
