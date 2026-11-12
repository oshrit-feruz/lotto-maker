// Israeli ID number (teudat zehut) check digit. The shared package has no
// validator, so this mirrors isValidIsraeliId in packages/backend/src/lib/crypto.ts;
// the backend validates again on POST /me/kyc (400 INVALID_ID_NUMBER).

/** Left-pads to 9 digits. Null when the input is not 1-9 digits (spaces/dashes are ignored). */
export function normalizeIsraeliId(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{1,9}$/.test(digits)) return null;
  return digits.padStart(9, '0');
}

/**
 * Weights 1,2,1,2,… over the 9 digits; a two-digit product counts as the sum
 * of its digits; the total must divide by 10. All zeros is rejected.
 */
export function isValidIsraeliId(raw: string): boolean {
  const id = normalizeIsraeliId(raw);
  if (!id || id === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const product = Number(id[i]) * ((i % 2) + 1);
    sum += product > 9 ? product - 9 : product;
  }
  return sum % 10 === 0;
}
