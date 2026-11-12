/**
 * Israeli mobile number to E.164, as POST /auth/send-otp expects (+972…).
 * Accepts 05X-XXXXXXX, 5XXXXXXXX, 972…, +972…. Null when it is not a mobile number.
 */
export function toE164IsraeliMobile(raw: string): string | null {
  let d = raw.replace(/[\s\-()]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('972')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  // Israeli mobiles: 5X followed by 7 digits
  if (!/^5\d{8}$/.test(d)) return null;
  return `+972${d}`;
}

/**
 * An E.164 Israeli number in local form: "+972501234567" → "050-1234567", "+97221234567" →
 * "02-1234567". Anything else comes back unchanged.
 */
export function formatPhoneLocal(phone: string | null | undefined): string {
  if (!phone) return '';
  const m = /^\+?972(\d{8,9})$/.exec(phone.replace(/[\s\-()]/g, ''));
  if (!m) return phone;
  const national = `0${m[1]}`;
  const cut = national.length === 10 ? 3 : 2;
  return `${national.slice(0, cut)}-${national.slice(cut)}`;
}
