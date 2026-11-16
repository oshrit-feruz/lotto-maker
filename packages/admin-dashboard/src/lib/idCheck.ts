/**
 * True when `typed` is exactly four digits. The dashboard never knows the claimant's digits; the
 * server compares them on collect (422 ID_MISMATCH, or ID_NOT_ON_FILE without a verified ID).
 */
export function isIdLast4Format(typed: string): boolean {
  return /^\d{4}$/.test(typed);
}
