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
