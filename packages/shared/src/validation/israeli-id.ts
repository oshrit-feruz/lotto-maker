/** Left-pads an Israeli ID to its canonical 9 digits; null if it is not 1–9 digits. */
export function normalizeIsraeliId(raw: string): string | null {
  const digits = raw.trim();
  if (!/^\d{1,9}$/.test(digits)) return null;
  return digits.padStart(9, '0');
}

/**
 * Israeli ID check digit: weight the 9 digits 1,2,1,2,…; a two-digit product
 * counts as the sum of its digits; the total must be divisible by 10.
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
