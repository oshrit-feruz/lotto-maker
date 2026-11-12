/**
 * True when `typed` is exactly four digits equal to the claimant's known last 4.
 * An unknown expected value is never valid: without it the ID cannot be checked.
 */
export function isIdLast4Valid(typed: string, expected: string | null | undefined): boolean {
  if (!expected || !/^\d{4}$/.test(typed)) return false;
  return typed === expected;
}
