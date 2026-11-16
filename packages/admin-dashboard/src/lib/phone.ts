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

/**
 * An E.164 Israeli number in local form: `+972501234567` → `050-1234567`, `+97221234567` →
 * `02-1234567`. Anything else is returned unchanged.
 */
export function formatPhoneLocal(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/[\s-]/g, '');
  const m = /^\+972(\d{8,9})$/.exec(digits);
  if (!m) return phone;
  const national = `0${m[1]}`;
  const prefix = national.length === 10 ? 3 : 2;
  return `${national.slice(0, prefix)}-${national.slice(prefix)}`;
}
