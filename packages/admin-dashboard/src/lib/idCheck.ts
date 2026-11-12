/** True when `typed` is exactly four digits and, if the claimant's last 4 are known, equal to them. */
export function isIdLast4Valid(typed: string, expected: string | null | undefined): boolean {
  if (!/^\d{4}$/.test(typed)) return false;
  return expected ? typed === expected : true;
}
