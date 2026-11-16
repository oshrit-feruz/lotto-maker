/**
 * The operator login sends `audience: 'operator'`, so the backend issues an operator token even
 * when the phone is also a customer or an admin, and answers 403 NOT_AN_OPERATOR when the phone
 * has no active operator.
 */
export const verifyOtpBody = (phone: string, code: string) => ({ phone, code, audience: 'operator' as const });

export const DEFAULT_VERIFY_ERROR = 'קוד שגוי. נסה שנית.';

const VERIFY_ERRORS: Record<string, string> = {
  NOT_AN_OPERATOR: 'המספר הזה לא רשום כמפעיל',
  OTP_EXPIRED: 'תוקף הקוד פג. שלח קוד חדש.',
  RATE_LIMITED: 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.',
};

/** The Hebrew text for a failed verify-otp call (a ky HTTPError carries the `response`). */
export async function verifyErrorMessage(err: unknown): Promise<string> {
  const res = (err as { response?: unknown } | null)?.response;
  if (!(res instanceof Response)) return DEFAULT_VERIFY_ERROR;
  try {
    const { error } = (await res.clone().json()) as { error?: unknown };
    if (typeof error === 'string' && Object.prototype.hasOwnProperty.call(VERIFY_ERRORS, error)) return VERIFY_ERRORS[error]!;
  } catch {
    /* not JSON */
  }
  return DEFAULT_VERIFY_ERROR;
}
